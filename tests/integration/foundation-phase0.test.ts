import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/config/database';
import { ensureAdminUser, loginAdmin, uniqueCode } from './helpers';

describe('Phase 0 foundation namespaces and outbox', () => {
  let token = '';
  let branchId = 0;
  let customerId = 0;
  let quoteId = 0;
  let invoiceId = 0;
  let paymentId = 0;
  let documentId = 0;

  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    await ensureAdminUser();
    token = await loginAdmin();
  });

  afterAll(async () => {
    if (documentId) await prisma.document.deleteMany({ where: { id: documentId } });
    if (paymentId) await prisma.payment.deleteMany({ where: { id: paymentId } });
    if (invoiceId) await prisma.invoice.deleteMany({ where: { id: invoiceId } });
    if (quoteId) await prisma.salesQuote.deleteMany({ where: { id: quoteId } });
    if (customerId) await prisma.customer.deleteMany({ where: { id: customerId } });
    if (branchId) await prisma.branch.deleteMany({ where: { id: branchId } });
  });

  it('creates branch-scoped commercial records and foundation metadata through legal domain routes', async () => {
    const branchRes = await request(app).post('/api/platform/branches').set(auth()).send({
      code: uniqueCode('BR'),
      nameAr: 'الفرع الرئيسي للتكامل',
      city: 'Damascus'
    });
    expect(branchRes.status).toBe(201);
    branchId = Number(branchRes.body.data.id);

    customerId = (
      await prisma.customer.create({
        data: {
          code: uniqueCode('CUS'),
          nameAr: 'عميل اختبار مرحلة الأساس',
          branchId
        }
      })
    ).id;

    const quoteRes = await request(app).post('/api/crm/quotes').set(auth()).send({
      branchId,
      customerId,
      notes: 'عرض سعر تجريبي',
      lines: [
        {
          description: 'خدمة استشارية',
          quantity: 2,
          unitPrice: 150
        }
      ]
    });
    expect(quoteRes.status).toBe(200);
    quoteId = Number(quoteRes.body.data.id);
    expect(Number(quoteRes.body.data.branchId)).toBe(branchId);

    const invoiceRes = await request(app).post('/api/finance/invoices').set(auth()).send({
      branchId,
      type: 'SALES',
      customerId,
      date: '2026-03-19',
      notes: 'فاتورة مرحلة الأساس',
      lines: [
        {
          description: 'اشتراك خدمة',
          quantity: 1,
          unitPrice: 500
        }
      ]
    });
    expect(invoiceRes.status).toBe(201);
    invoiceId = Number(invoiceRes.body.data.id);
    expect(Number(invoiceRes.body.data.branchId)).toBe(branchId);

    const paymentRes = await request(app).post('/api/finance/payments').set(auth()).send({
      branchId,
      type: 'RECEIPT',
      method: 'CASH',
      amount: 150,
      date: '2026-03-19',
      customerId,
      description: 'دفعة مقدمة'
    });
    expect(paymentRes.status).toBe(201);
    paymentId = Number(paymentRes.body.data.id);
    expect(Number(paymentRes.body.data.branchId)).toBe(branchId);

    const documentRes = await request(app).post('/api/documents').set(auth()).send({
      branchId,
      module: 'crm',
      entityType: 'SalesQuote',
      entityId: String(quoteId),
      provider: 'LOCAL',
      fileName: 'quote-attachment.pdf',
      originalName: 'quote.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 128,
      storageKey: `quotes/${quoteId}/quote-attachment.pdf`
    });
    expect(documentRes.status).toBe(201);
    documentId = Number(documentRes.body.data.id);

    const quote = await prisma.salesQuote.findUnique({ where: { id: quoteId } });
    expect(quote?.attachmentsCount).toBe(1);

    const [quoteEvent, invoiceEvent, paymentEvent] = await Promise.all([
      prisma.outboxEvent.findFirst({ where: { eventType: 'crm.quote.created', aggregateId: String(quoteId) } }),
      prisma.outboxEvent.findFirst({ where: { eventType: 'finance.invoice.created', aggregateId: String(invoiceId) } }),
      prisma.outboxEvent.findFirst({ where: { eventType: 'finance.payment.created', aggregateId: String(paymentId) } })
    ]);

    expect(quoteEvent?.branchId).toBe(branchId);
    expect(invoiceEvent?.branchId).toBe(branchId);
    expect(paymentEvent?.branchId).toBe(branchId);

    const outboxRes = await request(app).get('/api/platform/outbox-events').set(auth()).query({ branchId, status: 'PENDING' });
    expect(outboxRes.status).toBe(200);
    expect(Array.isArray(outboxRes.body.data)).toBe(true);
    expect(outboxRes.body.data.length).toBeGreaterThanOrEqual(3);
  });
});
