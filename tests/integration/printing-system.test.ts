import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/config/database';
import { ensureAdminUser, loginAdmin, uniqueCode } from './helpers';

describe('Printing system', () => {
  let token = '';
  let branchId = 0;
  let templateId = 0;
  let printJobId = 0;
  let exportJobId = 0;
  let conversionJobId = 0;

  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    await ensureAdminUser();
    token = await loginAdmin();
  });

  afterAll(async () => {
    if (conversionJobId) {
      await prisma.printAudit.deleteMany({ where: { conversionJobId } });
      await prisma.conversionJob.deleteMany({ where: { id: conversionJobId } });
    }
    if (exportJobId) {
      await prisma.printAudit.deleteMany({ where: { exportJobId } });
      await prisma.exportJob.deleteMany({ where: { id: exportJobId } });
    }
    if (printJobId) {
      await prisma.printAudit.deleteMany({ where: { printJobId } });
      await prisma.printJob.deleteMany({ where: { id: printJobId } });
    }
    if (templateId) {
      await prisma.printAudit.deleteMany({ where: { resourceType: 'PrintTemplate', resourceId: String(templateId) } });
      await prisma.printTemplate.deleteMany({ where: { id: templateId } });
    }
    if (branchId) await prisma.branch.deleteMany({ where: { id: branchId } });
  });

  it('runs templates, jobs, exports, and conversions flow end-to-end', async () => {
    branchId = (
      await prisma.branch.create({
        data: {
          code: uniqueCode('BR'),
          nameAr: 'فرع المطبوعات'
        }
      })
    ).id;

    const createTemplate = await request(app).post('/api/printing/templates').set(auth()).send({
      branchId,
      title: 'قالب فاتورة',
      entityType: 'Invoice',
      defaultFormat: 'PDF',
      templateHtml: '<h1>Invoice {{number}}</h1>'
    });
    expect(createTemplate.status).toBe(201);
    templateId = Number(createTemplate.body.data.id);
    expect(createTemplate.body.data.status).toBe('ACTIVE');

    const deactivateTemplate = await request(app).post(`/api/printing/templates/${templateId}/activate`).set(auth()).send({ active: false });
    expect(deactivateTemplate.status).toBe(200);
    expect(deactivateTemplate.body.data.status).toBe('INACTIVE');

    const activateTemplate = await request(app).post(`/api/printing/templates/${templateId}/activate`).set(auth()).send({ active: true });
    expect(activateTemplate.status).toBe(200);
    expect(activateTemplate.body.data.status).toBe('ACTIVE');

    const createPrintJob = await request(app).post('/api/printing/jobs').set(auth()).send({
      branchId,
      templateId,
      entityType: 'Invoice',
      entityId: '1001',
      outputFormat: 'PDF'
    });
    expect(createPrintJob.status).toBe(201);
    printJobId = Number(createPrintJob.body.data.id);
    expect(createPrintJob.body.data.status).toBe('QUEUED');

    const runPrintJob = await request(app).post(`/api/printing/jobs/${printJobId}/status`).set(auth()).send({ status: 'RUNNING' });
    expect(runPrintJob.status).toBe(200);
    expect(runPrintJob.body.data.status).toBe('RUNNING');

    const completePrintJob = await request(app).post(`/api/printing/jobs/${printJobId}/status`).set(auth()).send({
      status: 'COMPLETED',
      fileName: 'invoice-1001.pdf',
      fileUrl: '/archive/invoice-1001.pdf'
    });
    expect(completePrintJob.status).toBe(200);
    expect(completePrintJob.body.data.status).toBe('COMPLETED');

    const createExportJob = await request(app).post('/api/printing/exports').set(auth()).send({
      branchId,
      sourceType: 'Invoice',
      outputFormat: 'XLSX'
    });
    expect(createExportJob.status).toBe(201);
    exportJobId = Number(createExportJob.body.data.id);
    expect(createExportJob.body.data.status).toBe('QUEUED');

    const completeExportJob = await request(app).post(`/api/printing/exports/${exportJobId}/status`).set(auth()).send({
      status: 'COMPLETED',
      rowsExported: 42,
      fileName: 'invoices.xlsx'
    });
    expect(completeExportJob.status).toBe(200);
    expect(completeExportJob.body.data.status).toBe('COMPLETED');
    expect(Number(completeExportJob.body.data.rowsExported)).toBe(42);

    const createConversionJob = await request(app).post('/api/printing/conversions').set(auth()).send({
      branchId,
      sourceFileName: 'ledger.pdf',
      sourceFormat: 'PDF',
      targetFormat: 'XLSX'
    });
    expect(createConversionJob.status).toBe(201);
    conversionJobId = Number(createConversionJob.body.data.id);
    expect(createConversionJob.body.data.status).toBe('QUEUED');

    const failConversionJob = await request(app).post(`/api/printing/conversions/${conversionJobId}/status`).set(auth()).send({
      status: 'FAILED',
      errorMessage: 'OCR converter unavailable'
    });
    expect(failConversionJob.status).toBe(200);
    expect(failConversionJob.body.data.status).toBe('FAILED');

    const [dashboard, templates, jobs, exportsList, conversions, audits, outboxEvents] = await Promise.all([
      request(app).get('/api/printing/dashboard/summary').set(auth()),
      request(app).get('/api/printing/templates').set(auth()),
      request(app).get('/api/printing/jobs').set(auth()),
      request(app).get('/api/printing/exports').set(auth()),
      request(app).get('/api/printing/conversions').set(auth()),
      request(app).get('/api/printing/audit').set(auth()),
      prisma.outboxEvent.findMany({
        where: {
          eventType: {
            in: [
              'printing.template.created',
              'printing.template.deactivated',
              'printing.template.activated',
              'printing.job.created',
              'printing.job.running',
              'printing.job.completed',
              'printing.export.created',
              'printing.export.completed',
              'printing.conversion.created',
              'printing.conversion.failed'
            ]
          }
        }
      })
    ]);

    expect(dashboard.status).toBe(200);
    expect(Array.isArray(dashboard.body.data)).toBe(true);
    expect(templates.status).toBe(200);
    expect(jobs.status).toBe(200);
    expect(exportsList.status).toBe(200);
    expect(conversions.status).toBe(200);
    expect(audits.status).toBe(200);

    const eventTypes = new Set(outboxEvents.map((event) => event.eventType));
    expect(eventTypes.has('printing.template.created')).toBe(true);
    expect(eventTypes.has('printing.template.deactivated')).toBe(true);
    expect(eventTypes.has('printing.template.activated')).toBe(true);
    expect(eventTypes.has('printing.job.created')).toBe(true);
    expect(eventTypes.has('printing.job.running')).toBe(true);
    expect(eventTypes.has('printing.job.completed')).toBe(true);
    expect(eventTypes.has('printing.export.created')).toBe(true);
    expect(eventTypes.has('printing.export.completed')).toBe(true);
    expect(eventTypes.has('printing.conversion.created')).toBe(true);
    expect(eventTypes.has('printing.conversion.failed')).toBe(true);
  });
});
