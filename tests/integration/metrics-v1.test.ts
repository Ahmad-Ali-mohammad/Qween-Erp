import request from 'supertest';
import { app } from '../../src/app';
import { env } from '../../src/config/env';

describe('Metrics API v1', () => {
  const originalToken = env.metricsToken;

  afterAll(() => {
    env.metricsToken = originalToken;
  });

  it('returns Prometheus metrics and exposes recorded API traffic', async () => {
    env.metricsToken = '';

    const healthRes = await request(app).get('/api/v1/health');
    expect(healthRes.status).toBe(200);

    const metricsRes = await request(app).get('/api/v1/metrics');

    expect(metricsRes.status).toBe(200);
    expect(metricsRes.headers['content-type']).toContain('text/plain');
    expect(metricsRes.text).toContain('erp_qween_http_requests_total');
    expect(metricsRes.text).toMatch(/route="\/api\/v1\/health"/);
  });

  it('requires a metrics token when configured', async () => {
    env.metricsToken = 'metrics-secret';

    const unauthorizedRes = await request(app).get('/api/v1/metrics');
    expect(unauthorizedRes.status).toBe(401);
    expect(unauthorizedRes.body.success).toBe(false);

    const authorizedRes = await request(app).get('/api/v1/metrics').set('x-metrics-token', 'metrics-secret');
    expect(authorizedRes.status).toBe(200);
    expect(authorizedRes.text).toContain('erp_qween_http_request_duration_seconds');
  });
});
