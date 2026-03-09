import request from 'supertest';
import { app } from '../../src/app';

describe('Root frontend redirect', () => {
  it('GET / should redirect to /portal', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/portal');
  });
});
