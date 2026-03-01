import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/config/database';
import { ensureAdminUser, loginAdmin, uniqueCode } from './helpers';

describe('Purchase orders workflow', () => {
  beforeAll(async () => {
    await ensureAdminUser();
  });

  it('supports valid lifecycle and blocks invalid convert state', async () => {
    const token = await loginAdmin();
    const supplier = await prisma.supplier.create({
      data: {
        code: uniqueCode('SUP'),
        nameAr: 'مورد اختبار طلب شراء'
      }
    });

    const createRes = await request(app)
      .post('/api/purchase-orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        supplierId: supplier.id,
        expectedDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
        notes: 'طلب اختبار',
        lines: [
          {
            description: 'بند اختبار',
            quantity: 2,
            unitPrice: 100,
            discount: 0,
            taxRate: 15
          }
        ]
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.success).toBe(true);
    const orderId = createRes.body.data.id as number;

    const invalidConvert = await request(app)
      .post(`/api/purchase-orders/${orderId}/convert`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(invalidConvert.status).toBe(400);
    expect(invalidConvert.body.success).toBe(false);

    const approveRes = await request(app)
      .post(`/api/purchase-orders/${orderId}/approve`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.data.status).toBe('APPROVED');

    const sendRes = await request(app)
      .post(`/api/purchase-orders/${orderId}/send`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(sendRes.status).toBe(200);
    expect(sendRes.body.data.status).toBe('SENT');

    const convertRes = await request(app)
      .post(`/api/purchase-orders/${orderId}/convert`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(convertRes.status).toBe(200);
    expect(convertRes.body.success).toBe(true);
    expect(typeof convertRes.body.data.invoiceId).toBe('number');

    const invoice = await prisma.invoice.findUnique({ where: { id: convertRes.body.data.invoiceId as number } });
    expect(invoice).toBeTruthy();
    expect(invoice?.type).toBe('PURCHASE');
    expect(invoice?.status).toBe('DRAFT');

    const secondConvert = await request(app)
      .post(`/api/purchase-orders/${orderId}/convert`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(secondConvert.status).toBe(400);
    expect(secondConvert.body.success).toBe(false);
  });
});
