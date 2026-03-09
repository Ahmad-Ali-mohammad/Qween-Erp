import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/config/database';
import { ensureAdminUser, loginAdmin, uniqueCode } from './helpers';

describe('Auth register and sync batch APIs', () => {
  beforeAll(async () => {
    await ensureAdminUser();
  });

  it('registers a self-service user with the default employee role', async () => {
    const username = uniqueCode('reg').toLowerCase();
    const email = `${username}@erp.local`;

    const res = await request(app).post('/api/auth/register').send({
      username,
      email,
      fullName: 'Registered User',
      password: 'pass1234',
      phone: '0500000001'
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.data.token).toBe('string');
    expect(res.body.data.user.username).toBe(username);

    const created = await prisma.user.findUnique({
      where: { username },
      include: { role: true }
    });

    expect(created).toBeTruthy();
    expect(created!.role.name).toBe('employee');

    await prisma.user.delete({ where: { username } });
  });

  it('applies sync batches with last-write-wins and logs conflicts', async () => {
    const token = await loginAdmin();
    const code = uniqueCode('SYNC-PRJ');

    const projectRes = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code,
        nameAr: 'Sync Project',
        status: 'Active',
        isActive: true,
        actualCost: 0
      });

    expect(projectRes.status).toBe(201);
    const projectId = Number(projectRes.body.data.id);

    const syncRes = await request(app)
      .post('/api/sync')
      .set('Authorization', `Bearer ${token}`)
      .send({
        batchId: uniqueCode('batch'),
        operations: [
          {
            resource: 'projects',
            action: 'update',
            match: { code },
            clientUpdatedAt: '2020-01-01T00:00:00.000Z',
            data: {
              nameAr: 'Synced Project Updated',
              description: 'Updated from sync batch'
            }
          }
        ]
      });

    expect(syncRes.status).toBe(202);
    expect(syncRes.body.success).toBe(true);
    expect(syncRes.body.data.strategy).toBe('LAST_WRITE_WINS');
    expect(syncRes.body.data.summary.updated).toBe(1);
    expect(syncRes.body.data.summary.conflicts).toBe(1);

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    expect(project).toBeTruthy();
    expect(project!.nameAr).toBe('Synced Project Updated');

    const conflictLog = await prisma.auditLog.findFirst({
      where: {
        table: 'sync_conflicts',
        recordId: projectId,
        action: 'SYNC_CONFLICT'
      },
      orderBy: { id: 'desc' }
    });

    expect(conflictLog).toBeTruthy();

    await prisma.project.delete({ where: { id: projectId } });
  });
});
