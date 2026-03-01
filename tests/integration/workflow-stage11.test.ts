import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/config/database';
import { ensureAdminUser, loginAdmin, uniqueCode } from './helpers';

describe('Stage 11 workflow coverage (Security + Integrations + Internal Controls)', () => {
  let token = '';
  let adminUserId = 0;

  beforeAll(async () => {
    await ensureAdminUser();
    token = await loginAdmin();
    const admin = await prisma.user.findUnique({ where: { username: 'admin' }, select: { id: true } });
    expect(admin).toBeTruthy();
    adminUserId = Number(admin!.id);
  });

  it('covers security policy + mfa lifecycle and integrations/internal-controls workflows', async () => {
    const integrationKey = uniqueCode('INT11')
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-');

    const originalPolicy = await prisma.securityPolicy.findUnique({ where: { id: 1 } });
    const originalMfa = await prisma.userMfaSetting.findUnique({ where: { userId: adminUserId } });
    const originalInternalControls = await prisma.integrationSetting.findUnique({ where: { key: 'internal-controls' } });

    try {
      const policyGet = await request(app).get('/api/security/policies').set('Authorization', `Bearer ${token}`);
      expect(policyGet.status).toBe(200);
      expect(policyGet.body.success).toBe(true);

      const policyUpdate = await request(app)
        .put('/api/security/policies')
        .set('Authorization', `Bearer ${token}`)
        .send({
          passwordMinLength: 8,
          passwordRequireComplex: true,
          passwordExpiryDays: 120,
          lockoutAttempts: 6,
          lockoutMinutes: 20,
          sessionTimeoutMinutes: 45,
          singleSessionOnly: true,
          auditReadActions: true,
          auditRetentionDays: 365
        });
      expect(policyUpdate.status).toBe(200);
      expect(policyUpdate.body.success).toBe(true);
      expect(Number(policyUpdate.body.data.passwordExpiryDays)).toBe(120);
      expect(Boolean(policyUpdate.body.data.singleSessionOnly)).toBe(true);

      const policyAfter = await request(app).get('/api/security/policies').set('Authorization', `Bearer ${token}`);
      expect(policyAfter.status).toBe(200);
      expect(policyAfter.body.success).toBe(true);
      expect(Number(policyAfter.body.data.sessionTimeoutMinutes)).toBe(45);

      const mfaGet = await request(app).get(`/api/security/mfa/${adminUserId}`).set('Authorization', `Bearer ${token}`);
      expect(mfaGet.status).toBe(200);
      expect(mfaGet.body.success).toBe(true);

      const mfaEnable = await request(app)
        .put(`/api/security/mfa/${adminUserId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          isEnabled: true,
          method: 'TOTP',
          backupCodes: ['S11-CODE-1', 'S11-CODE-2'],
          verifiedAt: new Date().toISOString()
        });
      expect(mfaEnable.status).toBe(200);
      expect(mfaEnable.body.success).toBe(true);
      expect(Boolean(mfaEnable.body.data.isEnabled)).toBe(true);
      expect(String(mfaEnable.body.data.method)).toBe('TOTP');

      const mfaDisable = await request(app)
        .put(`/api/security/mfa/${adminUserId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          isEnabled: false,
          method: 'TOTP'
        });
      expect(mfaDisable.status).toBe(200);
      expect(mfaDisable.body.success).toBe(true);
      expect(Boolean(mfaDisable.body.data.isEnabled)).toBe(false);

      const controlsGet = await request(app).get('/api/internal-controls').set('Authorization', `Bearer ${token}`);
      expect(controlsGet.status).toBe(200);
      expect(controlsGet.body.success).toBe(true);

      const controlsUpdate = await request(app)
        .put('/api/internal-controls')
        .set('Authorization', `Bearer ${token}`)
        .send({
          isEnabled: true,
          status: 'ACTIVE',
          settings: {
            reviewFrequencyDays: 14,
            dualApproval: true,
            attachmentsRequired: true
          }
        });
      expect(controlsUpdate.status).toBe(200);
      expect(controlsUpdate.body.success).toBe(true);
      expect(String(controlsUpdate.body.data.key)).toBe('internal-controls');

      const controlsAfter = await request(app).get('/api/internal-controls').set('Authorization', `Bearer ${token}`);
      expect(controlsAfter.status).toBe(200);
      expect(controlsAfter.body.success).toBe(true);
      expect(Boolean(controlsAfter.body.data.isEnabled)).toBe(true);
      expect(controlsAfter.body.data.settings).toBeTruthy();
      expect(Boolean(controlsAfter.body.data.settings.dualApproval)).toBe(true);

      const integrationUpsert = await request(app)
        .put(`/api/integrations/${integrationKey}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          provider: 'SYSTEM',
          isEnabled: true,
          status: 'ACTIVE',
          settings: {
            endpoint: 'https://example.com/api',
            apiKey: 'stage11'
          }
        });
      expect(integrationUpsert.status).toBe(200);
      expect(integrationUpsert.body.success).toBe(true);
      expect(String(integrationUpsert.body.data.key)).toBe(integrationKey);

      const integrationGet = await request(app).get(`/api/integrations/${integrationKey}`).set('Authorization', `Bearer ${token}`);
      expect(integrationGet.status).toBe(200);
      expect(integrationGet.body.success).toBe(true);
      expect(String(integrationGet.body.data.key)).toBe(integrationKey);

      const integrationList = await request(app).get('/api/integrations').set('Authorization', `Bearer ${token}`);
      expect(integrationList.status).toBe(200);
      expect(integrationList.body.success).toBe(true);
      expect(Array.isArray(integrationList.body.data)).toBe(true);
      expect(integrationList.body.data.some((row: any) => row.key === integrationKey)).toBe(true);

      const integrationSettingsCompat = await request(app)
        .put(`/api/integrations/${integrationKey}/settings`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          endpoint: 'https://example.com/v2',
          timeoutMs: 4000
        });
      expect(integrationSettingsCompat.status).toBe(200);
      expect(integrationSettingsCompat.body.success).toBe(true);

      const integrationTest = await request(app).post(`/api/integrations/${integrationKey}/test`).set('Authorization', `Bearer ${token}`).send({});
      expect(integrationTest.status).toBe(200);
      expect(integrationTest.body.success).toBe(true);
      expect(Boolean(integrationTest.body.data.connected)).toBe(true);
    } finally {
      await prisma.integrationSetting.deleteMany({ where: { key: integrationKey } });

      if (originalPolicy) {
        await prisma.securityPolicy.upsert({
          where: { id: 1 },
          update: {
            passwordMinLength: originalPolicy.passwordMinLength,
            passwordRequireComplex: originalPolicy.passwordRequireComplex,
            passwordExpiryDays: originalPolicy.passwordExpiryDays,
            lockoutAttempts: originalPolicy.lockoutAttempts,
            lockoutMinutes: originalPolicy.lockoutMinutes,
            sessionTimeoutMinutes: originalPolicy.sessionTimeoutMinutes,
            singleSessionOnly: originalPolicy.singleSessionOnly,
            auditReadActions: originalPolicy.auditReadActions,
            auditRetentionDays: originalPolicy.auditRetentionDays
          },
          create: {
            id: 1,
            passwordMinLength: originalPolicy.passwordMinLength,
            passwordRequireComplex: originalPolicy.passwordRequireComplex,
            passwordExpiryDays: originalPolicy.passwordExpiryDays,
            lockoutAttempts: originalPolicy.lockoutAttempts,
            lockoutMinutes: originalPolicy.lockoutMinutes,
            sessionTimeoutMinutes: originalPolicy.sessionTimeoutMinutes,
            singleSessionOnly: originalPolicy.singleSessionOnly,
            auditReadActions: originalPolicy.auditReadActions,
            auditRetentionDays: originalPolicy.auditRetentionDays
          }
        });
      } else {
        await prisma.securityPolicy.deleteMany({ where: { id: 1 } });
      }

      if (originalMfa) {
        await prisma.userMfaSetting.upsert({
          where: { userId: adminUserId },
          update: {
            isEnabled: originalMfa.isEnabled,
            method: originalMfa.method,
            secret: originalMfa.secret,
            backupCodes: originalMfa.backupCodes as any,
            verifiedAt: originalMfa.verifiedAt
          },
          create: {
            userId: adminUserId,
            isEnabled: originalMfa.isEnabled,
            method: originalMfa.method,
            secret: originalMfa.secret,
            backupCodes: originalMfa.backupCodes as any,
            verifiedAt: originalMfa.verifiedAt
          }
        });
      } else {
        await prisma.userMfaSetting.deleteMany({ where: { userId: adminUserId } });
      }

      if (originalInternalControls) {
        await prisma.integrationSetting.upsert({
          where: { key: 'internal-controls' },
          update: {
            provider: originalInternalControls.provider,
            isEnabled: originalInternalControls.isEnabled,
            settings: originalInternalControls.settings as any,
            status: originalInternalControls.status
          },
          create: {
            key: 'internal-controls',
            provider: originalInternalControls.provider,
            isEnabled: originalInternalControls.isEnabled,
            settings: originalInternalControls.settings as any,
            status: originalInternalControls.status
          }
        });
      } else {
        await prisma.integrationSetting.deleteMany({ where: { key: 'internal-controls' } });
      }
    }
  });
});

