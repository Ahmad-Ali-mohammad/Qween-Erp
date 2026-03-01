import request from 'supertest';
import { app } from '../../src/app';
import { ensureAdminUser, loginAdmin, uniqueCode } from './helpers';

describe('Stage 4 workflow coverage (Banks & Treasury)', () => {
  let token = '';

  beforeAll(async () => {
    await ensureAdminUser();
    token = await loginAdmin();
  });

  it('runs bank reconciliation workflow with guard rails', async () => {
    const bankA = await request(app)
      .post('/api/bank-accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Stage4 Bank A',
        accountNumber: uniqueCode('BKA'),
        bankName: 'Test Bank A',
        accountType: 'Current',
        openingBalance: 100
      });
    expect(bankA.status).toBe(201);
    const bankAId = Number(bankA.body.data.id);
    expect(bankAId).toBeGreaterThan(0);

    const bankB = await request(app)
      .post('/api/bank-accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Stage4 Bank B',
        accountNumber: uniqueCode('BKB'),
        bankName: 'Test Bank B',
        accountType: 'Current',
        openingBalance: 0
      });
    expect(bankB.status).toBe(201);
    const bankBId = Number(bankB.body.data.id);
    expect(bankBId).toBeGreaterThan(0);

    const txA = await request(app)
      .post('/api/bank-transactions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        bankId: bankAId,
        date: new Date().toISOString().slice(0, 10),
        description: 'Stage4 Bank A credit',
        debit: 0,
        credit: 400
      });
    expect(txA.status).toBe(201);
    const txAId = Number(txA.body.data.id);
    expect(txAId).toBeGreaterThan(0);

    const txB = await request(app)
      .post('/api/bank-transactions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        bankId: bankBId,
        date: new Date().toISOString().slice(0, 10),
        description: 'Stage4 Bank B credit',
        debit: 0,
        credit: 300
      });
    expect(txB.status).toBe(201);
    const txBId = Number(txB.body.data.id);
    expect(txBId).toBeGreaterThan(0);

    const recon = await request(app)
      .post('/api/bank-reconciliations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        bankId: bankAId,
        statementDate: new Date().toISOString().slice(0, 10),
        statementBalance: 450
      });
    expect(recon.status).toBe(201);
    const reconId = Number(recon.body.data.id);
    expect(reconId).toBeGreaterThan(0);

    const wrongMatch = await request(app)
      .post(`/api/bank-reconciliations/${reconId}/match`)
      .set('Authorization', `Bearer ${token}`)
      .send({ transactionId: txBId });
    expect(wrongMatch.status).toBe(400);

    const match = await request(app)
      .post(`/api/bank-reconciliations/${reconId}/match`)
      .set('Authorization', `Bearer ${token}`)
      .send({ transactionId: txAId });
    expect(match.status).toBe(200);
    expect(match.body.success).toBe(true);

    const complete = await request(app)
      .post(`/api/bank-reconciliations/${reconId}/complete`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(complete.status).toBe(200);
    expect(complete.body.data.status).toBe('COMPLETED');
    expect(Number(complete.body.data.settings.matchedCount)).toBe(1);

    const txAfter = await request(app).get(`/api/bank-transactions/${txAId}`).set('Authorization', `Bearer ${token}`);
    expect(txAfter.status).toBe(200);
    expect(txAfter.body.success).toBe(true);
    expect(Boolean(txAfter.body.data.isReconciled)).toBe(true);

    const matchAfterComplete = await request(app)
      .post(`/api/bank-reconciliations/${reconId}/match`)
      .set('Authorization', `Bearer ${token}`)
      .send({ transactionId: txAId });
    expect(matchAfterComplete.status).toBe(400);

    const completeAgain = await request(app)
      .post(`/api/bank-reconciliations/${reconId}/complete`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(completeAgain.status).toBe(400);
  });

  it('runs cashbox workflow with balance controls', async () => {
    const cashboxCreate = await request(app)
      .post('/api/cashboxes')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Stage4 Cashbox',
        accountNumber: uniqueCode('CSH4'),
        bankName: 'Cashbox',
        accountType: 'CASHBOX',
        openingBalance: 0,
        currentBalance: 0
      });
    expect(cashboxCreate.status).toBe(201);
    const cashboxId = Number(cashboxCreate.body.data.id);
    expect(cashboxId).toBeGreaterThan(0);

    const deposit = await request(app)
      .post('/api/cash-transactions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        cashboxId,
        direction: 'DEPOSIT',
        amount: 200,
        description: 'Stage4 cash deposit'
      });
    expect(deposit.status).toBe(201);
    expect(Number(deposit.body.data.balance)).toBe(200);

    const withdraw = await request(app)
      .post('/api/cash-transactions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        cashboxId,
        direction: 'WITHDRAW',
        amount: 50,
        description: 'Stage4 cash withdraw'
      });
    expect(withdraw.status).toBe(201);
    expect(Number(withdraw.body.data.balance)).toBe(150);

    const overWithdraw = await request(app)
      .post('/api/cash-transactions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        cashboxId,
        direction: 'WITHDRAW',
        amount: 1000,
        description: 'Stage4 over withdraw'
      });
    expect(overWithdraw.status).toBe(400);

    const list = await request(app)
      .get('/api/cash-transactions')
      .set('Authorization', `Bearer ${token}`)
      .query({ cashboxId });
    expect(list.status).toBe(200);
    expect(list.body.success).toBe(true);
    expect(Array.isArray(list.body.data)).toBe(true);
    expect(list.body.data.length).toBeGreaterThanOrEqual(2);

    const cashboxAfter = await request(app).get(`/api/cashboxes/${cashboxId}`).set('Authorization', `Bearer ${token}`);
    expect(cashboxAfter.status).toBe(200);
    expect(cashboxAfter.body.success).toBe(true);
    expect(Number(cashboxAfter.body.data.currentBalance)).toBe(150);
  });
});
