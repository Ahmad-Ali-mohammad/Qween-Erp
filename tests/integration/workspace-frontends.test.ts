import request from 'supertest';
import { app } from '../../src/app';

describe('Workspace frontends static mounts', () => {
  it('serves the control center and system apps from Express', async () => {
    const portalRes = await request(app).get('/portal');
    expect(portalRes.status).toBe(200);
    expect(portalRes.text).toContain('ERP Qween Control Center');

    const accountingRes = await request(app).get('/systems/accounting');
    expect(accountingRes.status).toBe(200);
    expect(accountingRes.text).toContain('<div id="root"></div>');

    const inventoryRes = await request(app).get('/systems/inventory');
    expect(inventoryRes.status).toBe(200);
    expect(inventoryRes.text).toContain('<div id="root"></div>');

    const crmRes = await request(app).get('/systems/crm');
    expect(crmRes.status).toBe(200);
    expect(crmRes.text).toContain('<div id="root"></div>');

    const hrRes = await request(app).get('/systems/hr');
    expect(hrRes.status).toBe(200);
    expect(hrRes.text).toContain('<div id="root"></div>');

    const projectsRes = await request(app).get('/systems/projects');
    expect(projectsRes.status).toBe(200);
    expect(projectsRes.text).toContain('<div id="root"></div>');

    const procurementRes = await request(app).get('/systems/procurement');
    expect(procurementRes.status).toBe(200);
    expect(procurementRes.text).toContain('<div id="root"></div>');

    const equipmentRes = await request(app).get('/systems/equipment');
    expect(equipmentRes.status).toBe(200);
    expect(equipmentRes.text).toContain('<div id="root"></div>');

    const siteOpsRes = await request(app).get('/systems/site-ops');
    expect(siteOpsRes.status).toBe(200);
    expect(siteOpsRes.text).toContain('<div id="root"></div>');

    const subcontractorsRes = await request(app).get('/systems/subcontractors');
    expect(subcontractorsRes.status).toBe(200);
    expect(subcontractorsRes.text).toContain('<div id="root"></div>');

    const budgetsRes = await request(app).get('/systems/budgets');
    expect(budgetsRes.status).toBe(200);
    expect(budgetsRes.text).toContain('<div id="root"></div>');

    const biRes = await request(app).get('/systems/bi');
    expect(biRes.status).toBe(200);
    expect(biRes.text).toContain('<div id="root"></div>');

    const contractsRes = await request(app).get('/systems/contracts');
    expect(contractsRes.status).toBe(200);
    expect(contractsRes.text).toContain('<div id="root"></div>');

    const maintenanceRes = await request(app).get('/systems/maintenance');
    expect(maintenanceRes.status).toBe(200);
    expect(maintenanceRes.text).toContain('<div id="root"></div>');

    const documentsRes = await request(app).get('/systems/documents');
    expect(documentsRes.status).toBe(200);
    expect(documentsRes.text).toContain('<div id="root"></div>');

    const printingRes = await request(app).get('/systems/printing');
    expect(printingRes.status).toBe(200);
    expect(printingRes.text).toContain('<div id="root"></div>');

    const qualitySafetyRes = await request(app).get('/systems/quality-safety');
    expect(qualitySafetyRes.status).toBe(200);
    expect(qualitySafetyRes.text).toContain('<div id="root"></div>');

    const tendersRes = await request(app).get('/systems/tenders');
    expect(tendersRes.status).toBe(200);
    expect(tendersRes.text).toContain('<div id="root"></div>');

    const risksRes = await request(app).get('/systems/risks');
    expect(risksRes.status).toBe(200);
    expect(risksRes.text).toContain('<div id="root"></div>');

    const schedulingRes = await request(app).get('/systems/scheduling');
    expect(schedulingRes.status).toBe(200);
    expect(schedulingRes.text).toContain('<div id="root"></div>');
  });
});
