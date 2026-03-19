import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/config/database';
import { ensureAdminUser, loginAdmin, uniqueCode } from './helpers';

describe('Procurement receipts and vendor invoices APIs', () => {
  beforeAll(async () => {
    await ensureAdminUser();
  });

  it('completes PO -> GRN -> vendor invoice -> issue under /api/v1/procurement', async () => {
    const token = await loginAdmin();
    const itemCode = uniqueCode('ITEM');
    const warehouseCode = uniqueCode('WH');
    const supplierCode = uniqueCode('SUP');

    const item = await prisma.item.create({
      data: {
        code: itemCode,
        nameAr: 'صنف مشتريات',
        purchasePrice: 12.5,
        salePrice: 20
      }
    });

    const warehouse = await prisma.warehouse.create({
      data: {
        code: warehouseCode,
        nameAr: 'المستودع الرئيسي'
      }
    });

    const supplierRes = await request(app)
      .post('/api/suppliers')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: supplierCode,
        nameAr: 'مورد دورة المشتريات'
      });

    expect(supplierRes.status).toBe(200);
    const supplierId = Number(supplierRes.body.data.id);

    const poRes = await request(app)
      .post('/api/v1/procurement/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        supplierId,
        date: '2026-02-10T00:00:00.000Z',
        lines: [
          {
            itemId: item.id,
            description: 'توريد مادة',
            quantity: 5,
            unitPrice: 12.5,
            taxRate: 15
          }
        ]
      });

    expect(poRes.status).toBe(201);
    const purchaseOrderId = Number(poRes.body.data.id);

    const approvePoRes = await request(app)
      .post(`/api/v1/procurement/orders/${purchaseOrderId}/approve`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(approvePoRes.status).toBe(200);

    const receiptRes = await request(app)
      .post(`/api/v1/procurement/orders/${purchaseOrderId}/receipts`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        warehouseId: warehouse.id,
        notes: 'استلام أولي'
      });

    expect(receiptRes.status).toBe(201);
    expect(receiptRes.body.success).toBe(true);
    const receiptId = Number(receiptRes.body.data.id);
    expect(String(receiptRes.body.data.number)).toContain('GRN');

    const approveReceiptRes = await request(app)
      .post(`/api/v1/procurement/receipts/${receiptId}/approve`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(approveReceiptRes.status).toBe(200);
    expect(approveReceiptRes.body.data.status).toBe('RECEIVED');

    const stockMove = await prisma.stockMovement.findFirst({
      where: { reference: approveReceiptRes.body.data.number, itemId: item.id },
      orderBy: { id: 'desc' }
    });
    expect(stockMove).toBeTruthy();
    expect(Number(stockMove!.quantity)).toBeCloseTo(5, 6);

    const vendorInvoiceRes = await request(app)
      .post(`/api/v1/procurement/receipts/${receiptId}/to-vendor-invoice`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        date: '2026-02-12T00:00:00.000Z',
        dueDate: '2026-03-12T00:00:00.000Z',
        notes: 'فاتورة مورد من سند استلام'
      });

    expect(vendorInvoiceRes.status).toBe(201);
    const vendorInvoiceId = Number(vendorInvoiceRes.body.data.id);

    const issueInvoiceRes = await request(app)
      .post(`/api/v1/procurement/vendor-invoices/${vendorInvoiceId}/issue`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(issueInvoiceRes.status).toBe(200);
    expect(issueInvoiceRes.body.data.status).toBe('ISSUED');
    expect(Number(issueInvoiceRes.body.data.journalEntryId)).toBeGreaterThan(0);

    const listVendorInvoices = await request(app)
      .get('/api/v1/procurement/vendor-invoices')
      .set('Authorization', `Bearer ${token}`)
      .query({ supplierId });

    expect(listVendorInvoices.status).toBe(200);
    expect(Array.isArray(listVendorInvoices.body.data)).toBe(true);
    expect(listVendorInvoices.body.data.some((row: { id: number }) => row.id === vendorInvoiceId)).toBe(true);

    await prisma.invoice.delete({ where: { id: vendorInvoiceId } });
    await prisma.purchaseReceipt.delete({ where: { id: receiptId } });
    await prisma.purchaseOrderLine.deleteMany({ where: { purchaseOrderId } });
    await prisma.purchaseOrder.delete({ where: { id: purchaseOrderId } });
    await prisma.supplier.delete({ where: { id: supplierId } });
    await prisma.stockMovement.deleteMany({ where: { itemId: item.id, reference: approveReceiptRes.body.data.number } });
    await prisma.stockBalance.deleteMany({ where: { itemId: item.id, warehouseId: warehouse.id } });
    await prisma.item.delete({ where: { id: item.id } });
    await prisma.warehouse.delete({ where: { id: warehouse.id } });
  });
});
