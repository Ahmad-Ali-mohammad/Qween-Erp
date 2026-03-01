import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/config/database';
import { ensureAdminUser, loginAdmin, uniqueCode } from './helpers';

describe('Stage 10 workflow coverage (Administration: Backups / Notifications / Tasks)', () => {
  let token = '';
  let adminUserId = 0;

  beforeAll(async () => {
    await ensureAdminUser();
    token = await loginAdmin();
    const admin = await prisma.user.findUnique({ where: { username: 'admin' }, select: { id: true } });
    expect(admin).toBeTruthy();
    adminUserId = Number(admin!.id);
  });

  it('covers backups lifecycle including schedule and restore request', async () => {
    const create = await request(app)
      .post('/api/backups')
      .set('Authorization', `Bearer ${token}`)
      .send({
        action: 'BACKUP',
        status: 'QUEUED',
        fileName: `${uniqueCode('BK10')}.zip`,
        isScheduled: true,
        scheduleExpr: '0 2 * * *',
        notes: 'Stage10 backup lifecycle',
        requestedAt: new Date().toISOString()
      });

    expect(create.status).toBe(201);
    expect(create.body.success).toBe(true);
    const backupId = Number(create.body.data.id);
    expect(backupId).toBeGreaterThan(0);

    const details = await request(app).get(`/api/backups/${backupId}`).set('Authorization', `Bearer ${token}`);
    expect(details.status).toBe(200);
    expect(details.body.success).toBe(true);
    expect(Number(details.body.data.id)).toBe(backupId);
    expect(Boolean(details.body.data.isScheduled)).toBe(true);

    const schedules = await request(app).get('/api/backups/schedules').set('Authorization', `Bearer ${token}`);
    expect(schedules.status).toBe(200);
    expect(schedules.body.success).toBe(true);
    expect(Array.isArray(schedules.body.data)).toBe(true);
    expect(schedules.body.data.some((r: any) => Number(r.id) === backupId)).toBe(true);

    const update = await request(app)
      .put(`/api/backups/${backupId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        status: 'COMPLETED',
        isScheduled: false,
        completedAt: new Date().toISOString()
      });
    expect(update.status).toBe(200);
    expect(update.body.success).toBe(true);
    expect(String(update.body.data.status)).toBe('COMPLETED');

    const restore = await request(app).post(`/api/backups/${backupId}/restore`).set('Authorization', `Bearer ${token}`).send({});
    expect(restore.status).toBe(202);
    expect(restore.body.success).toBe(true);
    expect(String(restore.body.data.action)).toBe('RESTORE');
    expect(Number(restore.body.data.sourceBackupId)).toBe(backupId);

    const restoreJobId = Number(restore.body.data.id);
    expect(restoreJobId).toBeGreaterThan(0);

    const deleteRestore = await request(app).delete(`/api/backups/${restoreJobId}`).set('Authorization', `Bearer ${token}`);
    expect(deleteRestore.status).toBe(200);
    expect(deleteRestore.body.success).toBe(true);

    const remove = await request(app).delete(`/api/backups/${backupId}`).set('Authorization', `Bearer ${token}`);
    expect(remove.status).toBe(200);
    expect(remove.body.success).toBe(true);
  });

  it('covers notifications lifecycle including unread count and mark-as-read actions', async () => {
    const notificationA = await request(app)
      .post('/api/notifications')
      .set('Authorization', `Bearer ${token}`)
      .send({
        userId: adminUserId,
        title: uniqueCode('NT10-A'),
        message: 'Stage10 notification A',
        type: 'INFO',
        isRead: false
      });
    expect(notificationA.status).toBe(201);
    const idA = Number(notificationA.body.data.id);
    expect(idA).toBeGreaterThan(0);

    const notificationB = await request(app)
      .post('/api/notifications')
      .set('Authorization', `Bearer ${token}`)
      .send({
        userId: adminUserId,
        title: uniqueCode('NT10-B'),
        message: 'Stage10 notification B',
        type: 'WARNING',
        isRead: false
      });
    expect(notificationB.status).toBe(201);
    const idB = Number(notificationB.body.data.id);
    expect(idB).toBeGreaterThan(0);

    const countBefore = await request(app).get('/api/notifications/count').set('Authorization', `Bearer ${token}`);
    expect(countBefore.status).toBe(200);
    expect(countBefore.body.success).toBe(true);
    expect(Number(countBefore.body.data.unread)).toBeGreaterThanOrEqual(2);

    const readOne = await request(app).post(`/api/notifications/${idA}/read`).set('Authorization', `Bearer ${token}`).send({});
    expect(readOne.status).toBe(200);
    expect(readOne.body.success).toBe(true);
    expect(Boolean(readOne.body.data.isRead)).toBe(true);

    const readAll = await request(app).post('/api/notifications/read-all').set('Authorization', `Bearer ${token}`).send({});
    expect(readAll.status).toBe(200);
    expect(readAll.body.success).toBe(true);
    expect(Number(readAll.body.data.updated)).toBeGreaterThanOrEqual(1);

    const dbA = await prisma.notification.findUnique({ where: { id: idA } });
    const dbB = await prisma.notification.findUnique({ where: { id: idB } });
    expect(dbA).toBeTruthy();
    expect(dbB).toBeTruthy();
    expect(Boolean(dbA!.isRead)).toBe(true);
    expect(Boolean(dbB!.isRead)).toBe(true);

    await request(app).delete(`/api/notifications/${idA}`).set('Authorization', `Bearer ${token}`);
    await request(app).delete(`/api/notifications/${idB}`).set('Authorization', `Bearer ${token}`);
  });

  it('covers tasks lifecycle with assign and status transitions', async () => {
    const create = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: uniqueCode('TSK10'),
        description: 'Stage10 task workflow',
        priority: 'MEDIUM',
        status: 'OPEN'
      });
    expect(create.status).toBe(201);
    expect(create.body.success).toBe(true);
    const taskId = Number(create.body.data.id);
    expect(taskId).toBeGreaterThan(0);

    const assign = await request(app)
      .post(`/api/tasks/${taskId}/assign`)
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: adminUserId });
    expect(assign.status).toBe(200);
    expect(assign.body.success).toBe(true);
    expect(Number(assign.body.data.userId)).toBe(adminUserId);

    const toInProgress = await request(app)
      .patch(`/api/tasks/${taskId}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'IN_PROGRESS' });
    expect(toInProgress.status).toBe(200);
    expect(toInProgress.body.success).toBe(true);
    expect(String(toInProgress.body.data.status)).toBe('IN_PROGRESS');

    const toDone = await request(app)
      .patch(`/api/tasks/${taskId}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'DONE' });
    expect(toDone.status).toBe(200);
    expect(toDone.body.success).toBe(true);
    expect(String(toDone.body.data.status)).toBe('DONE');

    const details = await request(app).get(`/api/tasks/${taskId}`).set('Authorization', `Bearer ${token}`);
    expect(details.status).toBe(200);
    expect(details.body.success).toBe(true);
    expect(Number(details.body.data.id)).toBe(taskId);
    expect(String(details.body.data.status)).toBe('DONE');
    expect(Number(details.body.data.userId)).toBe(adminUserId);

    const remove = await request(app).delete(`/api/tasks/${taskId}`).set('Authorization', `Bearer ${token}`);
    expect(remove.status).toBe(200);
    expect(remove.body.success).toBe(true);

    const deleted = await prisma.userTask.findUnique({ where: { id: taskId } });
    expect(deleted).toBeNull();
  });
});

