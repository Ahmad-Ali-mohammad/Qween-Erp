import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/config/database';
import { ensureAdminUser, loginAdmin, uniqueCode } from './helpers';

function binaryParser(res: any, callback: (error: Error | null, body?: Buffer) => void) {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
}

describe('Printing export API v1', () => {
  beforeAll(async () => {
    await ensureAdminUser();
  });

  it('exports preview templates as PDF', async () => {
    const token = await loginAdmin();

    const res = await request(app)
      .post('/api/v1/printing/export/preview')
      .set('Authorization', `Bearer ${token}`)
      .buffer(true)
      .parse(binaryParser)
      .send({
        entityType: 'purchase_order',
        format: 'pdf',
        content: '<section><h1>{{document.number}}</h1><p>{{supplier.name}}</p></section>',
        sampleData: {
          document: { number: 'PO-PDF-001' },
          supplier: { name: 'PDF Supplier' }
        }
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(String(res.headers['content-disposition'])).toContain('.pdf');
    expect(Buffer.isBuffer(res.body)).toBe(true);
    expect((res.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
  });

  it('exports stored purchase order documents as Excel', async () => {
    const token = await loginAdmin();
    const supplier = await prisma.supplier.create({
      data: {
        code: uniqueCode('SUPX'),
        nameAr: 'Excel Supplier'
      }
    });

    const orderRes = await request(app)
      .post('/api/v1/purchase-orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        supplierId: supplier.id,
        lines: [
          {
            description: 'Generator cable',
            quantity: 4,
            unitPrice: 110
          }
        ]
      });

    expect(orderRes.status).toBe(201);
    const orderId = Number(orderRes.body.data.id);

    const exportRes = await request(app)
      .post(`/api/v1/printing/export/purchase_order/${orderId}`)
      .set('Authorization', `Bearer ${token}`)
      .buffer(true)
      .parse(binaryParser)
      .send({
        format: 'xlsx'
      });

    expect(exportRes.status).toBe(200);
    expect(exportRes.headers['content-type']).toContain(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    expect(String(exportRes.headers['content-disposition'])).toContain('.xlsx');
    expect(Buffer.isBuffer(exportRes.body)).toBe(true);
    expect((exportRes.body as Buffer).subarray(0, 2).toString()).toBe('PK');

    await prisma.purchaseOrder.delete({ where: { id: orderId } });
    await prisma.supplier.delete({ where: { id: supplier.id } });
  });
});
