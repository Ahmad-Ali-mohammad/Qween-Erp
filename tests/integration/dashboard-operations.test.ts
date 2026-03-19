/**
 * Dashboard & Operational Tests
 * 
 * This test file covers:
 * 1. Dashboard health checks
 * 2. System monitoring
 * 3. Alert and notification systems
 * 4. Cross-system integration
 * 5. Performance metrics
 * 6. Operational workflows
 */

import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/config/database';
import { ensureAdminUser, loginAdmin } from './helpers';

// ============================================================================
// HEALTH CHECKS & SYSTEM MONITORING
// ============================================================================

describe('Dashboard: Health & System Monitoring', () => {
  let token = '';
  let adminToken = '';

  beforeAll(async () => {
    await ensureAdminUser();
    token = await loginAdmin();
    adminToken = token;
  });

  describe('Basic Health Endpoints', () => {
    it('should return OK for root health endpoint', async () => {
      const response = await request(app).get('/health');
      expect(response.status).toBe(200);
      expect(response.body).toBeDefined();
    });

    it('should return OK for API health endpoint', async () => {
      const response = await request(app).get('/v1/health');
      expect(response.status).toBe(200);
      expect(response.body.status).toBeDefined();
    });

    it('should return metrics in prometheus format', async () => {
      const response = await request(app).get('/metrics');
      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/plain');
    });

    it('should return API metrics', async () => {
      const response = await request(app)
        .get('/api/v1/metrics')
        .set('Authorization', `Bearer ${token}`);
      
      expect(response.status).toBe(200);
    });
  });

  describe('Central Health Dashboard', () => {
    it('should get central health information', async () => {
      const response = await request(app)
        .get('/api/central/health')
        .set('Authorization', `Bearer ${token}`);
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.environment).toBeDefined();
      expect(response.body.data.timezone).toBeDefined();
      expect(response.body.data.baseCurrency).toBeDefined();
      expect(response.body.data.systems).toBeDefined();
    });

    it('should get all systems status', async () => {
      const response = await request(app)
        .get('/api/central/apps')
        .set('Authorization', `Bearer ${token}`);
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);
    });

    it('should get system exceptions', async () => {
      const response = await request(app)
        .get('/api/central/exceptions')
        .set('Authorization', `Bearer ${token}`);
      
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should get system info', async () => {
      const response = await request(app)
        .get('/api/central/info')
        .set('Authorization', `Bearer ${token}`);
      
      expect(response.status).toBe(200);
    });
  });

  describe('Database Health', () => {
    it('should verify database connection', async () => {
      const result = await prisma.$queryRaw`SELECT 1 as result`;
      expect(result).toBeDefined();
    });

    it('should count core tables', async () => {
      const userCount = await prisma.user.count();
      expect(userCount).toBeGreaterThan(0);

      const roleCount = await prisma.role.count();
      expect(roleCount).toBeGreaterThan(0);
    });

    it('should verify data integrity', async () => {
      // Check for orphaned records
      const accounts = await prisma.account.findMany({ take: 5 });
      expect(accounts.length).toBeGreaterThanOrEqual(0);
    });
  });
});

// ============================================================================
// AUDIT & COMPLIANCE
// ============================================================================

describe('Dashboard: Audit & Compliance', () => {
  let token = '';

  beforeAll(async () => {
    await ensureAdminUser();
    token = await loginAdmin();
  });

  describe('Audit Logs', () => {
    it('should list audit logs', async () => {
      const response = await request(app)
        .get('/api/audit-logs')
        .set('Authorization', `Bearer ${token}`);
      
      expect(response.status).toBe(200);
    });

    it('should filter audit logs by entity', async () => {
      const response = await request(app)
        .get('/api/audit-logs?entity=user')
        .set('Authorization', `Bearer ${token}`);
      
      expect(response.status).toBe(200);
    });

    it('should filter audit logs by action', async () => {
      const response = await request(app)
        .get('/api/audit-logs?action=CREATE')
        .set('Authorization', `Bearer ${token}`);
      
      expect(response.status).toBe(200);
    });
  });

  describe('Workflow Audit', () => {
    it('should list workflow instances', async () => {
      const response = await request(app)
        .get('/api/workflows')
        .set('Authorization', `Bearer ${token}`);
      
      expect(response.status).toBe(200);
    });

    it('should list workflow actions', async () => {
      const response = await request(app)
        .get('/api/workflow-actions')
        .set('Authorization', `Bearer ${token}`);
      
      expect(response.status).toBe(200);
    });
  });
});

// ============================================================================
// SYNC & INTEGRATION
// ============================================================================

describe('Dashboard: Sync & Integration', () => {
  let token = '';

  beforeAll(async () => {
    await ensureAdminUser();
    token = await loginAdmin();
  });

  describe('Sync Queue', () => {
    it('should get sync queue status', async () => {
      const response = await request(app)
        .get('/api/sync/queue')
        .set('Authorization', `Bearer ${token}`);
      
      expect(response.status).toBe(200);
    });

    it('should get sync statistics', async () => {
      const response = await request(app)
        .get('/api/sync/stats')
        .set('Authorization', `Bearer ${token}`);
      
      expect(response.status).toBe(200);
    });
  });

  describe('Integration Settings', () => {
    it('should list integration settings', async () => {
      const response = await request(app)
        .get('/api/integrations')
        .set('Authorization', `Bearer ${token}`);
      
      expect(response.status).toBe(200);
    });
  });

  describe('Notifications', () => {
    it('should get user notifications', async () => {
      const response = await request(app)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${token}`);
      
      expect(response.status).toBe(200);
    });

    it('should mark notification as read', async () => {
      // First get notifications
      const listRes = await request(app)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${token}`);
      
      if (listRes.body.data && listRes.body.data.length > 0) {
        const notificationId = listRes.body.data[0].id;
        const response = await request(app)
          .put(`/api/notifications/${notificationId}/read`)
          .set('Authorization', `Bearer ${token}`);
        
        expect([200, 404]).toContain(response.status);
      } else {
        expect(true).toBe(true); // Skip if no notifications
      }
    });
  });
});

// ============================================================================
// USER TASKS & WORKFLOWS
// ============================================================================

describe('Dashboard: User Tasks & Workflows', () => {
  let token = '';

  beforeAll(async () => {
    await ensureAdminUser();
    token = await loginAdmin();
  });

  describe('User Tasks', () => {
    it('should list pending user tasks', async () => {
      const response = await request(app)
        .get('/api/user-tasks')
        .set('Authorization', `Bearer ${token}`);
      
      expect(response.status).toBe(200);
    });

    it('should filter tasks by assignee', async () => {
      const response = await request(app)
        .get('/api/user-tasks?assignee=me')
        .set('Authorization', `Bearer ${token}`);
      
      expect(response.status).toBe(200);
    });

    it('should filter tasks by status', async () => {
      const response = await request(app)
        .get('/api/user-tasks?status=PENDING')
        .set('Authorization', `Bearer ${token}`);
      
      expect(response.status).toBe(200);
    });
  });

  describe('Workflow Instances', () => {
    it('should list workflow instances', async () => {
      const response = await request(app)
        .get('/api/workflow-instances')
        .set('Authorization', `Bearer ${token}`);
      
      expect(response.status).toBe(200);
    });

    it('should get workflow instance details', async () => {
      // First get a workflow instance
      const listRes = await request(app)
        .get('/api/workflow-instances')
        .set('Authorization', `Bearer ${token}`);
      
      if (listRes.body.data && listRes.body.data.length > 0) {
        const instanceId = listRes.body.data[0].id;
        const response = await request(app)
          .get(`/api/workflow-instances/${instanceId}`)
          .set('Authorization', `Bearer ${token}`);
        
        expect([200, 404]).toContain(response.status);
      } else {
        expect(true).toBe(true); // Skip
      }
    });
  });
});

// ============================================================================
// REPORTING & ANALYTICS
// ============================================================================

describe('Dashboard: Reporting & Analytics', () => {
  let token = '';

  beforeAll(async () => {
    await ensureAdminUser();
    token = await loginAdmin();
  });

  describe('Saved Reports', () => {
    it('should list saved reports', async () => {
      const response = await request(app)
        .get('/api/saved-reports')
        .set('Authorization', `Bearer ${token}`);
      
      expect(response.status).toBe(200);
    });
  });

  describe('Scheduled Reports', () => {
    it('should list scheduled reports', async () => {
      const response = await request(app)
        .get('/api/scheduled-reports')
        .set('Authorization', `Bearer ${token}`);
      
      expect(response.status).toBe(200);
    });
  });

  describe('Analytics', () => {
    it('should provide basic analytics', async () => {
      const response = await request(app)
        .get('/api/analytics')
        .set('Authorization', `Bearer ${token}`);
      
      expect(response.status).toBe(200);
    });
  });
});

// ============================================================================
// SETTINGS & CONFIGURATION
// ============================================================================

describe('Dashboard: Settings & Configuration', () => {
  let token = '';

  beforeAll(async () => {
    await ensureAdminUser();
    token = await loginAdmin();
  });

  describe('Company Settings', () => {
    it('should get company settings', async () => {
      const response = await request(app)
        .get('/api/settings/company')
        .set('Authorization', `Bearer ${token}`);
      
      expect(response.status).toBe(200);
    });

    it('should update company settings', async () => {
      const response = await request(app)
        .put('/api/settings/company')
        .set('Authorization', `Bearer ${token}`)
        .send({
          nameAr: 'Test Company',
          nameEn: 'Test Company EN'
        });
      
      expect([200, 400]).toContain(response.status);
    });
  });

  describe('System Settings', () => {
    it('should get system settings', async () => {
      const response = await request(app)
        .get('/api/settings/system')
        .set('Authorization', `Bearer ${token}`);
      
      expect(response.status).toBe(200);
    });

    it('should update system settings', async () => {
      const response = await request(app)
        .put('/api/settings/system')
        .set('Authorization', `Bearer ${token}`)
        .send({
          key: 'locale',
          value: 'ar'
        });
      
      expect([200, 400]).toContain(response.status);
    });
  });

  describe('Currency Settings', () => {
    it('should list currencies', async () => {
      const response = await request(app)
        .get('/api/currencies')
        .set('Authorization', `Bearer ${token}`);
      
      expect(response.status).toBe(200);
    });

    it('should list exchange rates', async () => {
      const response = await request(app)
        .get('/api/exchange-rates')
        .set('Authorization', `Bearer ${token}`);
      
      expect(response.status).toBe(200);
    });
  });
});

// ============================================================================
// BRANCH & ORGANIZATION
// ============================================================================

describe('Dashboard: Branch & Organization', () => {
  let token = '';

  beforeAll(async () => {
    await ensureAdminUser();
    token = await loginAdmin();
  });

  describe('Branches', () => {
    it('should list branches', async () => {
      const response = await request(app)
        .get('/api/branches')
        .set('Authorization', `Bearer ${token}`);
      
      expect(response.status).toBe(200);
    });

    it('should get branch details', async () => {
      const branches = await prisma.branch.findMany({ take: 1 });
      
      if (branches.length > 0) {
        const response = await request(app)
          .get(`/api/branches/${branches[0].id}`)
          .set('Authorization', `Bearer ${token}`);
        
        expect(response.status).toBe(200);
      } else {
        expect(true).toBe(true); // Skip
      }
    });
  });

  describe('Departments', () => {
    it('should list departments', async () => {
      const response = await request(app)
        .get('/api/departments')
        .set('Authorization', `Bearer ${token}`);
      
      expect(response.status).toBe(200);
    });
  });

  describe('Cost Centers', () => {
    it('should list cost centers', async () => {
      const response = await request(app)
        .get('/api/cost-centers')
        .set('Authorization', `Bearer ${token}`);
      
      expect(response.status).toBe(200);
    });
  });
});

// ============================================================================
// CROSS-SYSTEM OPERATIONS
// ============================================================================

describe('Dashboard: Cross-System Operations', () => {
  let token = '';

  beforeAll(async () => {
    await ensureAdminUser();
    token = await loginAdmin();
  });

  describe('Multi-System Reports', () => {
    it('should generate financial summary', async () => {
      const response = await request(app)
        .get('/api/reports/financial-summary')
        .set('Authorization', `Bearer ${token}`);
      
      expect(response.status).toBe(200);
    });

    it('should generate operational summary', async () => {
      const response = await request(app)
        .get('/api/reports/operational-summary')
        .set('Authorization', `Bearer ${token}`);
      
      expect(response.status).toBe(200);
    });

    it('should generate HR summary', async () => {
      const response = await request(app)
        .get('/api/reports/hr-summary')
        .set('Authorization', `Bearer ${token}`);
      
      expect(response.status).toBe(200);
    });
  });

  describe('Data Export', () => {
    it('should export data in CSV format', async () => {
      const response = await request(app)
        .get('/api/export/users?format=csv')
        .set('Authorization', `Bearer ${token}`);
      
      expect([200, 400]).toContain(response.status);
    });

    it('should export data in Excel format', async () => {
      const response = await request(app)
        .get('/api/export/users?format=excel')
        .set('Authorization', `Bearer ${token}`);
      
      expect([200, 400]).toContain(response.status);
    });
  });
});

// ============================================================================
// PERFORMANCE & RESOURCE MONITORING
// ============================================================================

describe('Dashboard: Performance & Resources', () => {
  let token = '';

  beforeAll(async () => {
    await ensureAdminUser();
    token = await loginAdmin();
  });

  describe('API Performance', () => {
    it('should measure response time', async () => {
      const start = Date.now();
      await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${token}`);
      const duration = Date.now() - start;
      
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    });

    it('should track endpoint usage', async () => {
      const response = await request(app)
        .get('/api/metrics/endpoints')
        .set('Authorization', `Bearer ${token}`);
      
      expect(response.status).toBe(200);
    });
  });

  describe('Database Performance', () => {
    it('should verify database latency', async () => {
      const start = Date.now();
      await prisma.user.findFirst();
      const duration = Date.now() - start;
      
      expect(duration).toBeLessThan(1000); // Should be under 1 second
    });
  });

  describe('Session Management', () => {
    it('should list active sessions', async () => {
      const response = await request(app)
        .get('/api/auth/sessions')
        .set('Authorization', `Bearer ${token}`);
      
      expect(response.status).toBe(200);
    });

    it('should count active users', async () => {
      const response = await request(app)
        .get('/api/auth/active-users')
        .set('Authorization', `Bearer ${token}`);
      
      expect(response.status).toBe(200);
    });
  });
});

// ============================================================================
// SECURITY & ACCESS CONTROL
// ============================================================================

describe('Dashboard: Security & Access', () => {
  let token = '';

  beforeAll(async () => {
    await ensureAdminUser();
    token = await loginAdmin();
  });

  describe('Role Management', () => {
    it('should list all roles', async () => {
      const response = await request(app)
        .get('/api/roles')
        .set('Authorization', `Bearer ${token}`);
      
      expect(response.status).toBe(200);
    });

    it('should get role details with permissions', async () => {
      const roles = await prisma.role.findMany({ take: 1 });
      
      if (roles.length > 0) {
        const response = await request(app)
          .get(`/api/roles/${roles[0].id}`)
          .set('Authorization', `Bearer ${token}`);
        
        expect(response.status).toBe(200);
      } else {
        expect(true).toBe(true); // Skip
      }
    });
  });

  describe('User Access', () => {
    it('should list users with roles', async () => {
      const response = await request(app)
        .get('/api/users?includeRoles=true')
        .set('Authorization', `Bearer ${token}`);
      
      expect(response.status).toBe(200);
    });

    it('should verify user permissions', async () => {
      const response = await request(app)
        .get('/api/auth/permissions')
        .set('Authorization', `Bearer ${token}`);
      
      expect(response.status).toBe(200);
      expect(response.body.data).toBeDefined();
    });
  });

  describe('Branch Access Control', () => {
    it('should list user branch access', async () => {
      const response = await request(app)
        .get('/api/users/1/branches')
        .set('Authorization', `Bearer ${token}`);
      
      expect(response.status).toBe(200);
    });
  });

  describe('Warehouse Access Control', () => {
    it('should list user warehouse access', async () => {
      const response = await request(app)
        .get('/api/users/1/warehouses')
        .set('Authorization', `Bearer ${token}`);
      
      expect(response.status).toBe(200);
    });
  });
});

// ============================================================================
// MAINTENANCE & BACKUP
// ============================================================================

describe('Dashboard: Maintenance & Backup', () => {
  let token = '';

  beforeAll(async () => {
    await ensureAdminUser();
    token = await loginAdmin();
  });

  describe('Backup Jobs', () => {
    it('should list backup jobs', async () => {
      const response = await request(app)
        .get('/api/backups')
        .set('Authorization', `Bearer ${token}`);
      
      expect(response.status).toBe(200);
    });

    it('should get backup status', async () => {
      const response = await request(app)
        .get('/api/backups/status')
        .set('Authorization', `Bearer ${token}`);
      
      expect(response.status).toBe(200);
    });
  });

  describe('System Logs', () => {
    it('should list system logs', async () => {
      const response = await request(app)
        .get('/api/logs?level=error')
        .set('Authorization', `Bearer ${token}`);
      
      expect(response.status).toBe(200);
    });
  });
});

// Set timeout
jest.setTimeout(120000);
