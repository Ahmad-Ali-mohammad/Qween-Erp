import request from 'supertest';
import { app } from '../../src/app';

describe('Health API', () => {
  it('GET /api/health should return success', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('OK');
    expect(res.body.data.observability.sentry).toMatchObject({
      configured: expect.any(Boolean),
      enabled: expect.any(Boolean),
      environment: expect.any(String),
      tracesSampleRate: expect.any(Number)
    });
  });
});
