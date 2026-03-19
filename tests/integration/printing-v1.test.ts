import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/config/database';
import { ensureAdminUser, loginAdmin, uniqueCode } from './helpers';

describe('Printing templates API v1', () => {
  beforeAll(async () => {
    await ensureAdminUser();
  });

  it('bootstraps default templates and renders preview html', async () => {
    const token = await loginAdmin();

    const bootstrapRes = await request(app)
      .post('/api/v1/printing/templates/bootstrap-defaults')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(bootstrapRes.status).toBe(200);
    expect(bootstrapRes.body.success).toBe(true);
    expect(bootstrapRes.body.data.total).toBeGreaterThanOrEqual(4);

    const defaultsRes = await request(app)
      .get('/api/v1/printing/templates/defaults')
      .set('Authorization', `Bearer ${token}`);

    expect(defaultsRes.status).toBe(200);
    expect(defaultsRes.body.data.defaults.some((row: { entityType: string }) => row.entityType === 'purchase_order')).toBe(true);

    const previewRes = await request(app)
      .post('/api/v1/printing/render/preview')
      .set('Authorization', `Bearer ${token}`)
      .send({
        entityType: 'purchase_order',
        content: '<article><h1>{{document.number}}</h1><p>{{supplier.name}}</p></article>',
        sampleData: {
          document: { number: 'PO-PREVIEW-001' },
          supplier: { name: 'Preview Supplier' }
        }
      });

    expect(previewRes.status).toBe(200);
    expect(previewRes.body.success).toBe(true);
    expect(previewRes.body.data.html).toContain('PO-PREVIEW-001');
    expect(previewRes.body.data.html).toContain('Preview Supplier');
  });

  it('creates a custom template and renders a purchase order document', async () => {
    const token = await loginAdmin();
    const supplierCode = uniqueCode('SUP');
    const templateKey = uniqueCode('tmpl').toLowerCase();

    const supplier = await prisma.supplier.create({
      data: {
        code: supplierCode,
        nameAr: 'Supplier For Printing'
      }
    });

    const orderRes = await request(app)
      .post('/api/v1/procurement/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        supplierId: supplier.id,
        lines: [
          {
            description: 'Cable tray',
            quantity: 12,
            unitPrice: 25
          }
        ]
      });

    expect(orderRes.status).toBe(201);
    const orderId = Number(orderRes.body.data.id);

    const templateRes = await request(app)
      .post('/api/v1/printing/templates')
      .set('Authorization', `Bearer ${token}`)
      .send({
        key: templateKey,
        entityType: 'purchase_order',
        nameAr: 'Custom PO Template',
        nameEn: 'Custom PO Template',
        isDefault: false,
        content:
          '<section><header>PO {{document.number}}</header><ul>{{#each lines}}<li>{{description}} - {{totalDisplay}}</li>{{/each}}</ul><footer>{{supplier.name}}</footer></section>'
      });

    expect(templateRes.status).toBe(201);
    expect(templateRes.body.success).toBe(true);
    const templateId = Number(templateRes.body.data.id);

    const listRes = await request(app)
      .get('/api/v1/printing/templates?entityType=purchase_order')
      .set('Authorization', `Bearer ${token}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.data.some((row: { id: number }) => row.id === templateId)).toBe(true);

    const renderRes = await request(app)
      .post(`/api/v1/printing/render/purchase_order/${orderId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        templateId
      });

    expect(renderRes.status).toBe(200);
    expect(renderRes.body.success).toBe(true);
    expect(renderRes.body.data.template.source).toBe('stored');
    expect(renderRes.body.data.html).toContain('PO ');
    expect(renderRes.body.data.html).toContain('Cable tray');
    expect(renderRes.body.data.html).toContain('Supplier For Printing');

    await prisma.documentTemplate.delete({ where: { id: templateId } });
    await prisma.purchaseOrder.delete({ where: { id: orderId } });
    await prisma.supplier.delete({ where: { id: supplier.id } });
  });
});
