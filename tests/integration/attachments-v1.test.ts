import fs from 'fs/promises';
import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/config/database';
import { resolveStoredFile } from '../../src/services/file-storage';
import { ensureAdminUser, loginAdmin } from './helpers';

function binaryParser(res: any, callback: (error: Error | null, body?: Buffer) => void) {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
}

describe('Attachments API v1', () => {
  beforeAll(async () => {
    await ensureAdminUser();
  });

  it('creates, lists, downloads, and deletes a generic attachment', async () => {
    const token = await loginAdmin();
    const entityType = 'project';
    const entityId = 991001;
    const fileName = 'scope-note.txt';
    const content = Buffer.from('ERP Qween attachment payload', 'utf8');

    const createRes = await request(app)
      .post('/api/v1/attachments')
      .set('Authorization', `Bearer ${token}`)
      .send({
        entityType,
        entityId,
        fileName,
        mimeType: 'text/plain',
        metadata: {
          module: 'projects',
          stage: 'integration-test'
        },
        contentBase64: content.toString('base64')
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.success).toBe(true);
    expect(createRes.body.data.attachment.fileName).toBe(fileName);
    expect(createRes.body.data.storage.driver).toBeTruthy();

    const attachmentId = Number(createRes.body.data.attachment.id);
    const storageKey = String(createRes.body.data.attachment.storageKey);

    const attachmentRes = await request(app)
      .get(`/api/v1/attachments/${attachmentId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(attachmentRes.status).toBe(200);
    expect(attachmentRes.body.data.attachment.entityType).toBe(entityType);

    const listRes = await request(app)
      .get(`/api/v1/attachments?entityType=${entityType}&entityId=${entityId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.data.rows.some((row: { id: number }) => row.id === attachmentId)).toBe(true);

    const downloadRes = await request(app)
      .get(`/api/v1/attachments/${attachmentId}/download`)
      .set('Authorization', `Bearer ${token}`)
      .buffer(true)
      .parse(binaryParser);

    expect(downloadRes.status).toBe(200);
    expect(downloadRes.headers['content-type']).toContain('text/plain');
    expect((downloadRes.body as Buffer).toString('utf8')).toBe(content.toString('utf8'));

    const storedFilePath = resolveStoredFile(storageKey);
    const storedFileStat = await fs.stat(storedFilePath);
    expect(storedFileStat.size).toBe(content.length);

    const deleteRes = await request(app)
      .delete(`/api/v1/attachments/${attachmentId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.data.deleted).toBe(true);

    const deleted = await prisma.attachment.findUnique({ where: { id: attachmentId } });
    expect(deleted).toBeNull();

    await expect(fs.stat(storedFilePath)).rejects.toThrow();
  });

  it('supports /documents alias endpoints over the same attachment service', async () => {
    const token = await loginAdmin();
    const entityType = 'contract';
    const entityId = 992002;
    const fileName = 'contract-note.txt';
    const content = Buffer.from('ERP Qween documents alias payload', 'utf8');

    const createRes = await request(app)
      .post('/api/v1/documents')
      .set('Authorization', `Bearer ${token}`)
      .send({
        entityType,
        entityId,
        fileName,
        mimeType: 'text/plain',
        contentBase64: content.toString('base64')
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.success).toBe(true);
    expect(createRes.body.data.attachment.fileName).toBe(fileName);

    const attachmentId = Number(createRes.body.data.attachment.id);
    const storageKey = String(createRes.body.data.attachment.storageKey);

    const listRes = await request(app)
      .get(`/api/v1/documents?entityType=${entityType}&entityId=${entityId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.data.rows.some((row: { id: number }) => row.id === attachmentId)).toBe(true);

    const detailRes = await request(app)
      .get(`/api/v1/documents/${attachmentId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(detailRes.status).toBe(200);
    expect(detailRes.body.data.attachment.entityType).toBe(entityType);

    const downloadRes = await request(app)
      .get(`/api/v1/documents/${attachmentId}/download`)
      .set('Authorization', `Bearer ${token}`)
      .buffer(true)
      .parse(binaryParser);

    expect(downloadRes.status).toBe(200);
    expect(downloadRes.headers['content-type']).toContain('text/plain');
    expect((downloadRes.body as Buffer).toString('utf8')).toBe(content.toString('utf8'));

    const storedFilePath = resolveStoredFile(storageKey);
    const storedFileStat = await fs.stat(storedFilePath);
    expect(storedFileStat.size).toBe(content.length);

    const deleteRes = await request(app)
      .delete(`/api/v1/documents/${attachmentId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.data.deleted).toBe(true);

    const deleted = await prisma.attachment.findUnique({ where: { id: attachmentId } });
    expect(deleted).toBeNull();

    await expect(fs.stat(storedFilePath)).rejects.toThrow();
  });
});
