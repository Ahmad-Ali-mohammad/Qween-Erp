import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/config/database';
import { ensureAdminUser, loginAdmin, uniqueCode } from './helpers';

jest.setTimeout(30000);

describe('Stage 15 guard rails coverage (negative workflows)', () => {
  let token = '';
  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    await ensureAdminUser();
    token = await loginAdmin();
  });

  it('enforces bank reconciliation guard rails and cashbox restriction', async () => {
    await prisma.integrationSetting.deleteMany({ where: { key: { startsWith: 'bank-reconciliation:' } } });

    const bank1No = uniqueCode('B15A').toUpperCase();
    const bank2No = uniqueCode('B15B').toUpperCase();
    const cashboxNo = uniqueCode('C15A').toUpperCase();

    let bank1Id = 0;
    let bank2Id = 0;
    let tx1Id = 0;
    let tx2Id = 0;
    let reconId = 0;
    let cashboxId = 0;

    try {
      const bank1 = await request(app).post('/api/bank-accounts').set(auth()).send({
        name: 'Bank Stage 15 A',
        accountNumber: bank1No,
        bankName: 'Bank A',
        currency: 'SAR',
        openingBalance: 1000,
        currentBalance: 1000,
        isActive: true
      });
      expect(bank1.status).toBe(201);
      bank1Id = Number(bank1.body.data.id);

      const bank2 = await request(app).post('/api/bank-accounts').set(auth()).send({
        name: 'Bank Stage 15 B',
        accountNumber: bank2No,
        bankName: 'Bank B',
        currency: 'SAR',
        openingBalance: 500,
        currentBalance: 500,
        isActive: true
      });
      expect(bank2.status).toBe(201);
      bank2Id = Number(bank2.body.data.id);

      const tx2 = await request(app).post('/api/bank-transactions').set(auth()).send({
        bankId: bank2Id,
        date: new Date().toISOString(),
        description: 'Bank 2 txn',
        debit: 0,
        credit: 100
      });
      expect(tx2.status).toBe(201);
      tx2Id = Number(tx2.body.data.id);

      const recon = await request(app).post('/api/bank-reconciliations').set(auth()).send({
        bankId: bank1Id,
        statementBalance: 1100,
        statementDate: new Date().toISOString()
      });
      expect(recon.status).toBe(201);
      reconId = Number(recon.body.data.id);

      const wrongBankMatch = await request(app).post(`/api/bank-reconciliations/${reconId}/match`).set(auth()).send({
        transactionId: tx2Id
      });
      expect(wrongBankMatch.status).toBe(400);

      const tx1 = await request(app).post('/api/bank-transactions').set(auth()).send({
        bankId: bank1Id,
        date: new Date().toISOString(),
        description: 'Bank 1 txn',
        debit: 0,
        credit: 120
      });
      expect(tx1.status).toBe(201);
      tx1Id = Number(tx1.body.data.id);

      const correctMatch = await request(app).post(`/api/bank-reconciliations/${reconId}/match`).set(auth()).send({
        transactionId: tx1Id
      });
      expect(correctMatch.status).toBe(200);

      const complete = await request(app).post(`/api/bank-reconciliations/${reconId}/complete`).set(auth()).send({});
      expect(complete.status).toBe(200);

      const completeAgain = await request(app).post(`/api/bank-reconciliations/${reconId}/complete`).set(auth()).send({});
      expect(completeAgain.status).toBe(400);

      const cashbox = await request(app).post('/api/cashboxes').set(auth()).send({
        name: 'Cashbox Stage 15',
        accountNumber: cashboxNo,
        bankName: 'Cashbox',
        currency: 'SAR',
        openingBalance: 200,
        currentBalance: 200,
        isActive: true
      });
      expect(cashbox.status).toBe(201);
      cashboxId = Number(cashbox.body.data.id);

      const reconCashbox = await request(app).post('/api/bank-reconciliations').set(auth()).send({
        bankId: cashboxId,
        statementBalance: 200,
        statementDate: new Date().toISOString()
      });
      expect(reconCashbox.status).toBe(400);
    } finally {
      if (cashboxId) await request(app).delete(`/api/cashboxes/${cashboxId}`).set(auth());
      if (bank1Id) await request(app).delete(`/api/bank-accounts/${bank1Id}`).set(auth());
      if (bank2Id) await request(app).delete(`/api/bank-accounts/${bank2Id}`).set(auth());
      if (reconId) await prisma.integrationSetting.deleteMany({ where: { key: `bank-reconciliation:${reconId}` } });
      tx1Id = 0;
      tx2Id = 0;
    }
  });

  it('enforces profile/auth validation guard rails', async () => {
    const role = await prisma.role.findUnique({ where: { name: 'admin' }, select: { id: true } });
    expect(role).toBeTruthy();

    const username = uniqueCode('u15').toLowerCase();
    const password = 'pass1501';
    let userId = 0;
    let userToken = '';

    try {
      const created = await request(app).post('/api/users').set(auth()).send({
        username,
        email: `${username}@erp.local`,
        fullName: 'Stage 15 Guard User',
        password,
        roleId: Number(role!.id)
      });
      expect(created.status).toBe(201);
      userId = Number(created.body.data.id);

      const login = await request(app).post('/api/auth/login').send({ username, password });
      expect(login.status).toBe(200);
      userToken = String(login.body.data.token);
      const userAuth = () => ({ Authorization: `Bearer ${userToken}` });

      const badProfileMfaVerify = await request(app).post('/api/profile/mfa/verify').set(userAuth()).send({ token: '12' });
      expect([400, 422]).toContain(badProfileMfaVerify.status);

      const badAuthMfaVerify = await request(app).post('/api/auth/verify-mfa').set(userAuth()).send({ token: '1' });
      expect([400, 422]).toContain(badAuthMfaVerify.status);

      const badProfileChange = await request(app)
        .post('/api/profile/change-password')
        .set(userAuth())
        .send({ currentPassword: 'wrong-pass', newPassword: 'pass1502' });
      expect([400, 422]).toContain(badProfileChange.status);

      const badAuthChange = await request(app)
        .post('/api/auth/change-password')
        .set(userAuth())
        .send({ currentPassword: 'wrong-pass', newPassword: 'pass1503' });
      expect([400, 422]).toContain(badAuthChange.status);

      const resetTooShort = await request(app).post('/api/auth/reset-password').send({
        username,
        newPassword: '123'
      });
      expect([400, 422]).toContain(resetTooShort.status);

      const resetUnknownUser = await request(app).post('/api/auth/reset-password').send({
        username: uniqueCode('nouser15').toLowerCase(),
        newPassword: 'pass1599'
      });
      expect(resetUnknownUser.status).toBe(404);
    } finally {
      if (userId) {
        await prisma.userMfaSetting.deleteMany({ where: { userId } });
        await prisma.integrationSetting.deleteMany({ where: { key: `profile-preferences:${userId}` } });
        await request(app).delete(`/api/users/${userId}`).set(auth());
      }
    }
  });

  it('enforces inventory/ticket guard rails on invalid transitions', async () => {
    const warehouseCode = uniqueCode('WH15').toUpperCase();
    const countNo = uniqueCode('CNT15').toUpperCase();
    const ticketNo = uniqueCode('TKT15').toUpperCase();

    let warehouseId = 0;
    let stockCountId = 0;
    let ticketId = 0;

    try {
      const warehouse = await request(app).post('/api/warehouses').set(auth()).send({
        code: warehouseCode,
        nameAr: 'Warehouse 15',
        isActive: true
      });
      expect(warehouse.status).toBe(201);
      warehouseId = Number(warehouse.body.data.id);

      const count = await request(app).post('/api/inventory-counts').set(auth()).send({
        number: countNo,
        date: new Date().toISOString(),
        warehouseId,
        status: 'APPROVED'
      });
      expect(count.status).toBe(201);
      stockCountId = Number(count.body.data.id);

      const approveApprovedCount = await request(app).post(`/api/stock-counts/${stockCountId}/approve`).set(auth()).send({});
      expect(approveApprovedCount.status).toBe(400);

      const ticket = await request(app).post('/api/support-tickets').set(auth()).send({
        number: ticketNo,
        subject: 'Ticket 15',
        priority: 'MEDIUM',
        status: 'OPEN'
      });
      expect(ticket.status).toBe(201);
      ticketId = Number(ticket.body.data.id);

      const emptyStatus = await request(app).patch(`/api/tickets/${ticketId}/status`).set(auth()).send({ status: '' });
      expect([400, 422]).toContain(emptyStatus.status);
    } finally {
      if (ticketId) await request(app).delete(`/api/support-tickets/${ticketId}`).set(auth());
      if (stockCountId) {
        await prisma.stockCountLine.deleteMany({ where: { stockCountId } });
        await prisma.stockCount.deleteMany({ where: { id: stockCountId } });
      }
      if (warehouseId) await request(app).delete(`/api/warehouses/${warehouseId}`).set(auth());
    }
  });
});
