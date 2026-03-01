import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/config/database';
import { ensureAdminUser, loginAdmin, uniqueCode } from './helpers';

describe('Stage 14 deep workflow coverage (Help/Support + Profile/Auth)', () => {
  let adminToken = '';
  const adminAuth = () => ({ Authorization: `Bearer ${adminToken}` });

  beforeAll(async () => {
    await ensureAdminUser();
    adminToken = await loginAdmin();
  });

  it('covers help center + knowledge base + assistant + setup wizard + support ticket deep flow', async () => {
    const ticketNumber = uniqueCode('SUP14').toUpperCase();
    const setupWizardOriginal = await prisma.integrationSetting.findUnique({ where: { key: 'setup-wizard' } });
    let supportTicketId = 0;

    try {
      const helpList = await request(app).get('/api/help-center/articles').set(adminAuth());
      expect(helpList.status).toBe(200);
      expect(helpList.body.success).toBe(true);
      expect(Array.isArray(helpList.body.data)).toBe(true);
      expect(helpList.body.data.length).toBeGreaterThan(0);

      const articleId = Number(helpList.body.data[0].id);
      const helpDetails = await request(app).get(`/api/help-center/articles/${articleId}`).set(adminAuth());
      expect(helpDetails.status).toBe(200);
      expect(helpDetails.body.success).toBe(true);
      expect(Number(helpDetails.body.data.id)).toBe(articleId);

      const kbList = await request(app).get('/api/knowledge-base').set(adminAuth());
      expect(kbList.status).toBe(200);
      expect(kbList.body.success).toBe(true);
      expect(Array.isArray(kbList.body.data)).toBe(true);

      const kbSearch = await request(app).get('/api/knowledge-base/search').set(adminAuth()).query({ q: 'فاتورة' });
      expect(kbSearch.status).toBe(200);
      expect(kbSearch.body.success).toBe(true);
      expect(Array.isArray(kbSearch.body.data)).toBe(true);

      const assistantQuery = await request(app).post('/api/assistant/query').set(adminAuth()).send({ query: 'كيف أصدر فاتورة؟' });
      expect(assistantQuery.status).toBe(200);
      expect(assistantQuery.body.success).toBe(true);
      expect(String(assistantQuery.body.data.answer)).toContain('كيف أصدر فاتورة');

      const assistantSuggest = await request(app).get('/api/assistant/suggest').set(adminAuth());
      expect(assistantSuggest.status).toBe(200);
      expect(assistantSuggest.body.success).toBe(true);
      expect(Array.isArray(assistantSuggest.body.data)).toBe(true);
      expect(assistantSuggest.body.data.length).toBeGreaterThan(0);

      const wizardBefore = await request(app).get('/api/setup-wizard/steps').set(adminAuth());
      expect(wizardBefore.status).toBe(200);
      expect(wizardBefore.body.success).toBe(true);
      expect(Array.isArray(wizardBefore.body.data.steps)).toBe(true);

      const wizardStep1 = await request(app).post('/api/setup-wizard/step/company').set(adminAuth()).send({});
      expect(wizardStep1.status).toBe(200);
      expect(wizardStep1.body.success).toBe(true);
      expect(Array.isArray(wizardStep1.body.data.completed)).toBe(true);
      expect(wizardStep1.body.data.completed).toContain('company');

      const wizardStep2 = await request(app).post('/api/setup-wizard/step/users').set(adminAuth()).send({});
      expect(wizardStep2.status).toBe(200);
      expect(wizardStep2.body.success).toBe(true);
      expect(wizardStep2.body.data.completed).toContain('users');

      const wizardAfter = await request(app).get('/api/setup-wizard/steps').set(adminAuth());
      expect(wizardAfter.status).toBe(200);
      expect(wizardAfter.body.success).toBe(true);
      expect(wizardAfter.body.data.completed).toContain('company');
      expect(wizardAfter.body.data.completed).toContain('users');

      const wizardComplete = await request(app).post('/api/setup-wizard/complete').set(adminAuth()).send({});
      expect(wizardComplete.status).toBe(200);
      expect(wizardComplete.body.success).toBe(true);
      expect(Boolean(wizardComplete.body.data.completed)).toBe(true);

      const ticketCreate = await request(app).post('/api/support-tickets').set(adminAuth()).send({
        number: ticketNumber,
        subject: 'تذكرة مرحلة 14',
        description: 'بدء تذكرة دعم عميقة',
        priority: 'MEDIUM',
        status: 'OPEN'
      });
      expect(ticketCreate.status).toBe(201);
      supportTicketId = Number(ticketCreate.body.data.id);
      expect(supportTicketId).toBeGreaterThan(0);

      const ticketList = await request(app).get('/api/support-tickets').set(adminAuth());
      expect(ticketList.status).toBe(200);
      expect(ticketList.body.success).toBe(true);
      expect(Array.isArray(ticketList.body.data)).toBe(true);
      expect(ticketList.body.data.some((row: any) => Number(row.id) === supportTicketId)).toBe(true);

      const ticketGet = await request(app).get(`/api/tickets/${supportTicketId}`).set(adminAuth());
      expect(ticketGet.status).toBe(200);
      expect(ticketGet.body.success).toBe(true);
      expect(Number(ticketGet.body.data.id)).toBe(supportTicketId);

      const ticketPut = await request(app).put(`/api/tickets/${supportTicketId}`).set(adminAuth()).send({
        priority: 'HIGH',
        description: 'تذكرة محدثة'
      });
      expect(ticketPut.status).toBe(200);
      expect(ticketPut.body.success).toBe(true);

      const ticketComment = await request(app)
        .post(`/api/tickets/${supportTicketId}/comments`)
        .set(adminAuth())
        .send({ message: 'تعليق متابعة مرحلة 14' });
      expect(ticketComment.status).toBe(201);
      expect(ticketComment.body.success).toBe(true);

      const ticketAssign = await request(app).post(`/api/tickets/${supportTicketId}/assign`).set(adminAuth()).send({ assigneeId: null });
      expect(ticketAssign.status).toBe(200);
      expect(ticketAssign.body.success).toBe(true);

      const ticketStatus = await request(app).patch(`/api/tickets/${supportTicketId}/status`).set(adminAuth()).send({ status: 'IN_PROGRESS' });
      expect(ticketStatus.status).toBe(200);
      expect(ticketStatus.body.success).toBe(true);
      expect(String(ticketStatus.body.data.status)).toBe('IN_PROGRESS');

      const ticketDelete = await request(app).delete(`/api/support-tickets/${supportTicketId}`).set(adminAuth());
      expect(ticketDelete.status).toBe(200);
      expect(ticketDelete.body.success).toBe(true);
      supportTicketId = 0;
    } finally {
      if (supportTicketId) {
        await request(app).delete(`/api/support-tickets/${supportTicketId}`).set(adminAuth());
      }

      if (setupWizardOriginal) {
        await prisma.integrationSetting.upsert({
          where: { key: 'setup-wizard' },
          update: {
            provider: setupWizardOriginal.provider,
            isEnabled: setupWizardOriginal.isEnabled,
            status: setupWizardOriginal.status,
            settings: setupWizardOriginal.settings as any
          },
          create: {
            key: 'setup-wizard',
            provider: setupWizardOriginal.provider,
            isEnabled: setupWizardOriginal.isEnabled,
            status: setupWizardOriginal.status,
            settings: setupWizardOriginal.settings as any
          }
        });
      } else {
        await prisma.integrationSetting.deleteMany({ where: { key: 'setup-wizard' } });
      }
    }
  });

  it('covers profile + auth compatibility flows on a real user account', async () => {
    const adminRole = await prisma.role.findUnique({ where: { name: 'admin' }, select: { id: true } });
    expect(adminRole).toBeTruthy();

    const username = uniqueCode('usr14').toLowerCase();
    const email = `${username}@erp.local`;
    const password1 = 'pass1401';
    const password2 = 'pass1402';
    const password3 = 'pass1403';
    const password4 = 'pass1404';

    let userId = 0;
    let userToken = '';

    try {
      const userCreate = await request(app).post('/api/users').set(adminAuth()).send({
        username,
        email,
        fullName: 'Stage 14 Profile User',
        password: password1,
        roleId: Number(adminRole!.id)
      });
      expect(userCreate.status).toBe(201);
      userId = Number(userCreate.body.data.id);
      expect(userId).toBeGreaterThan(0);

      const login1 = await request(app).post('/api/auth/login').send({ username, password: password1 });
      expect(login1.status).toBe(200);
      expect(login1.body.success).toBe(true);
      userToken = String(login1.body.data.token);
      const userAuth = () => ({ Authorization: `Bearer ${userToken}` });

      const meGet = await request(app).get('/api/auth/me').set(userAuth());
      expect(meGet.status).toBe(200);
      expect(meGet.body.success).toBe(true);
      expect(String(meGet.body.data.username)).toBe(username);

      const profileGet = await request(app).get('/api/profile').set(userAuth());
      expect(profileGet.status).toBe(200);
      expect(profileGet.body.success).toBe(true);
      expect(String(profileGet.body.data.username)).toBe(username);

      const profilePut = await request(app).put('/api/profile').set(userAuth()).send({
        fullName: 'Stage 14 Profile User Updated',
        phone: '0555000014',
        position: 'Tester'
      });
      expect(profilePut.status).toBe(200);
      expect(profilePut.body.success).toBe(true);
      expect(String(profilePut.body.data.fullName)).toContain('Updated');

      const preferencesGet1 = await request(app).get('/api/profile/preferences').set(userAuth());
      expect(preferencesGet1.status).toBe(200);
      expect(preferencesGet1.body.success).toBe(true);

      const preferencesPut = await request(app).put('/api/profile/preferences').set(userAuth()).send({
        language: 'ar',
        dateFormat: 'YYYY-MM-DD',
        notifications: { email: true, inApp: true }
      });
      expect(preferencesPut.status).toBe(200);
      expect(preferencesPut.body.success).toBe(true);
      expect(String(preferencesPut.body.data.language)).toBe('ar');

      const preferencesGet2 = await request(app).get('/api/profile/preferences').set(userAuth());
      expect(preferencesGet2.status).toBe(200);
      expect(preferencesGet2.body.success).toBe(true);
      expect(String(preferencesGet2.body.data.language)).toBe('ar');

      const profileMfaGet = await request(app).get('/api/profile/mfa').set(userAuth());
      expect(profileMfaGet.status).toBe(200);
      expect(profileMfaGet.body.success).toBe(true);

      const profileMfaEnable = await request(app).post('/api/profile/mfa/enable').set(userAuth()).send({});
      expect(profileMfaEnable.status).toBe(200);
      expect(profileMfaEnable.body.success).toBe(true);
      expect(Boolean(profileMfaEnable.body.data.isEnabled)).toBe(true);

      const profileMfaVerify = await request(app).post('/api/profile/mfa/verify').set(userAuth()).send({ token: '1234' });
      expect(profileMfaVerify.status).toBe(200);
      expect(profileMfaVerify.body.success).toBe(true);

      const profileMfaDisable = await request(app).post('/api/profile/mfa/disable').set(userAuth()).send({});
      expect(profileMfaDisable.status).toBe(200);
      expect(profileMfaDisable.body.success).toBe(true);
      expect(Boolean(profileMfaDisable.body.data.isEnabled)).toBe(false);

      const authMfaEnable = await request(app).post('/api/auth/enable-mfa').set(userAuth()).send({});
      expect(authMfaEnable.status).toBe(200);
      expect(authMfaEnable.body.success).toBe(true);

      const authMfaVerify = await request(app).post('/api/auth/verify-mfa').set(userAuth()).send({ token: '5678' });
      expect(authMfaVerify.status).toBe(200);
      expect(authMfaVerify.body.success).toBe(true);

      const authMfaDisable = await request(app).post('/api/auth/disable-mfa').set(userAuth()).send({});
      expect(authMfaDisable.status).toBe(200);
      expect(authMfaDisable.body.success).toBe(true);
      expect(Boolean(authMfaDisable.body.data.isEnabled)).toBe(false);

      const profileChangePassword = await request(app)
        .post('/api/profile/change-password')
        .set(userAuth())
        .send({ currentPassword: password1, newPassword: password2 });
      expect(profileChangePassword.status).toBe(200);
      expect(profileChangePassword.body.success).toBe(true);

      const login2 = await request(app).post('/api/auth/login').send({ username, password: password2 });
      expect(login2.status).toBe(200);
      userToken = String(login2.body.data.token);

      const authChangePassword = await request(app)
        .post('/api/auth/change-password')
        .set(userAuth())
        .send({ currentPassword: password2, newPassword: password3 });
      expect(authChangePassword.status).toBe(200);
      expect(authChangePassword.body.success).toBe(true);

      const login3 = await request(app).post('/api/auth/login').send({ username, password: password3 });
      expect(login3.status).toBe(200);

      const forgotPassword = await request(app).post('/api/auth/forgot-password').send({ username });
      expect(forgotPassword.status).toBe(202);
      expect(forgotPassword.body.success).toBe(true);

      const resetPassword = await request(app).post('/api/auth/reset-password').send({
        username,
        newPassword: password4
      });
      expect(resetPassword.status).toBe(200);
      expect(resetPassword.body.success).toBe(true);

      const login4 = await request(app).post('/api/auth/login').send({ username, password: password4 });
      expect(login4.status).toBe(200);
      expect(login4.body.success).toBe(true);
    } finally {
      if (userId) {
        await prisma.userMfaSetting.deleteMany({ where: { userId } });
        await prisma.integrationSetting.deleteMany({ where: { key: `profile-preferences:${userId}` } });
        await request(app).delete(`/api/users/${userId}`).set(adminAuth());
      }
    }
  });
});
