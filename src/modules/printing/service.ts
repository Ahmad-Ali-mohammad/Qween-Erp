import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { prisma } from '../../config/database';
import { env } from '../../config/env';
import { getStoredFileDownload } from '../../services/file-storage';
import { Errors } from '../../utils/response';
import { defaultDocumentTemplates, printingEntityTypes, type DefaultDocumentTemplate, type PrintingEntityType } from './defaults';
import { buildPrintingStorageKey, savePrintingFile } from './storage';

type TemplatePayload = {
  key: string;
  entityType: PrintingEntityType;
  nameAr: string;
  nameEn?: string;
  branchId?: number | null;
  format?: string;
  isDefault?: boolean;
  isActive?: boolean;
  version?: number;
  content: string;
  sampleData?: Record<string, unknown>;
};

type ExportFormat = 'pdf' | 'xlsx';

type StoredPrintPayload = {
  kind: 'stored';
  entityType: string;
  recordId: number;
  templateId?: number;
  templateKey?: string;
  format: ExportFormat;
};

type PreviewPrintPayload = {
  kind: 'preview';
  entityType: string;
  content: string;
  sampleData?: Record<string, unknown>;
  format: ExportFormat;
};

type PrintJobPayload = StoredPrintPayload | PreviewPrintPayload;

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue;
}

function assertEntityType(value: string): PrintingEntityType {
  if ((printingEntityTypes as readonly string[]).includes(value)) {
    return value as PrintingEntityType;
  }

  throw Errors.validation(`Unsupported template entity type: ${value}`);
}

function toNumber(value: unknown): number {
  return Number(value ?? 0);
}

function money(value: unknown): string {
  return toNumber(value).toLocaleString('en-US', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3
  });
}

function quantity(value: unknown): string {
  return toNumber(value).toLocaleString('en-US', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3
  });
}

function dateLabel(value: Date | string | null | undefined): string {
  if (!value) return '';
  return new Intl.DateTimeFormat(env.appLocale, {
    dateStyle: 'medium',
    timeZone: env.appTimezone
  }).format(new Date(value));
}

function dateTimeLabel(value: Date | string | null | undefined): string {
  if (!value) return '';
  return new Intl.DateTimeFormat(env.appLocale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: env.appTimezone
  }).format(new Date(value));
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function resolvePath(source: unknown, path: string): unknown {
  if (!path) return source;
  return path.split('.').reduce<unknown>((current, segment) => {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    return (current as Record<string, unknown>)[segment];
  }, source);
}

function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function renderTemplateContent(content: string, context: Record<string, unknown>): string {
  const withLoops = content.replace(/{{#each\s+([\w.]+)}}([\s\S]*?){{\/each}}/g, (_match, path, inner) => {
    const list = resolvePath(context, String(path));
    if (!Array.isArray(list) || !list.length) return '';

    return list
      .map((item, index) =>
        renderTemplateContent(inner, {
          ...context,
          ...(typeof item === 'object' && item ? (item as Record<string, unknown>) : { value: item }),
          this: item,
          index: index + 1
        })
      )
      .join('');
  });

  return withLoops.replace(/{{\s*([\w.]+)\s*}}/g, (_match, path) => {
    const value = resolvePath(context, String(path));
    return escapeHtml(stringifyValue(value));
  });
}

function getDefaultTemplate(entityType: PrintingEntityType): DefaultDocumentTemplate {
  const template = defaultDocumentTemplates.find((entry) => entry.entityType === entityType);
  if (!template) throw Errors.notFound(`No default template found for ${entityType}`);
  return template;
}

async function ensureBranch(branchId?: number | null) {
  if (!branchId) return null;
  const branch = await prisma.branch.findUnique({ where: { id: branchId } });
  if (!branch) throw Errors.validation('Branch not found');
  return branch;
}

async function normalizeTemplateDefaults(entityType: PrintingEntityType, branchId?: number | null, excludeId?: number) {
  await prisma.documentTemplate.updateMany({
    where: {
      entityType,
      branchId: branchId ?? null,
      isDefault: true,
      ...(excludeId ? { NOT: { id: excludeId } } : {})
    },
    data: {
      isDefault: false
    }
  });
}

async function buildCompanyContext() {
  const company = await prisma.companyProfile.findUnique({ where: { id: 1 } });
  return {
    nameAr: company?.nameAr ?? 'ERP Qween',
    nameEn: company?.nameEn ?? null,
    currency: company?.currency ?? env.baseCurrency,
    timezone: company?.timezone ?? env.appTimezone,
    locale: company?.locale ?? env.appLocale
  };
}

async function buildProjectContext(recordId: number) {
  const [project, company] = await Promise.all([
    prisma.project.findUnique({
      where: { id: recordId },
      include: {
        branch: true,
        site: true,
        contract: true,
        phases: { orderBy: [{ sequence: 'asc' }, { id: 'asc' }] },
        budgets: true,
        expenses: true
      }
    }),
    buildCompanyContext()
  ]);

  if (!project) throw Errors.notFound('Project not found');

  const totalBudget = project.budgets.reduce((sum, row) => {
    const approved = Number(row.approvedAmount ?? 0);
    const baseline = Number(row.baselineAmount ?? 0);
    return sum + (approved > 0 ? approved : baseline);
  }, 0);
  const totalActualCost =
    project.expenses.reduce((sum, row) => sum + Number(row.amount ?? 0), 0) + Number(project.actualCost ?? 0);
  const totalVariance = totalBudget - totalActualCost;

  return {
    entityType: 'project',
    recordId: project.id,
    branchId: project.branchId ?? null,
    company,
    branch: project.branch
      ? { id: project.branch.id, code: project.branch.code, nameAr: project.branch.nameAr }
      : { id: null, code: '', nameAr: 'Unassigned branch' },
    document: {
      id: project.id,
      code: project.code,
      name: project.nameEn || project.nameAr,
      nameAr: project.nameAr,
      status: project.status,
      dateDisplay: dateLabel(project.updatedAt),
      siteName: project.site?.nameAr ?? '',
      contractNumber: project.contract?.number ?? ''
    },
    summary: {
      totalBudgetDisplay: money(totalBudget),
      actualCostDisplay: money(totalActualCost),
      varianceDisplay: money(totalVariance)
    },
    phases: project.phases.map((phase) => ({
      id: phase.id,
      name: phase.nameAr,
      status: phase.status,
      budgetDisplay: money(Number(phase.budget ?? 0)),
      actualCostDisplay: money(Number(phase.actualCost ?? 0))
    })),
    generatedAt: dateTimeLabel(new Date())
  };
}

async function buildPurchaseOrderContext(recordId: number) {
  const [order, company] = await Promise.all([
    prisma.purchaseOrder.findUnique({
      where: { id: recordId },
      include: {
        branch: true,
        project: true,
        lines: true
      }
    }),
    buildCompanyContext()
  ]);

  if (!order) throw Errors.notFound('Purchase order not found');

  const supplier = order.supplierId ? await prisma.supplier.findUnique({ where: { id: order.supplierId } }) : null;

  return {
    entityType: 'purchase_order',
    recordId: order.id,
    branchId: order.branchId ?? null,
    company,
    branch: order.branch
      ? { id: order.branch.id, code: order.branch.code, nameAr: order.branch.nameAr }
      : { id: null, code: '', nameAr: 'Unassigned branch' },
    supplier: { id: supplier?.id ?? null, name: supplier?.nameEn || supplier?.nameAr || 'Unassigned supplier' },
    project: { id: order.project?.id ?? null, name: order.project?.nameEn || order.project?.nameAr || 'General procurement' },
    document: {
      id: order.id,
      number: order.number,
      status: order.status,
      dateDisplay: dateLabel(order.date),
      expectedDateDisplay: dateLabel(order.expectedDate),
      subtotalDisplay: money(order.subtotal),
      discountDisplay: money(order.discount),
      taxAmountDisplay: money(order.taxAmount),
      totalDisplay: money(order.total),
      notes: order.notes ?? ''
    },
    lines: order.lines.map((line, index) => ({
      index: index + 1,
      description: line.description || `Line ${index + 1}`,
      quantityDisplay: quantity(line.quantity),
      unitPriceDisplay: money(line.unitPrice),
      discountDisplay: money(line.discount),
      totalDisplay: money(line.total)
    })),
    generatedAt: dateTimeLabel(new Date())
  };
}

async function buildInvoiceContext(recordId: number) {
  const [invoice, company] = await Promise.all([
    prisma.invoice.findUnique({
      where: { id: recordId },
      include: {
        customer: true,
        supplier: true,
        project: true,
        lines: { orderBy: { lineNumber: 'asc' } }
      }
    }),
    buildCompanyContext()
  ]);

  if (!invoice) throw Errors.notFound('Invoice not found');

  const partyName =
    invoice.type === 'SALES'
      ? invoice.customer?.nameEn || invoice.customer?.nameAr || 'Customer'
      : invoice.supplier?.nameEn || invoice.supplier?.nameAr || 'Supplier';

  return {
    entityType: 'invoice',
    recordId: invoice.id,
    branchId: invoice.project?.branchId ?? null,
    company,
    branch: invoice.project?.branchId
      ? await prisma.branch.findUnique({ where: { id: invoice.project.branchId } })
      : { id: null, code: '', nameAr: 'Unassigned branch' },
    party: { name: partyName },
    project: { id: invoice.project?.id ?? null, name: invoice.project?.nameEn || invoice.project?.nameAr || 'No linked project' },
    document: {
      id: invoice.id,
      title: invoice.type === 'SALES' ? 'Sales Invoice' : 'Purchase Invoice',
      number: invoice.number,
      status: invoice.status,
      dateDisplay: dateLabel(invoice.date),
      dueDateDisplay: dateLabel(invoice.dueDate),
      subtotalDisplay: money(invoice.subtotal),
      vatAmountDisplay: money(invoice.vatAmount),
      totalDisplay: money(invoice.total)
    },
    lines: invoice.lines.map((line) => ({
      lineNumber: line.lineNumber,
      description: line.description,
      quantityDisplay: quantity(line.quantity),
      unitPriceDisplay: money(line.unitPrice),
      taxAmountDisplay: money(line.taxAmount),
      totalDisplay: money(line.total)
    })),
    generatedAt: dateTimeLabel(new Date())
  };
}

async function buildPayrollRunContext(recordId: number) {
  const [run, company] = await Promise.all([
    prisma.payrollRun.findUnique({
      where: { id: recordId },
      include: {
        branch: true,
        lines: {
          include: {
            employee: true
          },
          orderBy: { id: 'asc' }
        }
      }
    }),
    buildCompanyContext()
  ]);

  if (!run) throw Errors.notFound('Payroll run not found');

  return {
    entityType: 'payroll_run',
    recordId: run.id,
    branchId: run.branchId ?? null,
    company,
    branch: run.branch
      ? { id: run.branch.id, code: run.branch.code, nameAr: run.branch.nameAr }
      : { id: null, code: '', nameAr: 'Unassigned branch' },
    document: {
      id: run.id,
      code: run.code,
      status: run.status,
      periodLabel: `${run.month.toString().padStart(2, '0')}/${run.year}`,
      grossTotalDisplay: money(run.grossTotal),
      deductionTotalDisplay: money(run.deductionTotal),
      netTotalDisplay: money(run.netTotal)
    },
    lines: run.lines.map((line) => ({
      employeeName: line.employee.fullName,
      basicSalaryDisplay: money(line.basicSalary),
      allowancesDisplay: money(line.allowances),
      deductionsDisplay: money(line.deductions),
      netSalaryDisplay: money(line.netSalary)
    })),
    generatedAt: dateTimeLabel(new Date())
  };
}

async function buildEntityContext(entityType: PrintingEntityType, recordId: number) {
  switch (entityType) {
    case 'project':
      return buildProjectContext(recordId);
    case 'purchase_order':
      return buildPurchaseOrderContext(recordId);
    case 'invoice':
      return buildInvoiceContext(recordId);
    case 'payroll_run':
      return buildPayrollRunContext(recordId);
    default:
      throw Errors.validation(`Unsupported render entity: ${entityType}`);
  }
}

async function resolveStoredTemplate({
  templateId,
  templateKey,
  entityType,
  branchId
}: {
  templateId?: number;
  templateKey?: string;
  entityType?: PrintingEntityType;
  branchId?: number | null;
}) {
  if (templateId) {
    const template = await prisma.documentTemplate.findUnique({ where: { id: templateId } });
    if (!template) throw Errors.notFound('Template not found');
    return template;
  }

  if (templateKey) {
    const template = await prisma.documentTemplate.findUnique({ where: { key: templateKey } });
    if (!template) throw Errors.notFound('Template not found');
    return template;
  }

  if (entityType) {
    const scopedTemplate = await prisma.documentTemplate.findFirst({
      where: {
        entityType,
        isDefault: true,
        isActive: true,
        branchId: branchId ?? null
      },
      orderBy: { updatedAt: 'desc' }
    });

    if (scopedTemplate) return scopedTemplate;

    const globalTemplate = await prisma.documentTemplate.findFirst({
      where: {
        entityType,
        isDefault: true,
        isActive: true,
        branchId: null
      },
      orderBy: { updatedAt: 'desc' }
    });

    if (globalTemplate) return globalTemplate;
  }

  return null;
}

export async function listDocumentTemplates(filters: { entityType?: string; branchId?: number }) {
  const where: Record<string, unknown> = {};

  if (filters.entityType) where.entityType = assertEntityType(filters.entityType);
  if (filters.branchId) where.branchId = Number(filters.branchId);

  return prisma.documentTemplate.findMany({
    where,
    include: {
      branch: { select: { id: true, code: true, nameAr: true } }
    },
    orderBy: [{ entityType: 'asc' }, { isDefault: 'desc' }, { updatedAt: 'desc' }]
  });
}

export async function getDocumentTemplate(id: number) {
  const template = await prisma.documentTemplate.findUnique({
    where: { id },
    include: {
      branch: { select: { id: true, code: true, nameAr: true } }
    }
  });

  if (!template) throw Errors.notFound('Template not found');
  return template;
}

export function listDefaultTemplateCatalog() {
  return defaultDocumentTemplates.map((template) => ({
    key: template.key,
    entityType: template.entityType,
    nameAr: template.nameAr,
    nameEn: template.nameEn,
    content: template.content,
    sampleData: template.sampleData
  }));
}

export async function bootstrapDefaultTemplates(userId?: number) {
  const results = [];

  for (const template of defaultDocumentTemplates) {
    const existing = await prisma.documentTemplate.findUnique({ where: { key: template.key } });
    if (existing) {
      results.push({ key: template.key, action: 'skipped', id: existing.id });
      continue;
    }

    const created = await prisma.documentTemplate.create({
      data: {
        key: template.key,
        entityType: template.entityType,
        nameAr: template.nameAr,
        nameEn: template.nameEn,
        format: 'HTML',
        isDefault: true,
        isActive: true,
        version: 1,
        content: template.content,
        sampleData: toJsonValue(template.sampleData),
        createdBy: userId ?? null
      }
    });

    results.push({ key: template.key, action: 'created', id: created.id });
  }

  return {
    total: defaultDocumentTemplates.length,
    created: results.filter((row) => row.action === 'created').length,
    skipped: results.filter((row) => row.action === 'skipped').length,
    results
  };
}

export async function createDocumentTemplate(data: TemplatePayload, userId?: number) {
  const entityType = assertEntityType(data.entityType);
  await ensureBranch(data.branchId ?? null);

  if (data.isDefault) {
    await normalizeTemplateDefaults(entityType, data.branchId ?? null);
  }

  return prisma.documentTemplate.create({
    data: {
      key: data.key,
      entityType,
      nameAr: data.nameAr,
      nameEn: data.nameEn,
      branchId: data.branchId ?? null,
      format: data.format ?? 'HTML',
      isDefault: data.isDefault ?? false,
      isActive: data.isActive ?? true,
      version: data.version ?? 1,
      content: data.content,
      sampleData: data.sampleData ? toJsonValue(data.sampleData) : undefined,
      createdBy: userId ?? null
    },
    include: {
      branch: { select: { id: true, code: true, nameAr: true } }
    }
  });
}

export async function updateDocumentTemplate(id: number, data: Partial<TemplatePayload>) {
  const current = await prisma.documentTemplate.findUnique({ where: { id } });
  if (!current) throw Errors.notFound('Template not found');

  const entityType = data.entityType ? assertEntityType(data.entityType) : assertEntityType(current.entityType);
  const branchId = data.branchId === undefined ? current.branchId : data.branchId ?? null;

  await ensureBranch(branchId);

  if (data.isDefault) {
    await normalizeTemplateDefaults(entityType, branchId, id);
  }

  return prisma.documentTemplate.update({
    where: { id },
    data: {
      key: data.key,
      entityType,
      nameAr: data.nameAr,
      nameEn: data.nameEn,
      branchId,
      format: data.format,
      isDefault: data.isDefault,
      isActive: data.isActive,
      version: data.version ? Number(data.version) : undefined,
      content: data.content,
      sampleData: data.sampleData ? toJsonValue(data.sampleData) : undefined
    },
    include: {
      branch: { select: { id: true, code: true, nameAr: true } }
    }
  });
}

export async function deleteDocumentTemplate(id: number) {
  const existing = await prisma.documentTemplate.findUnique({ where: { id } });
  if (!existing) throw Errors.notFound('Template not found');
  await prisma.documentTemplate.delete({ where: { id } });
  return { deleted: true, id };
}

export async function renderStoredDocument(input: {
  entityType: string;
  recordId: number;
  templateId?: number;
  templateKey?: string;
}) {
  const entityType = assertEntityType(input.entityType);
  const context = await buildEntityContext(entityType, Number(input.recordId));
  const storedTemplate = await resolveStoredTemplate({
    templateId: input.templateId,
    templateKey: input.templateKey,
    entityType,
    branchId: context.branchId
  });

  const template = storedTemplate
    ? {
        source: 'stored' as const,
        id: storedTemplate.id,
        key: storedTemplate.key,
        nameAr: storedTemplate.nameAr,
        nameEn: storedTemplate.nameEn,
        content: storedTemplate.content
      }
    : {
        source: 'builtin' as const,
        id: null,
        ...getDefaultTemplate(entityType)
      };

  const html = renderTemplateContent(template.content, context as Record<string, unknown>);

  return {
    entityType,
    recordId: Number(input.recordId),
    template,
    fileName: `${entityType}-${context.recordId}.html`,
    generatedAt: dateTimeLabel(new Date()),
    html,
    context
  };
}

export async function renderDocumentPreview(input: {
  entityType: string;
  content: string;
  sampleData?: Record<string, unknown>;
}) {
  const entityType = assertEntityType(input.entityType);
  const defaultTemplate = getDefaultTemplate(entityType);
  const context = {
    ...(defaultTemplate.sampleData as Record<string, unknown>),
    ...(input.sampleData ?? {}),
    generatedAt: dateTimeLabel(new Date())
  };

  return {
    entityType,
    template: {
      source: 'preview' as const,
      key: defaultTemplate.key
    },
    html: renderTemplateContent(input.content, context),
    context
  };
}

type RenderedPrintableDocument = Awaited<ReturnType<typeof renderStoredDocument>>;
type PreviewPrintableDocument = Awaited<ReturnType<typeof renderDocumentPreview>>;
type PrintableResult = RenderedPrintableDocument | PreviewPrintableDocument;

function printableRecordId(document: PrintableResult): string {
  if ('recordId' in document) {
    return String(document.recordId);
  }

  return 'preview';
}

function printableGeneratedAt(document: PrintableResult): string {
  if ('generatedAt' in document) {
    return String(document.generatedAt);
  }

  return String((document.context as Record<string, unknown>).generatedAt ?? dateTimeLabel(new Date()));
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripHtml(value: string): string {
  return decodeHtmlEntities(value)
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<\/(p|div|section|article|header|footer|li|tr|h1|h2|h3|h4)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\n\s+\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function printableTitle(document: PrintableResult): string {
  const context = document.context as Record<string, any>;
  const documentInfo = (context.document ?? {}) as Record<string, unknown>;

  switch (document.entityType) {
    case 'project':
      return `Project ${String(documentInfo.code ?? printableRecordId(document))}`;
    case 'purchase_order':
      return `Purchase Order ${String(documentInfo.number ?? printableRecordId(document))}`;
    case 'invoice':
      return `${String(documentInfo.title ?? 'Invoice')} ${String(documentInfo.number ?? printableRecordId(document))}`;
    case 'payroll_run':
      return `Payroll Run ${String(documentInfo.code ?? printableRecordId(document))}`;
    default:
      return `Document ${printableRecordId(document)}`;
  }
}

function printableWorksheetRows(document: PrintableResult): { columns: string[]; rows: Array<Array<string | number>> } {
  const context = document.context as Record<string, any>;

  switch (document.entityType) {
    case 'project':
      return {
        columns: ['Phase', 'Status', 'Budget', 'Actual Cost'],
        rows: ((context.phases as Array<Record<string, unknown>>) ?? []).map((phase) => [
          String(phase.name ?? ''),
          String(phase.status ?? ''),
          String(phase.budgetDisplay ?? ''),
          String(phase.actualCostDisplay ?? '')
        ])
      };
    case 'purchase_order':
      return {
        columns: ['Description', 'Quantity', 'Unit Price', 'Discount', 'Total'],
        rows: ((context.lines as Array<Record<string, unknown>>) ?? []).map((line) => [
          String(line.description ?? ''),
          String(line.quantityDisplay ?? ''),
          String(line.unitPriceDisplay ?? ''),
          String(line.discountDisplay ?? ''),
          String(line.totalDisplay ?? '')
        ])
      };
    case 'invoice':
      return {
        columns: ['Description', 'Quantity', 'Unit Price', 'Tax', 'Total'],
        rows: ((context.lines as Array<Record<string, unknown>>) ?? []).map((line) => [
          String(line.description ?? ''),
          String(line.quantityDisplay ?? ''),
          String(line.unitPriceDisplay ?? ''),
          String(line.taxAmountDisplay ?? ''),
          String(line.totalDisplay ?? '')
        ])
      };
    case 'payroll_run':
      return {
        columns: ['Employee', 'Basic', 'Allowances', 'Deductions', 'Net'],
        rows: ((context.lines as Array<Record<string, unknown>>) ?? []).map((line) => [
          String(line.employeeName ?? ''),
          String(line.basicSalaryDisplay ?? ''),
          String(line.allowancesDisplay ?? ''),
          String(line.deductionsDisplay ?? ''),
          String(line.netSalaryDisplay ?? '')
        ])
      };
    default:
      return { columns: ['Value'], rows: [[printableTitle(document)]] };
  }
}

async function buildPdfBuffer(document: PrintableResult): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const pdf = new PDFDocument({
      size: 'A4',
      margin: 42,
      info: {
        Title: printableTitle(document),
        Author: 'ERP Qween'
      }
    });

    pdf.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', reject);

    pdf.fontSize(20).text(printableTitle(document));
    pdf.moveDown(0.5);
    pdf.fontSize(10).fillColor('#475569').text(`Generated At: ${printableGeneratedAt(document)}`);
    pdf.moveDown(1);
    pdf.fillColor('#111827');
    pdf.fontSize(11).text(stripHtml(document.html), {
      align: 'left',
      lineGap: 3
    });

    pdf.end();
  });
}

async function buildWorkbookBuffer(document: PrintableResult): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'ERP Qween';
  workbook.created = new Date();
  workbook.modified = new Date();

  const worksheet = workbook.addWorksheet(document.entityType);
  worksheet.addRow([printableTitle(document)]);
  worksheet.addRow(['Generated At', printableGeneratedAt(document)]);
  worksheet.addRow([]);

  const table = printableWorksheetRows(document);
  worksheet.addRow(table.columns);
  for (const row of table.rows) {
    worksheet.addRow(row);
  }

  const headerRow = worksheet.getRow(4);
  headerRow.font = { bold: true };
  worksheet.columns.forEach((column) => {
    column.width = 20;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
}

async function exportPrintableDocument(document: PrintableResult, format: ExportFormat) {
  const fileBaseName = printableTitle(document)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

  if (format === 'pdf') {
    return {
      fileName: `${fileBaseName || document.entityType}.pdf`,
      contentType: 'application/pdf',
      buffer: await buildPdfBuffer(document)
    };
  }

  return {
    fileName: `${fileBaseName || document.entityType}.xlsx`,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: await buildWorkbookBuffer(document)
  };
}

export async function exportStoredDocument(input: {
  entityType: string;
  recordId: number;
  templateId?: number;
  templateKey?: string;
  format: ExportFormat;
}) {
  const rendered = await renderStoredDocument(input);
  return exportPrintableDocument(rendered, input.format);
}

export async function exportDocumentPreview(input: {
  entityType: string;
  content: string;
  sampleData?: Record<string, unknown>;
  format: ExportFormat;
}) {
  const rendered = await renderDocumentPreview(input);
  return exportPrintableDocument(rendered, input.format);
}

function buildPrintJobKey(): string {
  return `print-${randomUUID()}`;
}

function parsePrintJobPayload(payload: unknown): PrintJobPayload {
  const value = payload as Record<string, unknown> | null;
  if (!value || typeof value !== 'object' || typeof value.kind !== 'string') {
    throw Errors.validation('Invalid print job payload');
  }

  if (value.kind === 'stored') {
    return {
      kind: 'stored',
      entityType: String(value.entityType ?? ''),
      recordId: Number(value.recordId),
      templateId: value.templateId ? Number(value.templateId) : undefined,
      templateKey: value.templateKey ? String(value.templateKey) : undefined,
      format: String(value.format) as ExportFormat
    };
  }

  return {
    kind: 'preview',
    entityType: String(value.entityType ?? ''),
    content: String(value.content ?? ''),
    sampleData: (value.sampleData as Record<string, unknown> | undefined) ?? undefined,
    format: String(value.format) as ExportFormat
  };
}

export async function createStoredPrintJob(
  input: {
    entityType: string;
    recordId: number;
    templateId?: number;
    templateKey?: string;
    format: ExportFormat;
  },
  requestedBy?: number,
  mode: 'INLINE' | 'QUEUED' = 'INLINE'
) {
  const payload: StoredPrintPayload = {
    kind: 'stored',
    entityType: input.entityType,
    recordId: Number(input.recordId),
    templateId: input.templateId,
    templateKey: input.templateKey,
    format: input.format
  };

  return prisma.printJob.create({
    data: {
      jobKey: buildPrintJobKey(),
      entityType: input.entityType,
      recordId: Number(input.recordId),
      templateId: input.templateId ?? null,
      format: input.format,
      mode,
      status: 'PENDING',
      requestedBy: requestedBy ?? null,
      payload: toJsonValue(payload)
    }
  });
}

export async function createPreviewPrintJob(
  input: {
    entityType: string;
    content: string;
    sampleData?: Record<string, unknown>;
    format: ExportFormat;
  },
  requestedBy?: number,
  mode: 'INLINE' | 'QUEUED' = 'INLINE'
) {
  const payload: PreviewPrintPayload = {
    kind: 'preview',
    entityType: input.entityType,
    content: input.content,
    sampleData: input.sampleData,
    format: input.format
  };

  return prisma.printJob.create({
    data: {
      jobKey: buildPrintJobKey(),
      entityType: input.entityType,
      recordId: null,
      templateId: null,
      format: input.format,
      mode,
      status: 'PENDING',
      requestedBy: requestedBy ?? null,
      payload: toJsonValue(payload)
    }
  });
}

async function createAttachmentForPrintJob(
  printJob: { id: number; jobKey: string; requestedBy: number | null },
  file: { fileName: string; contentType: string; buffer: Buffer }
) {
  const storageKey = buildPrintingStorageKey(printJob.jobKey, file.fileName);
  await savePrintingFile(storageKey, file.buffer);

  return prisma.attachment.create({
    data: {
      entityType: 'print_job',
      entityId: printJob.id,
      fileName: file.fileName,
      storageKey,
      mimeType: file.contentType,
      sizeBytes: file.buffer.length,
      metadata: toJsonValue({
        jobKey: printJob.jobKey,
        exportedAt: new Date().toISOString()
      }),
      createdBy: printJob.requestedBy
    }
  });
}

export async function processPrintJob(printJobId: number) {
  const current = await prisma.printJob.findUnique({ where: { id: printJobId } });
  if (!current) throw Errors.notFound('Print job not found');

  if (current.status === 'COMPLETED') {
    return getPrintJob(printJobId);
  }

  await prisma.printJob.update({
    where: { id: printJobId },
    data: {
      status: 'PROCESSING',
      startedAt: new Date(),
      errorMessage: null
    }
  });

  try {
    const payload = parsePrintJobPayload(current.payload);
    const file =
      payload.kind === 'stored'
        ? await exportStoredDocument(payload)
        : await exportDocumentPreview(payload);

    const attachment = await createAttachmentForPrintJob(
      { id: current.id, jobKey: current.jobKey, requestedBy: current.requestedBy ?? null },
      file
    );

    await prisma.printJob.update({
      where: { id: printJobId },
      data: {
        status: 'COMPLETED',
        attachmentId: attachment.id,
        fileName: file.fileName,
        completedAt: new Date()
      }
    });

    return getPrintJob(printJobId);
  } catch (error) {
    await prisma.printJob.update({
      where: { id: printJobId },
      data: {
        status: 'FAILED',
        errorMessage: error instanceof Error ? error.message : String(error),
        completedAt: new Date()
      }
    });

    throw error;
  }
}

export async function listPrintJobs(filters: {
  entityType?: string;
  status?: string;
  requestedBy?: number;
  limit?: number;
}) {
  const take = Math.max(1, Math.min(Number(filters.limit ?? 50), 200));
  const where: Record<string, unknown> = {};

  if (filters.entityType) where.entityType = filters.entityType;
  if (filters.status) where.status = filters.status;
  if (filters.requestedBy) where.requestedBy = filters.requestedBy;

  return prisma.printJob.findMany({
    where,
    include: {
      requester: {
        select: {
          id: true,
          username: true,
          fullName: true
        }
      }
    },
    orderBy: { id: 'desc' },
    take
  });
}

export async function getPrintJob(id: number) {
  const job = await prisma.printJob.findUnique({
    where: { id },
    include: {
      requester: {
        select: {
          id: true,
          username: true,
          fullName: true
        }
      }
    }
  });

  if (!job) throw Errors.notFound('Print job not found');

  const attachment = job.attachmentId
    ? await prisma.attachment.findUnique({
        where: { id: job.attachmentId }
      })
    : null;

  return {
    ...job,
    attachment
  };
}

export async function getPrintAttachmentDownload(attachmentId: number) {
  const attachment = await prisma.attachment.findUnique({ where: { id: attachmentId } });
  if (!attachment || attachment.entityType !== 'print_job') throw Errors.notFound('Print attachment not found');

  return {
    attachment,
    file: await getStoredFileDownload(attachment.storageKey)
  };
}
