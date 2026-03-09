import request from 'supertest';
import { app } from '../../src/app';
import { ensureAdminUser, loginAdmin } from './helpers';

describe('Central portal foundation', () => {
  let token = '';

  beforeAll(async () => {
    await ensureAdminUser();
    token = await loginAdmin();
  });

  it('exposes the system catalog and central health endpoints', async () => {
    const appsRes = await request(app).get('/api/v1/central/apps');

    expect(appsRes.status).toBe(200);
    expect(appsRes.body.success).toBe(true);
    expect(appsRes.body.data.length).toBeGreaterThanOrEqual(20);
    expect(
      appsRes.body.data.some(
        (row: { key: string; routeBase: string }) => row.key === 'control-center' && row.routeBase === '/portal'
      )
    ).toBe(true);
    expect(
      appsRes.body.data.some(
        (row: { key: string; routeBase: string }) => row.key === 'accounting' && row.routeBase === '/systems/accounting'
      )
    ).toBe(true);

    const healthRes = await request(app).get('/api/v1/central/health');

    expect(healthRes.status).toBe(200);
    expect(healthRes.body.data.baseCurrency).toBe('KWD');
    expect(Array.isArray(healthRes.body.data.systems)).toBe(true);
  });

  it('returns permission-aware navigation and accepts central events', async () => {
    const navigationRes = await request(app)
      .get('/api/v1/central/navigation')
      .set('Authorization', `Bearer ${token}`);

    expect(navigationRes.status).toBe(200);
    expect(navigationRes.body.data.some((group: { items: unknown[] }) => group.items.length >= 1)).toBe(true);

    const permissionsRes = await request(app)
      .get('/api/v1/central/permissions')
      .set('Authorization', `Bearer ${token}`);

    expect(permissionsRes.status).toBe(200);
    expect(permissionsRes.body.data.username).toBe('admin');

    const eventRes = await request(app)
      .post('/api/v1/central/events')
      .set('Authorization', `Bearer ${token}`)
      .send({
        eventName: 'portal.app.opened',
        aggregateType: 'system',
        aggregateId: 'control-center',
        payload: { source: 'integration-test' }
      });

    expect(eventRes.status).toBe(202);
    expect(eventRes.body.data.status).toBe('ACCEPTED');
    expect(eventRes.body.data.ackId).toBeTruthy();

    const approvalRes = await request(app)
      .post('/api/v1/central/approval-requests')
      .set('Authorization', `Bearer ${token}`)
      .send({
        workflowKey: 'control-center-test',
        title: 'Portal rollout approval',
        entityType: 'deployment',
        entityId: 'portal-v1'
      });

    expect(approvalRes.status).toBe(202);
    expect(approvalRes.body.data.status).toBe('PENDING');
  });
});

