import fs from 'fs/promises';
import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/config/database';
import { resolveStoredFile } from '../../src/modules/printing/storage';
import { ensureAdminUser, loginAdmin, uniqueCode } from './helpers';

function binaryParser(res: any, callback: (error: Error | null, body?: Buffer) => void) {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
}

describe('Printing jobs API v1', () => {
  beforeAll(async () => {
    await ensureAdminUser();
  });

  it('creates a stored print job, persists an attachment, and downloads the generated file', async () => {
    const token = await loginAdmin();
    const supplier = await prisma.supplier.create({
      data: {
        code: uniqueCode('SUPJ'),
        nameAr: 'Job Supplier'
      }
    });

    const orderRes = await request(app)
      .post('/api/v1/purchase-orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        supplierId: supplier.id,
        lines: [
          {
            description: 'Transformer',
            quantity: 2,
            unitPrice: 350
          }
        ]
      });

    expect(orderRes.status).toBe(201);
    const orderId = Number(orderRes.body.data.id);

    const createJobRes = await request(app)
      .post(`/api/v1/printing/jobs/purchase_order/${orderId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        format: 'pdf'
      });

    expect(createJobRes.status).toBe(201);
    expect(createJobRes.body.success).toBe(true);
    expect(createJobRes.body.data.job.status).toBe('COMPLETED');
    expect(typeof createJobRes.body.data.job.attachmentId).toBe('number');

    const printJobId = Number(createJobRes.body.data.job.id);
    const attachmentId = Number(createJobRes.body.data.job.attachmentId);

    const getJobRes = await request(app)
      .get(`/api/v1/printing/jobs/${printJobId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(getJobRes.status).toBe(200);
    expect(getJobRes.body.data.job.attachment.id).toBe(attachmentId);

    const attachment = await prisma.attachment.findUnique({ where: { id: attachmentId } });
    expect(attachment).toBeTruthy();
    expect(attachment?.entityType).toBe('print_job');

    const storedFilePath = resolveStoredFile(attachment!.storageKey);
    const stat = await fs.stat(storedFilePath);
    expect(stat.size).toBeGreaterThan(0);

    const downloadRes = await request(app)
      .get(`/api/v1/printing/jobs/${printJobId}/download`)
      .set('Authorization', `Bearer ${token}`)
      .buffer(true)
      .parse(binaryParser);

    expect(downloadRes.status).toBe(200);
    expect(downloadRes.headers['content-type']).toContain('application/pdf');
    expect((downloadRes.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');

    const listJobsRes = await request(app)
      .get('/api/v1/printing/jobs?entityType=purchase_order')
      .set('Authorization', `Bearer ${token}`);

    expect(listJobsRes.status).toBe(200);
    expect(listJobsRes.body.data.rows.some((row: { id: number }) => row.id === printJobId)).toBe(true);

    await prisma.printJob.delete({ where: { id: printJobId } });
    await prisma.attachment.delete({ where: { id: attachmentId } });
    await fs.rm(storedFilePath, { force: true });
    await prisma.purchaseOrder.delete({ where: { id: orderId } });
    await prisma.supplier.delete({ where: { id: supplier.id } });
  });
});
