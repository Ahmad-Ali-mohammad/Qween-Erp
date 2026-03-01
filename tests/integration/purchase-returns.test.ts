import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/config/database';
import { ensureAdminUser, loginAdmin, uniqueCode } from './helpers';

describe('Purchase returns workflow', () => {
  beforeAll(async () => {
    await ensureAdminUser();
  });

  it('creates draft, approves once, and blocks approving non-draft', async () => {
    const token = await loginAdmin();

    const supplier = await prisma.supplier.create({
      data: {
        code: uniqueCode('SUP'),
        nameAr: 'مورد اختبار مرتجع شراء'
      }
    });

    const invoice = await prisma.invoice.create({
      data: {
        number: uniqueCode('PINV'),
        type: 'PURCHASE',
        date: new Date(),
        supplierId: supplier.id,
        subtotal: 300,
        discount: 0,
        taxableAmount: 300,
        vatAmount: 45,
        total: 345,
        paidAmount: 0,
        outstanding: 345,
        status: 'ISSUED',
        paymentStatus: 'PENDING'
      }
    });

    const createRes = await request(app)
      .post('/api/purchase-returns')
      .set('Authorization', `Bearer ${token}`)
      .send({
        invoiceId: invoice.id,
        reason: 'مرتجع جزئي',
        lines: [
          {
            description: 'مرتجع بند 1',
            quantity: 1,
            unitPrice: 100,
            discount: 0,
            taxRate: 15
          }
        ]
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.success).toBe(true);
    expect(createRes.body.data.status).toBe('DRAFT');
    const returnId = createRes.body.data.id as number;

    const approveRes = await request(app)
      .post(`/api/purchase-returns/${returnId}/approve`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.data.status).toBe('APPROVED');

    const approvedDoc = await (prisma as any).purchaseReturn.findUnique({ where: { id: returnId } });
    expect(approvedDoc?.journalEntryId).toBeTruthy();

    const entry = await prisma.journalEntry.findUnique({
      where: { id: approvedDoc.journalEntryId as number },
      include: { lines: true }
    });
    expect(entry).toBeTruthy();

    const totalDebit = entry!.lines.reduce((s, line) => s + Number(line.debit), 0);
    const totalCredit = entry!.lines.reduce((s, line) => s + Number(line.credit), 0);
    expect(Math.abs(totalDebit - totalCredit)).toBeLessThan(0.000001);
    expect(entry?.status).toBe('POSTED');

    const updatedInvoice = await prisma.invoice.findUnique({ where: { id: invoice.id } });
    expect(updatedInvoice).toBeTruthy();
    expect(Number(updatedInvoice!.paidAmount)).toBeGreaterThan(0);
    expect(Number(updatedInvoice!.outstanding)).toBeLessThan(345);

    const approveAgain = await request(app)
      .post(`/api/purchase-returns/${returnId}/approve`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(approveAgain.status).toBe(400);
    expect(approveAgain.body.success).toBe(false);
  });
});
