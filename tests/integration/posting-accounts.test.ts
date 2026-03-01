import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/config/database';
import { ensureAdminUser, loginAdmin } from './helpers';
import { resolvePostingAccounts } from '../../src/modules/shared/posting-accounts';

describe('Posting accounts settings', () => {
  beforeAll(async () => {
    await ensureAdminUser();
  });

  it('rejects invalid account IDs in /settings/system', async () => {
    const token = await loginAdmin();
    const res = await request(app)
      .put('/api/settings/system')
      .set('Authorization', `Bearer ${token}`)
      .send({
        postingAccounts: {
          cashAccountId: 999999999
        }
      });

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
  });

  it('uses fallback accounts when postingAccounts is empty', async () => {
    await prisma.systemSettings.upsert({
      where: { id: 1 },
      update: { postingAccounts: {} },
      create: { id: 1, postingAccounts: {} }
    });

    const resolved = await resolvePostingAccounts(prisma as any);
    expect(typeof resolved.receivableAccountId).toBe('number');
    expect(typeof resolved.payableAccountId).toBe('number');
    expect(typeof resolved.salesRevenueAccountId).toBe('number');
    expect(typeof resolved.purchaseExpenseAccountId).toBe('number');
    expect(typeof resolved.cashAccountId).toBe('number');

    const ids = [
      resolved.receivableAccountId,
      resolved.payableAccountId,
      resolved.salesRevenueAccountId,
      resolved.purchaseExpenseAccountId,
      resolved.vatLiabilityAccountId,
      resolved.vatRecoverableAccountId,
      resolved.cashAccountId
    ];
    const rows = await prisma.account.findMany({ where: { id: { in: ids } }, select: { code: true } });
    const codes = new Set(rows.map((r) => r.code));

    expect(codes.has('1300')).toBe(true);
    expect(codes.has('2100')).toBe(true);
    expect(codes.has('4100')).toBe(true);
    expect(codes.has('5100')).toBe(true);
    expect(codes.has('2200')).toBe(true);
    expect(codes.has('1100')).toBe(true);
  });
});
