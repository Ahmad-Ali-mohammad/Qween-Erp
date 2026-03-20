import request from 'supertest';
import { app } from '../../src/app';
import { ensureAdminUser, loginAdmin } from './helpers';

const namespaces = [
  'finance',
  'crm',
  'hr',
  'printing',
  'control-center',
  'projects',
  'procurement',
  'inventory',
  'assets',
  'subcontractors',
  'site-ops',
  'documents',
  'analytics',
  'quality',
  'maintenance',
  'contracts',
  'tendering',
  'budgeting',
  'risk',
  'scheduling'
];

const sections = ['summary', 'queues', 'activity', 'alerts', 'charts'];

describe('Wave A system dashboard contracts', () => {
  let token = '';

  beforeAll(async () => {
    await ensureAdminUser();
    token = await loginAdmin();
  });

  it('serves all canonical dashboard endpoints with consistent array payloads', async () => {
    for (const namespace of namespaces) {
      for (const section of sections) {
        const response = await request(app)
          .get(`/api/${namespace}/dashboard/${section}`)
          .set('Authorization', `Bearer ${token}`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(Array.isArray(response.body.data)).toBe(true);
      }
    }
  });
});
