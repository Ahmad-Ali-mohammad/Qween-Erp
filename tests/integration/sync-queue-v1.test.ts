import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/config/database';
import { env } from '../../src/config/env';
import { shutdownSyncQueue } from '../../src/modules/sync/queue';
import { ensureAdminUser, loginAdmin, uniqueCode } from './helpers';

describe('Sync queue fallback v1', () => {
  const originalBullmqEnabled = env.bullmqEnabled;
  const originalRedisUrl = env.redisUrl;
  const originalQueueName = env.syncQueueName;

  beforeAll(async () => {
    await ensureAdminUser();
  });

  afterEach(async () => {
    env.bullmqEnabled = originalBullmqEnabled;
    env.redisUrl = originalRedisUrl;
    env.syncQueueName = originalQueueName;
    await shutdownSyncQueue();
  });

  it('exposes queue capabilities on sync resources', async () => {
    const token = await loginAdmin();
    env.bullmqEnabled = true;
    env.redisUrl = '';
    env.syncQueueName = 'sync-batches-test';

    const res = await request(app).get('/api/v1/sync/resources').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.queue).toEqual({
      enabled: true,
      configured: false,
      available: false,
      initialized: false,
      queueName: 'sync-batches-test'
    });
  });

  it('falls back to inline sync when queue is enabled without Redis', async () => {
    const token = await loginAdmin();
    env.bullmqEnabled = true;
    env.redisUrl = '';

    const code = uniqueCode('SYNC-Q');

    const projectRes = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code,
        nameAr: 'مشروع مزامنة مع fallback',
        status: 'Active',
        isActive: true,
        actualCost: 0
      });

    expect(projectRes.status).toBe(201);
    const projectId = Number(projectRes.body.data.id);

    const syncRes = await request(app)
      .post('/api/v1/sync')
      .set('Authorization', `Bearer ${token}`)
      .send({
        batchId: uniqueCode('batch-fallback'),
        operations: [
          {
            resource: 'projects',
            action: 'update',
            match: { code },
            data: {
              nameAr: 'مشروع مزامنة fallback محدث'
            }
          }
        ]
      });

    expect(syncRes.status).toBe(202);
    expect(syncRes.body.success).toBe(true);
    expect(syncRes.body.data.mode).toBe('inline');
    expect(syncRes.body.data.queue.enabled).toBe(true);
    expect(syncRes.body.data.queue.configured).toBe(false);
    expect(syncRes.body.data.queue.available).toBe(false);
    expect(syncRes.body.data.queue.fallbackUsed).toBe(true);
    expect(syncRes.body.data.summary.updated).toBe(1);

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    expect(project?.nameAr).toBe('مشروع مزامنة fallback محدث');

    await prisma.project.delete({ where: { id: projectId } });
  });
});
