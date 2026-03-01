import fs from 'fs/promises';
import path from 'path';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { Errors } from '../../utils/response';

type DemoMonthPlan = {
  period: string;
  sales: number;
  expenses: number;
  draftEntries: number;
  pendingPayments: number;
  openTasks: number;
  openTickets: number;
  pendingLeaves: number;
};

type DemoDataFile = {
  version: string;
  currency: string;
  years: number[];
  customersCount: number;
  suppliersCount: number;
  itemsCount: number;
  assetsCount: number;
  monthly: DemoMonthPlan[];
};

type ImportSummary = {
  customers: number;
  suppliers: number;
  items: number;
  assets: number;
  invoices: number;
  payments: number;
  journals: number;
  tasks: number;
  tickets: number;
  leaves: number;
};

const DEMO_DATA_PATH = path.join(process.cwd(), 'data', 'demo-data-3y.json');

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function toMonthKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function firstUtcDay(year: number, month: number) {
  return new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
}

function lastUtcDay(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0, 23, 59, 59));
}

function midUtcDay(year: number, month: number, day = 15) {
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

function parsePeriod(period: string) {
  const raw = String(period || '');
  const match = raw.match(/^(\d{4})-(\d{2})$/);
  if (!match) throw Errors.validation(`صيغة الفترة غير صحيحة: ${period}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) throw Errors.validation(`رقم الشهر غير صالح: ${period}`);
  return { year, month };
}

function roundAmount(value: number) {
  return Math.round(value * 100) / 100;
}

function buildDefaultDemoData(baseYear: number): DemoDataFile {
  const rand = mulberry32(baseYear * 73 + 19);
  const years = [baseYear, baseYear + 1, baseYear + 2];
  const monthly: DemoMonthPlan[] = [];

  for (const year of years) {
    for (let month = 1; month <= 12; month += 1) {
      const idx = (year - baseYear) * 12 + (month - 1);
      const season = 0.9 + (Math.sin((month / 12) * Math.PI * 2) + 1) * 0.15;
      const trend = 1 + idx * 0.018;
      const sales = roundAmount(52000 * season * trend + rand() * 9000);
      const expenseFactor = 0.57 + rand() * 0.18;
      const expenses = roundAmount(sales * expenseFactor);

      monthly.push({
        period: toMonthKey(year, month),
        sales,
        expenses,
        draftEntries: 1 + Math.floor(rand() * 4),
        pendingPayments: 1 + Math.floor(rand() * 3),
        openTasks: 1 + Math.floor(rand() * 5),
        openTickets: 1 + Math.floor(rand() * 4),
        pendingLeaves: rand() > 0.55 ? 1 : 0
      });
    }
  }

  return {
    version: '1.0.0',
    currency: 'SAR',
    years,
    customersCount: 18,
    suppliersCount: 12,
    itemsCount: 24,
    assetsCount: 30,
    monthly
  };
}

function normalizeDemoData(raw: unknown): DemoDataFile {
  if (!raw || typeof raw !== 'object') throw Errors.validation('ملف البيانات التجريبية غير صالح');
  const obj = raw as Partial<DemoDataFile>;
  if (!Array.isArray(obj.years) || obj.years.length !== 3) {
    throw Errors.validation('ملف البيانات يجب أن يحتوي على 3 سنوات');
  }
  if (!Array.isArray(obj.monthly) || obj.monthly.length < 12) {
    throw Errors.validation('ملف البيانات لا يحتوي على خطط شهرية كافية');
  }

  const years = obj.years.map((y) => Number(y)).filter((y) => Number.isInteger(y) && y > 2000);
  if (years.length !== 3) throw Errors.validation('السنوات في الملف غير صالحة');

  const monthly = obj.monthly.map((m) => {
    const item = m as Partial<DemoMonthPlan>;
    parsePeriod(String(item.period || ''));
    return {
      period: String(item.period),
      sales: Number(item.sales || 0),
      expenses: Number(item.expenses || 0),
      draftEntries: Math.max(0, Number(item.draftEntries || 0)),
      pendingPayments: Math.max(0, Number(item.pendingPayments || 0)),
      openTasks: Math.max(0, Number(item.openTasks || 0)),
      openTickets: Math.max(0, Number(item.openTickets || 0)),
      pendingLeaves: Math.max(0, Number(item.pendingLeaves || 0))
    };
  });

  return {
    version: String(obj.version || '1.0.0'),
    currency: String(obj.currency || 'SAR'),
    years,
    customersCount: Math.max(3, Number(obj.customersCount || 12)),
    suppliersCount: Math.max(2, Number(obj.suppliersCount || 8)),
    itemsCount: Math.max(3, Number(obj.itemsCount || 12)),
    assetsCount: Math.max(2, Number(obj.assetsCount || 10)),
    monthly
  };
}

export async function ensureDemoDataFile(): Promise<DemoDataFile> {
  try {
    const content = await fs.readFile(DEMO_DATA_PATH, 'utf8');
    return normalizeDemoData(JSON.parse(content));
  } catch {
    const baseYear = new Date().getUTCFullYear() - 2;
    const generated = buildDefaultDemoData(baseYear);
    await fs.mkdir(path.dirname(DEMO_DATA_PATH), { recursive: true });
    await fs.writeFile(DEMO_DATA_PATH, `${JSON.stringify(generated, null, 2)}\n`, 'utf8');
    return generated;
  }
}

export async function readDemoDataFile(): Promise<DemoDataFile> {
  return ensureDemoDataFile();
}

function buildOperationalTablesSql() {
  const tables = [
    'PaymentAllocation',
    'InvoiceLine',
    'JournalLine',
    'DepreciationSchedule',
    'StockCountLine',
    'SupportTicketMessage',
    'PayrollLine',
    'ContractMilestone',
    'AuthSession',
    'BackupJob',
    'Notification',
    'UserTask',
    'IntegrationSetting',
    'SavedReport',
    'ScheduledReport',
    'ExchangeRate',
    'Currency',
    'TaxDeclaration',
    'TaxCode',
    'BudgetLine',
    'Budget',
    'StockBalance',
    'StockMovement',
    'WarehouseLocation',
    'Warehouse',
    'StockCount',
    'SalesReturn',
    'SalesQuote',
    'PurchaseReceipt',
    'PurchaseOrderLine',
    'PurchaseReturn',
    'PurchaseOrder',
    'ProjectExpense',
    'ProjectTask',
    'Opportunity',
    'SupportTicket',
    'LeaveRequest',
    'PayrollRun',
    'Contract',
    'BankTransaction',
    'Payment',
    'Invoice',
    'JournalEntry',
    'AccountBalance',
    'FixedAsset',
    'AssetCategory',
    'Item',
    'ItemCategory',
    'Unit',
    'Contact',
    'Customer',
    'Supplier',
    'BankAccount',
    'AccountingPeriod',
    'FiscalYear'
  ];
  return tables.map((name) => `"${name}"`).join(', ');
}

async function purgeOperationalData(tx: Prisma.TransactionClient) {
  const sql = `TRUNCATE TABLE ${buildOperationalTablesSql()} RESTART IDENTITY CASCADE`;
  await tx.$executeRawUnsafe(sql);
  await tx.systemSettings.updateMany({
    data: {
      postingAccounts: {}
    }
  });
}

type CoreRefs = {
  adminUserId: number;
  cashAccountId: number;
  bankAccountId: number;
  receivableAccountId: number;
  payableAccountId: number;
  revenueAccountId: number;
  expenseAccountId: number;
  fixedAssetCategoryId: number;
};

async function ensureCoreMasters(tx: Prisma.TransactionClient, currencyCode: string): Promise<CoreRefs> {
  const admin = await tx.user.findFirst({
    where: { username: 'admin' },
    select: { id: true }
  });
  if (!admin) throw Errors.business('مستخدم admin غير موجود. شغّل prisma seed أولاً.');

  await tx.companyProfile.upsert({
    where: { id: 1 },
    update: { currency: currencyCode },
    create: { id: 1, nameAr: 'شركة واحدة', currency: currencyCode }
  });

  const accounts = [
    { code: '1000', nameAr: 'الأصول', type: 'ASSET', level: 1, allowPosting: false, normalBalance: 'Debit' },
    { code: '1100', nameAr: 'الصندوق', type: 'ASSET', level: 2, allowPosting: true, normalBalance: 'Debit', parentCode: '1000' },
    { code: '1200', nameAr: 'البنك', type: 'ASSET', level: 2, allowPosting: true, normalBalance: 'Debit', parentCode: '1000' },
    { code: '1300', nameAr: 'العملاء', type: 'ASSET', level: 2, allowPosting: true, normalBalance: 'Debit', parentCode: '1000' },
    { code: '2000', nameAr: 'الخصوم', type: 'LIABILITY', level: 1, allowPosting: false, normalBalance: 'Credit' },
    { code: '2100', nameAr: 'الموردون', type: 'LIABILITY', level: 2, allowPosting: true, normalBalance: 'Credit', parentCode: '2000' },
    { code: '2200', nameAr: 'ضريبة القيمة المضافة المستحقة', type: 'LIABILITY', level: 2, allowPosting: true, normalBalance: 'Credit', parentCode: '2000' },
    { code: '3000', nameAr: 'حقوق الملكية', type: 'EQUITY', level: 1, allowPosting: false, normalBalance: 'Credit' },
    { code: '3100', nameAr: 'الأرباح المحتجزة', type: 'EQUITY', level: 2, allowPosting: true, normalBalance: 'Credit', parentCode: '3000' },
    { code: '4000', nameAr: 'الإيرادات', type: 'REVENUE', level: 1, allowPosting: false, normalBalance: 'Credit' },
    { code: '4100', nameAr: 'إيراد المبيعات', type: 'REVENUE', level: 2, allowPosting: true, normalBalance: 'Credit', parentCode: '4000' },
    { code: '5000', nameAr: 'المصروفات', type: 'EXPENSE', level: 1, allowPosting: false, normalBalance: 'Debit' },
    { code: '5100', nameAr: 'مصروفات تشغيلية', type: 'EXPENSE', level: 2, allowPosting: true, normalBalance: 'Debit', parentCode: '5000' }
  ];

  const byCode = new Map<string, number>();
  for (const acc of accounts.filter((row) => !(row as { parentCode?: string }).parentCode)) {
    const saved = await tx.account.upsert({
      where: { code: acc.code },
      update: {
        nameAr: acc.nameAr,
        type: acc.type as any,
        level: acc.level,
        allowPosting: acc.allowPosting,
        normalBalance: acc.normalBalance,
        isControl: !acc.allowPosting,
        parentId: null,
        isActive: true
      },
      create: {
        code: acc.code,
        nameAr: acc.nameAr,
        type: acc.type as any,
        level: acc.level,
        allowPosting: acc.allowPosting,
        normalBalance: acc.normalBalance,
        isControl: !acc.allowPosting
      }
    });
    byCode.set(saved.code, saved.id);
  }

  for (const acc of accounts.filter((row) => Boolean((row as { parentCode?: string }).parentCode))) {
    const row = acc as typeof acc & { parentCode: string };
    const parentId = byCode.get(row.parentCode);
    if (!parentId) throw Errors.business(`تعذر العثور على الحساب الأب ${row.parentCode}`);

    const saved = await tx.account.upsert({
      where: { code: row.code },
      update: {
        nameAr: row.nameAr,
        type: row.type as any,
        level: row.level,
        allowPosting: row.allowPosting,
        normalBalance: row.normalBalance,
        isControl: !row.allowPosting,
        parentId,
        isActive: true
      },
      create: {
        code: row.code,
        nameAr: row.nameAr,
        type: row.type as any,
        level: row.level,
        allowPosting: row.allowPosting,
        normalBalance: row.normalBalance,
        isControl: !row.allowPosting,
        parentId
      }
    });
    byCode.set(saved.code, saved.id);
  }

  await tx.currency.upsert({
    where: { code: currencyCode },
    update: { isActive: true, isBase: true, nameAr: 'عملة أساسية' },
    create: { code: currencyCode, nameAr: 'عملة أساسية', isBase: true, isActive: true }
  });

  const bankAccount = await tx.bankAccount.create({
    data: {
      name: 'البنك الرئيسي',
      accountNumber: `DMO-${Date.now()}`,
      bankName: 'البنك المحلي',
      currency: currencyCode,
      currentBalance: 0,
      openingBalance: 0,
      glAccountId: byCode.get('1200')
    }
  });

  const category = await tx.assetCategory.create({
    data: {
      code: `DMO-AST-${Date.now()}`,
      nameAr: 'أصول تجريبية',
      usefulLifeMonths: 60,
      salvagePercent: 0
    }
  });

  await tx.systemSettings.upsert({
    where: { id: 1 },
    update: {
      postingAccounts: {
        receivableAccountId: byCode.get('1300'),
        payableAccountId: byCode.get('2100'),
        salesRevenueAccountId: byCode.get('4100'),
        purchaseExpenseAccountId: byCode.get('5100'),
        cashAccountId: byCode.get('1100')
      }
    },
    create: {
      id: 1,
      invoicePrefix: 'INV',
      quotePrefix: 'QT',
      postingAccounts: {
        receivableAccountId: byCode.get('1300'),
        payableAccountId: byCode.get('2100'),
        salesRevenueAccountId: byCode.get('4100'),
        purchaseExpenseAccountId: byCode.get('5100'),
        cashAccountId: byCode.get('1100')
      }
    }
  });

  return {
    adminUserId: admin.id,
    cashAccountId: byCode.get('1100') ?? 0,
    bankAccountId: bankAccount.id,
    receivableAccountId: byCode.get('1300') ?? 0,
    payableAccountId: byCode.get('2100') ?? 0,
    revenueAccountId: byCode.get('4100') ?? 0,
    expenseAccountId: byCode.get('5100') ?? 0,
    fixedAssetCategoryId: category.id
  };
}

function distributeTotal(total: number, parts: number): number[] {
  const values: number[] = [];
  let remaining = roundAmount(total);
  for (let i = 0; i < parts; i += 1) {
    if (i === parts - 1) {
      values.push(roundAmount(Math.max(0, remaining)));
      break;
    }
    const weight = 0.2 + (i + 1) / (parts * 2.8);
    const chunk = roundAmount(total * weight * (0.6 + (i % 2) * 0.15));
    const safe = Math.max(0, Math.min(chunk, remaining));
    values.push(safe);
    remaining = roundAmount(remaining - safe);
  }
  return values;
}

async function createFiscalYearsAndPeriods(tx: Prisma.TransactionClient, years: number[]) {
  const monthNames = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  const latestYear = Math.max(...years);
  let periods = 0;

  for (const year of years) {
    const fy = await tx.fiscalYear.create({
      data: {
        name: String(year),
        startDate: firstUtcDay(year, 1),
        endDate: lastUtcDay(year, 12),
        status: year === latestYear ? 'OPEN' : 'CLOSED',
        isCurrent: year === latestYear
      }
    });
    for (let month = 1; month <= 12; month += 1) {
      await tx.accountingPeriod.create({
        data: {
          fiscalYearId: fy.id,
          number: month,
          name: monthNames[month - 1],
          startDate: firstUtcDay(year, month),
          endDate: lastUtcDay(year, month),
          status: year === latestYear ? 'OPEN' : 'CLOSED',
          canPost: year === latestYear
        }
      });
      periods += 1;
    }
  }

  return { years: years.length, periods };
}

async function createPartiesAndItems(tx: Prisma.TransactionClient, data: DemoDataFile) {
  const customers = await Promise.all(
    Array.from({ length: data.customersCount }).map((_, idx) =>
      tx.customer.create({
        data: {
          code: `DMO-CUST-${String(idx + 1).padStart(3, '0')}`,
          nameAr: `عميل تجريبي ${idx + 1}`,
          city: idx % 2 === 0 ? 'الرياض' : 'جدة',
          phone: `05${String(10000000 + idx).slice(0, 8)}`,
          email: `demo.customer.${idx + 1}@erp.local`,
          creditLimit: 250000
        }
      })
    )
  );

  const suppliers = await Promise.all(
    Array.from({ length: data.suppliersCount }).map((_, idx) =>
      tx.supplier.create({
        data: {
          code: `DMO-SUP-${String(idx + 1).padStart(3, '0')}`,
          nameAr: `مورد تجريبي ${idx + 1}`,
          city: idx % 2 === 0 ? 'الرياض' : 'الدمام',
          phone: `05${String(20000000 + idx).slice(0, 8)}`,
          email: `demo.supplier.${idx + 1}@erp.local`
        }
      })
    )
  );

  const category = await tx.itemCategory.create({
    data: {
      code: `DMO-CAT-${Date.now()}`,
      nameAr: 'تصنيف تجريبي',
      isActive: true
    }
  });

  const unit = await tx.unit.create({
    data: {
      code: `DMO-UOM-${Date.now()}`,
      nameAr: 'قطعة',
      isActive: true
    }
  });

  const items = await Promise.all(
    Array.from({ length: data.itemsCount }).map((_, idx) =>
      tx.item.create({
        data: {
          code: `DMO-ITEM-${String(idx + 1).padStart(3, '0')}`,
          nameAr: `صنف تجريبي ${idx + 1}`,
          categoryId: category.id,
          unitId: unit.id,
          salePrice: roundAmount(50 + idx * 3.5),
          purchasePrice: roundAmount(30 + idx * 2.25),
          reorderPoint: 5 + (idx % 4),
          onHandQty: 100 + idx * 2,
          inventoryValue: roundAmount((100 + idx * 2) * (30 + idx * 2.25)),
          isActive: true
        }
      })
    )
  );

  return {
    customers,
    suppliers,
    items
  };
}

async function createAssets(tx: Prisma.TransactionClient, data: DemoDataFile, refs: CoreRefs) {
  const years = [...data.years].sort();
  const startYear = years[0];

  for (let i = 0; i < data.assetsCount; i += 1) {
    const year = startYear + (i % 3);
    const month = (i % 12) + 1;
    const purchaseCost = roundAmount(2500 + i * 420);
    await tx.fixedAsset.create({
      data: {
        code: `DMO-AST-${String(i + 1).padStart(3, '0')}`,
        nameAr: `أصل تجريبي ${i + 1}`,
        categoryId: refs.fixedAssetCategoryId,
        purchaseDate: firstUtcDay(year, month),
        purchaseCost,
        usefulLifeMonths: 60,
        depreciationMethod: 'STRAIGHT_LINE',
        salvageValue: 0,
        depreciationStart: firstUtcDay(year, month),
        accumulatedDepreciation: roundAmount(purchaseCost * 0.25),
        netBookValue: roundAmount(purchaseCost * 0.75),
        status: 'ACTIVE',
        isDepreciating: true
      }
    });
  }
}

async function createMonthlyOperationalData(
  tx: Prisma.TransactionClient,
  refs: CoreRefs,
  data: DemoDataFile,
  parties: { customers: Array<{ id: number }>; suppliers: Array<{ id: number }>; items: Array<{ id: number }> }
) {
  const periodByYearMonth = new Map<string, { id: number; status: string }>();
  const periods = await tx.accountingPeriod.findMany({ select: { id: true, fiscalYearId: true, number: true, fiscalYear: { select: { name: true } }, status: true } });
  for (const row of periods) {
    const key = `${row.fiscalYear.name}-${String(row.number).padStart(2, '0')}`;
    periodByYearMonth.set(key, { id: row.id, status: row.status });
  }

  const summary: ImportSummary = {
    customers: parties.customers.length,
    suppliers: parties.suppliers.length,
    items: parties.items.length,
    assets: data.assetsCount,
    invoices: 0,
    payments: 0,
    journals: 0,
    tasks: 0,
    tickets: 0,
    leaves: 0
  };

  let invoiceSeq = 1;
  let paymentSeq = 1;
  let journalSeq = 1;

  for (const month of data.monthly) {
    const { year, month: monthNo } = parsePeriod(month.period);
    const periodRef = periodByYearMonth.get(month.period);
    const periodId = periodRef?.id ?? null;
    const salesParts = distributeTotal(month.sales, 4);
    const expenseParts = distributeTotal(month.expenses, 3);

    for (let i = 0; i < salesParts.length; i += 1) {
      const total = roundAmount(Math.max(10, salesParts[i]));
      const status = i === 0 ? 'PAID' : i === 1 ? 'ISSUED' : i === 2 ? 'PARTIAL' : 'DRAFT';
      const paidAmount = status === 'PAID' ? total : status === 'PARTIAL' ? roundAmount(total * 0.45) : 0;
      const outstanding = roundAmount(total - paidAmount);
      const customerId = parties.customers[(invoiceSeq + i) % parties.customers.length]?.id;

      const invoice = await tx.invoice.create({
        data: {
          number: `DMO-SINV-${year}${String(monthNo).padStart(2, '0')}-${String(invoiceSeq).padStart(4, '0')}`,
          type: 'SALES',
          date: midUtcDay(year, monthNo, 5 + i * 6),
          dueDate: midUtcDay(year, monthNo, 24),
          customerId,
          subtotal: roundAmount(total / 1.15),
          taxableAmount: roundAmount(total / 1.15),
          vatRate: 15,
          vatAmount: roundAmount(total - total / 1.15),
          total,
          paidAmount,
          outstanding,
          status: status as any,
          paymentStatus: outstanding > 0 ? 'PENDING' : 'PAID',
          createdById: refs.adminUserId
        }
      });

      await tx.invoiceLine.create({
        data: {
          invoiceId: invoice.id,
          lineNumber: 1,
          itemId: parties.items[(invoiceSeq + i) % parties.items.length]?.id,
          description: 'بند مبيعات تجريبي',
          quantity: 1,
          unitPrice: total,
          total
        }
      });

      summary.invoices += 1;
      invoiceSeq += 1;
    }

    for (let i = 0; i < expenseParts.length; i += 1) {
      const total = roundAmount(Math.max(10, expenseParts[i]));
      const status = i === 0 ? 'ISSUED' : i === 1 ? 'PARTIAL' : 'PAID';
      const paidAmount = status === 'PAID' ? total : status === 'PARTIAL' ? roundAmount(total * 0.5) : 0;
      const outstanding = roundAmount(total - paidAmount);
      const supplierId = parties.suppliers[(invoiceSeq + i) % parties.suppliers.length]?.id;

      const invoice = await tx.invoice.create({
        data: {
          number: `DMO-PINV-${year}${String(monthNo).padStart(2, '0')}-${String(invoiceSeq).padStart(4, '0')}`,
          type: 'PURCHASE',
          date: midUtcDay(year, monthNo, 7 + i * 8),
          dueDate: midUtcDay(year, monthNo, 26),
          supplierId,
          subtotal: roundAmount(total / 1.15),
          taxableAmount: roundAmount(total / 1.15),
          vatRate: 15,
          vatAmount: roundAmount(total - total / 1.15),
          total,
          paidAmount,
          outstanding,
          status: status as any,
          paymentStatus: outstanding > 0 ? 'PENDING' : 'PAID',
          createdById: refs.adminUserId
        }
      });

      await tx.invoiceLine.create({
        data: {
          invoiceId: invoice.id,
          lineNumber: 1,
          itemId: parties.items[(invoiceSeq + i) % parties.items.length]?.id,
          description: 'بند مشتريات تجريبي',
          quantity: 1,
          unitPrice: total,
          total
        }
      });

      summary.invoices += 1;
      invoiceSeq += 1;
    }

    for (let i = 0; i < month.pendingPayments; i += 1) {
      await tx.payment.create({
        data: {
          number: `DMO-PAY-${year}${String(monthNo).padStart(2, '0')}-${String(paymentSeq).padStart(4, '0')}`,
          date: midUtcDay(year, monthNo, 10 + i),
          type: i % 2 === 0 ? 'RECEIPT' : 'PAYMENT',
          method: 'BANK_TRANSFER',
          amount: roundAmount(1800 + i * 350),
          bankId: refs.bankAccountId,
          customerId: i % 2 === 0 ? parties.customers[(paymentSeq + i) % parties.customers.length]?.id : null,
          supplierId: i % 2 !== 0 ? parties.suppliers[(paymentSeq + i) % parties.suppliers.length]?.id : null,
          status: i % 3 === 0 ? 'PENDING' : 'COMPLETED',
          description: 'دفعة تجريبية',
          createdById: refs.adminUserId
        }
      });
      paymentSeq += 1;
      summary.payments += 1;
    }

    const postedAmount = roundAmount(month.sales * 0.22);
    if (postedAmount > 0) {
      const entry = await tx.journalEntry.create({
        data: {
          entryNumber: `DMO-JRN-${year}${String(monthNo).padStart(2, '0')}-${String(journalSeq).padStart(4, '0')}`,
          date: midUtcDay(year, monthNo, 28),
          periodId,
          description: 'قيد إيراد تجريبي',
          reference: `DMO-POST-${month.period}`,
          source: 'MANUAL',
          status: 'POSTED',
          totalDebit: postedAmount,
          totalCredit: postedAmount,
          createdById: refs.adminUserId,
          postedById: refs.adminUserId,
          postedAt: midUtcDay(year, monthNo, 28)
        }
      });
      await tx.journalLine.createMany({
        data: [
          {
            entryId: entry.id,
            lineNumber: 1,
            accountId: refs.receivableAccountId,
            debit: postedAmount,
            credit: 0,
            description: 'إثبات مبيعات تجريبية'
          },
          {
            entryId: entry.id,
            lineNumber: 2,
            accountId: refs.revenueAccountId,
            debit: 0,
            credit: postedAmount,
            description: 'إيراد مبيعات تجريبية'
          }
        ]
      });
      summary.journals += 1;
      journalSeq += 1;
    }

    for (let i = 0; i < month.draftEntries; i += 1) {
      const amount = roundAmount(900 + i * 150);
      const entry = await tx.journalEntry.create({
        data: {
          entryNumber: `DMO-DRF-${year}${String(monthNo).padStart(2, '0')}-${String(journalSeq).padStart(4, '0')}`,
          date: midUtcDay(year, monthNo, 11 + i),
          periodId,
          description: 'قيد مسودة تجريبي',
          reference: `DMO-DRAFT-${month.period}-${i + 1}`,
          source: 'MANUAL',
          status: 'DRAFT',
          totalDebit: amount,
          totalCredit: amount,
          createdById: refs.adminUserId
        }
      });
      await tx.journalLine.createMany({
        data: [
          {
            entryId: entry.id,
            lineNumber: 1,
            accountId: refs.expenseAccountId,
            debit: amount,
            credit: 0,
            description: 'مصروفات تشغيلية'
          },
          {
            entryId: entry.id,
            lineNumber: 2,
            accountId: refs.cashAccountId,
            debit: 0,
            credit: amount,
            description: 'سداد نقدي'
          }
        ]
      });
      summary.journals += 1;
      journalSeq += 1;
    }

    for (let i = 0; i < month.openTasks; i += 1) {
      await tx.userTask.create({
        data: {
          userId: refs.adminUserId,
          title: `مهمة تجريبية ${month.period}-${i + 1}`,
          description: 'بيانات اختبارية للوحة التحكم',
          priority: i % 2 === 0 ? 'MEDIUM' : 'HIGH',
          status: 'OPEN',
          dueDate: midUtcDay(year, monthNo, Math.min(25, 12 + i))
        }
      });
      summary.tasks += 1;
    }

    for (let i = 0; i < month.openTickets; i += 1) {
      await tx.supportTicket.create({
        data: {
          number: `DMO-TKT-${year}${String(monthNo).padStart(2, '0')}-${String(summary.tickets + 1).padStart(4, '0')}`,
          subject: `تذكرة دعم تجريبية ${month.period}-${i + 1}`,
          description: 'تذكرة اختبار',
          priority: i % 2 === 0 ? 'MEDIUM' : 'HIGH',
          status: 'OPEN'
        }
      });
      summary.tickets += 1;
    }

    for (let i = 0; i < month.pendingLeaves; i += 1) {
      await tx.leaveRequest.create({
        data: {
          employeeId: refs.adminUserId,
          type: 'سنوية',
          startDate: midUtcDay(year, monthNo, 18),
          endDate: midUtcDay(year, monthNo, 19),
          daysCount: 2,
          status: 'PENDING',
          reason: 'طلب إجازة تجريبي'
        }
      });
      summary.leaves += 1;
    }
  }

  return summary;
}

export async function purgeAndImportDemoData(fileData: unknown, options?: { purgeFirst?: boolean }) {
  const data = normalizeDemoData(fileData);
  const purgeFirst = options?.purgeFirst !== false;

  return prisma.$transaction(
    async (tx) => {
      if (purgeFirst) await purgeOperationalData(tx);
      const refs = await ensureCoreMasters(tx, data.currency);
      const periodSummary = await createFiscalYearsAndPeriods(tx, data.years);
      const parties = await createPartiesAndItems(tx, data);
      await createAssets(tx, data, refs);
      const summary = await createMonthlyOperationalData(tx, refs, data, parties);

      return {
        source: 'demo-data',
        fileVersion: data.version,
        years: periodSummary.years,
        periods: periodSummary.periods,
        ...summary
      };
    },
    {
      maxWait: 15_000,
      timeout: 240_000
    }
  );
}

export async function purgeAllOperationalData(confirm: string) {
  if (confirm !== 'DELETE ALL') {
    throw Errors.validation('لتأكيد الحذف الكامل أرسل confirm = DELETE ALL');
  }
  return prisma.$transaction(async (tx) => {
    await purgeOperationalData(tx);
    return { deleted: true };
  });
}

export function getDemoFilePath() {
  return DEMO_DATA_PATH;
}

export function buildInitialDemoFile() {
  return buildDefaultDemoData(new Date().getUTCFullYear() - 2);
}
