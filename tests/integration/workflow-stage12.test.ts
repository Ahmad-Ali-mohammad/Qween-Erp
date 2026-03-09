import request from 'supertest';
import { app } from '../../src/app';
import { ensureAdminUser, loginAdmin, uniqueCode } from './helpers';

jest.setTimeout(60000);

describe('Stage 12 deep CRUD coverage (page-by-page)', () => {
  let token = '';
  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    await ensureAdminUser();
    token = await loginAdmin();
  });

  it('covers administration + accounting base CRUD', async () => {
    const roleName = uniqueCode('role12').toLowerCase();
    const username = uniqueCode('user12').toLowerCase();
    const accountCode = `9${String(Date.now()).slice(-7)}`;
    const fiscalName = uniqueCode('FY12');
    const fiscalName2 = `${fiscalName}-U`;

    const companyGet = await request(app).get('/api/settings/company').set(auth());
    expect(companyGet.status).toBe(200);

    const companyPut = await request(app).put('/api/settings/company').set(auth()).send({
      nameAr: 'شركة مرحلة 12',
      city: 'Riyadh',
      currency: 'SAR',
      fiscalYearStartMonth: 1
    });
    expect(companyPut.status).toBe(200);
    expect(companyPut.body.success).toBe(true);

    const systemGet = await request(app).get('/api/settings/system').set(auth());
    expect(systemGet.status).toBe(200);

    const systemPut = await request(app).put('/api/settings/system').set(auth()).send({
      invoicePrefix: 'INV12',
      quotePrefix: 'QT12',
      requireApproval: true,
      allowNegativeStock: false,
      approvalThreshold: 5000
    });
    expect(systemPut.status).toBe(200);
    expect(systemPut.body.success).toBe(true);

    const roleCreate = await request(app).post('/api/roles').set(auth()).send({
      name: roleName,
      nameAr: `دور ${roleName}`,
      description: 'stage12',
      permissions: {
        'users.read': true,
        'users.write': true,
        'roles.read': true,
        'roles.write': true
      }
    });
    expect(roleCreate.status).toBe(201);
    const roleId = Number(roleCreate.body.data.id);

    const roleGet = await request(app).get(`/api/roles/${roleId}`).set(auth());
    expect(roleGet.status).toBe(200);
    expect(Number(roleGet.body.data.id)).toBe(roleId);

    const rolePut = await request(app).put(`/api/roles/${roleId}`).set(auth()).send({
      nameAr: `دور ${roleName} محدث`,
      permissions: {
        'users.read': true,
        'users.write': true,
        'roles.read': true,
        'roles.write': true,
        'settings.read': true
      }
    });
    expect(rolePut.status).toBe(200);

    const rolePermGet = await request(app).get(`/api/roles/${roleId}/permissions`).set(auth());
    expect(rolePermGet.status).toBe(200);

    const rolePermPut = await request(app).put(`/api/roles/${roleId}/permissions`).set(auth()).send({
      'users.read': true,
      'users.write': true,
      'roles.read': true,
      'roles.write': true
    });
    expect(rolePermPut.status).toBe(200);

    const userCreate = await request(app).post('/api/users').set(auth()).send({
      username,
      email: `${username}@erp.local`,
      fullName: 'Stage 12 User',
      password: 'pass1234',
      roleId
    });
    expect(userCreate.status).toBe(201);
    const userId = Number(userCreate.body.data.id);

    const userGet = await request(app).get(`/api/users/${userId}`).set(auth());
    expect(userGet.status).toBe(200);

    const userPut = await request(app).put(`/api/users/${userId}`).set(auth()).send({
      fullName: 'Stage 12 User Updated',
      phone: '0500000000'
    });
    expect(userPut.status).toBe(200);

    const userPermGet = await request(app).get(`/api/users/${userId}/permissions`).set(auth());
    expect(userPermGet.status).toBe(200);

    const userPermPut = await request(app).put(`/api/users/${userId}/permissions`).set(auth()).send({
      'users.read': true,
      'users.write': false
    });
    expect(userPermPut.status).toBe(200);

    const accountCreate = await request(app).post('/api/accounts').set(auth()).send({
      code: accountCode,
      nameAr: 'مصروف اختبار مرحلة 12',
      type: 'EXPENSE',
      allowPosting: true,
      normalBalance: 'Debit'
    });
    expect(accountCreate.status).toBe(201);
    const accountId = Number(accountCreate.body.data.id);

    const accountGet = await request(app).get(`/api/accounts/${accountId}`).set(auth());
    expect(accountGet.status).toBe(200);

    const accountPut = await request(app).put(`/api/accounts/${accountId}`).set(auth()).send({
      nameAr: 'مصروف اختبار مرحلة 12 - محدث'
    });
    expect(accountPut.status).toBe(200);

    const fiscalCreate = await request(app).post('/api/fiscal-years').set(auth()).send({
      name: fiscalName,
      startDate: '2026-01-01T00:00:00.000Z',
      endDate: '2026-12-31',
      status: 'OPEN',
      isCurrent: false
    });
    expect(fiscalCreate.status).toBe(201);
    const fiscalId = Number(fiscalCreate.body.data.id);

    const fiscalGet = await request(app).get(`/api/fiscal-years/${fiscalId}`).set(auth());
    expect(fiscalGet.status).toBe(200);

    const fiscalPut = await request(app).put(`/api/fiscal-years/${fiscalId}`).set(auth()).send({
      name: fiscalName2
    });
    expect(fiscalPut.status).toBe(200);

    const periodCreate = await request(app).post('/api/periods').set(auth()).send({
      fiscalYearId: fiscalId,
      number: 1,
      name: 'يناير 2026 - اختبار',
      startDate: '2026-01-01T00:00:00.000Z',
      endDate: '2026-01-31',
      status: 'OPEN',
      canPost: true
    });
    expect(periodCreate.status).toBe(201);
    const periodId = Number(periodCreate.body.data.id);

    const periodGet = await request(app).get(`/api/periods/${periodId}`).set(auth());
    expect(periodGet.status).toBe(200);

    const periodPut = await request(app).put(`/api/periods/${periodId}`).set(auth()).send({
      name: 'يناير 2026 - محدث'
    });
    expect(periodPut.status).toBe(200);

    const periodClose = await request(app).post(`/api/periods/${periodId}/close`).set(auth()).send({});
    expect(periodClose.status).toBe(200);

    const periodOpen = await request(app).post(`/api/periods/${periodId}/open`).set(auth()).send({});
    expect(periodOpen.status).toBe(200);

    const periodDelete = await request(app).delete(`/api/periods/${periodId}`).set(auth());
    expect(periodDelete.status).toBe(200);

    const fiscalDelete = await request(app).delete(`/api/fiscal-years/${fiscalId}`).set(auth());
    expect(fiscalDelete.status).toBe(200);

    const accountDelete = await request(app).delete(`/api/accounts/${accountId}`).set(auth());
    expect(accountDelete.status).toBe(200);

    const userDelete = await request(app).delete(`/api/users/${userId}`).set(auth());
    expect(userDelete.status).toBe(200);

    const roleDelete = await request(app).delete(`/api/roles/${roleId}`).set(auth());
    expect(roleDelete.status).toBe(200);
  });

  it('covers CRM + projects + HR + contracts CRUD', async () => {
    const customerCode = uniqueCode('CUS12');
    const supplierCode = uniqueCode('SUP12');
    const oppTitle = uniqueCode('OPP12');
    const ticketNumber = uniqueCode('TCK12');
    const ticketNumber2 = uniqueCode('TCK12B');
    const projectCode = uniqueCode('PRJ12');
    const empCode = uniqueCode('EMP12');
    const contractNumber = uniqueCode('CTR12');

    const customer = await request(app).post('/api/customers').set(auth()).send({
      code: customerCode,
      nameAr: 'عميل مرحلة 12'
    });
    expect(customer.status).toBe(200);
    const customerId = Number(customer.body.data.id);

    const supplier = await request(app).post('/api/suppliers').set(auth()).send({
      code: supplierCode,
      nameAr: 'مورد مرحلة 12'
    });
    expect(supplier.status).toBe(200);
    const supplierId = Number(supplier.body.data.id);

    const oppCreate = await request(app).post('/api/opportunities').set(auth()).send({
      title: oppTitle,
      customerId,
      stage: 'LEAD',
      probability: 10,
      value: 1000,
      status: 'OPEN'
    });
    expect(oppCreate.status).toBe(201);
    const opportunityId = Number(oppCreate.body.data.id);

    const oppList = await request(app).get('/api/opportunities').set(auth());
    expect(oppList.status).toBe(200);
    expect(Array.isArray(oppList.body.data)).toBe(true);

    const oppGet = await request(app).get(`/api/opportunities/${opportunityId}`).set(auth());
    expect(oppGet.status).toBe(200);

    const oppPut = await request(app).put(`/api/opportunities/${opportunityId}`).set(auth()).send({
      title: `${oppTitle}-U`,
      probability: 25
    });
    expect(oppPut.status).toBe(200);

    const oppStage = await request(app).patch(`/api/opportunities/${opportunityId}/stage`).set(auth()).send({
      stage: 'QUALIFIED',
      status: 'OPEN',
      probability: 30
    });
    expect(oppStage.status).toBe(200);

    const ticketCreate = await request(app).post('/api/tickets').set(auth()).send({
      number: ticketNumber,
      customerId,
      subject: 'تذكرة مرحلة 12',
      description: 'فتح تذكرة',
      priority: 'MEDIUM',
      status: 'OPEN'
    });
    expect(ticketCreate.status).toBe(201);
    const ticketId = Number(ticketCreate.body.data.id);

    const ticketGet = await request(app).get(`/api/tickets/${ticketId}`).set(auth());
    expect(ticketGet.status).toBe(200);

    const ticketPut = await request(app).put(`/api/tickets/${ticketId}`).set(auth()).send({
      priority: 'HIGH',
      description: 'تحديث التذكرة'
    });
    expect(ticketPut.status).toBe(200);

    const ticketComment = await request(app).post(`/api/tickets/${ticketId}/comments`).set(auth()).send({
      message: 'تعليق متابعة'
    });
    expect(ticketComment.status).toBe(201);

    const ticketAssign = await request(app).post(`/api/tickets/${ticketId}/assign`).set(auth()).send({
      assigneeId: null
    });
    expect(ticketAssign.status).toBe(200);

    const ticketStatus = await request(app).patch(`/api/tickets/${ticketId}/status`).set(auth()).send({
      status: 'IN_PROGRESS'
    });
    expect(ticketStatus.status).toBe(200);

    const ticket2Create = await request(app).post('/api/support-tickets').set(auth()).send({
      number: ticketNumber2,
      customerId,
      subject: 'تذكرة دعم عامة',
      description: 'عبر واجهة support-tickets',
      priority: 'LOW',
      status: 'OPEN'
    });
    expect(ticket2Create.status).toBe(201);
    const ticket2Id = Number(ticket2Create.body.data.id);

    const contactCreate = await request(app).post('/api/contacts').set(auth()).send({
      customerId,
      name: 'جهة اتصال 12',
      email: 'contact12@erp.local',
      isPrimary: true
    });
    expect(contactCreate.status).toBe(201);
    const contactId = Number(contactCreate.body.data.id);

    const contactGet = await request(app).get(`/api/contacts/${contactId}`).set(auth());
    expect(contactGet.status).toBe(200);

    const contactPut = await request(app).put(`/api/contacts/${contactId}`).set(auth()).send({
      name: 'جهة اتصال 12 محدثة',
      isPrimary: false
    });
    expect(contactPut.status).toBe(200);

    const projectCreate = await request(app).post('/api/projects').set(auth()).send({
      code: projectCode,
      nameAr: 'مشروع مرحلة 12',
      status: 'Active',
      isActive: true,
      actualCost: 0
    });
    expect(projectCreate.status).toBe(201);
    const projectId = Number(projectCreate.body.data.id);

    const projectGet = await request(app).get(`/api/projects/${projectId}`).set(auth());
    expect(projectGet.status).toBe(200);

    const projectPut = await request(app).put(`/api/projects/${projectId}`).set(auth()).send({
      description: 'مشروع محدث',
      budget: 5000
    });
    expect(projectPut.status).toBe(200);

    const taskCreate = await request(app).post(`/api/projects/${projectId}/tasks`).set(auth()).send({
      title: 'مهمة مشروع 12',
      priority: 'MEDIUM',
      status: 'TODO',
      progress: 0,
      estimatedHours: 8
    });
    expect(taskCreate.status).toBe(201);
    const projectTaskId = Number(taskCreate.body.data.id);

    const tasksList = await request(app).get(`/api/projects/${projectId}/tasks`).set(auth());
    expect(tasksList.status).toBe(200);

    const taskPut = await request(app).put(`/api/project-tasks/${projectTaskId}`).set(auth()).send({
      status: 'IN_PROGRESS',
      progress: 40
    });
    expect(taskPut.status).toBe(200);

    const expenseCreate = await request(app).post(`/api/projects/${projectId}/expenses`).set(auth()).send({
      date: new Date().toISOString(),
      category: 'TOOLS',
      description: 'مصروف مشروع',
      amount: 120
    });
    expect(expenseCreate.status).toBe(201);
    const expenseId = Number(expenseCreate.body.data.id);

    const expensesList = await request(app).get(`/api/projects/${projectId}/expenses`).set(auth());
    expect(expensesList.status).toBe(200);

    const expensePut = await request(app).put(`/api/expenses/${expenseId}`).set(auth()).send({
      amount: 180
    });
    expect(expensePut.status).toBe(200);

    const empCreate = await request(app).post('/api/employees').set(auth()).send({
      code: empCode,
      fullName: 'موظف مرحلة 12',
      status: 'ACTIVE',
      baseSalary: 3000,
      allowances: 500
    });
    expect(empCreate.status).toBe(201);
    const employeeId = Number(empCreate.body.data.id);

    const empGet = await request(app).get(`/api/employees/${employeeId}`).set(auth());
    expect(empGet.status).toBe(200);

    const empPut = await request(app).put(`/api/employees/${employeeId}`).set(auth()).send({
      position: 'Accountant'
    });
    expect(empPut.status).toBe(200);

    const leaveCreate = await request(app).post('/api/leaves').set(auth()).send({
      employeeId,
      type: 'ANNUAL',
      startDate: '2026-03-01T00:00:00.000Z',
      endDate: '2026-03-03T00:00:00.000Z',
      daysCount: 3,
      status: 'PENDING'
    });
    expect(leaveCreate.status).toBe(201);
    const leaveId = Number(leaveCreate.body.data.id);

    const leaveApprove = await request(app).post(`/api/leaves/${leaveId}/approve`).set(auth()).send({});
    expect(leaveApprove.status).toBe(200);

    const leaveCreate2 = await request(app).post('/api/leaves').set(auth()).send({
      employeeId,
      type: 'SICK',
      startDate: '2026-04-01T00:00:00.000Z',
      endDate: '2026-04-01T00:00:00.000Z',
      daysCount: 1,
      status: 'PENDING'
    });
    expect(leaveCreate2.status).toBe(201);
    const leave2Id = Number(leaveCreate2.body.data.id);

    const leaveReject = await request(app).post(`/api/leaves/${leave2Id}/reject`).set(auth()).send({});
    expect(leaveReject.status).toBe(200);

    const payrollGenerate = await request(app).post('/api/payroll/generate').set(auth()).send({
      year: 2026,
      month: 3
    });
    expect(payrollGenerate.status).toBe(201);
    const payrollId = Number(payrollGenerate.body.data.id);

    const payrollList = await request(app).get('/api/payroll').set(auth());
    expect(payrollList.status).toBe(200);

    const payrollGet = await request(app).get(`/api/payroll/${payrollId}`).set(auth());
    expect(payrollGet.status).toBe(200);

    const payrollApprove = await request(app).post(`/api/payroll/${payrollId}/approve`).set(auth()).send({});
    expect([200, 400]).toContain(payrollApprove.status);

    const contractCreate = await request(app).post('/api/contracts').set(auth()).send({
      number: contractNumber,
      title: 'عقد مرحلة 12',
      partyType: 'CUSTOMER',
      partyId: customerId,
      type: 'SERVICE',
      startDate: '2026-01-01T00:00:00.000Z',
      status: 'DRAFT',
      value: 10000
    });
    expect(contractCreate.status).toBe(201);
    const contractId = Number(contractCreate.body.data.id);

    const contractGet = await request(app).get(`/api/contracts/${contractId}`).set(auth());
    expect(contractGet.status).toBe(200);

    const contractPut = await request(app).put(`/api/contracts/${contractId}`).set(auth()).send({
      title: 'عقد مرحلة 12 - محدث'
    });
    expect(contractPut.status).toBe(200);

    const contractApprove = await request(app).post(`/api/contracts/${contractId}/approve`).set(auth()).send({});
    expect(contractApprove.status).toBe(200);

    const contractRenew = await request(app).post(`/api/contracts/${contractId}/renew`).set(auth()).send({
      months: 3
    });
    expect([200, 400]).toContain(contractRenew.status);

    const milestoneCreate = await request(app).post(`/api/contracts/${contractId}/milestones`).set(auth()).send({
      title: 'مرحلة 12',
      dueDate: '2026-05-01T00:00:00.000Z',
      amount: 2500,
      status: 'PENDING'
    });
    expect(milestoneCreate.status).toBe(201);
    const milestoneId = Number(milestoneCreate.body.data.id);

    const milestoneList = await request(app).get(`/api/contracts/${contractId}/milestones`).set(auth());
    expect(milestoneList.status).toBe(200);

    const milestonePut = await request(app).put(`/api/milestones/${milestoneId}`).set(auth()).send({
      status: 'IN_PROGRESS'
    });
    expect(milestonePut.status).toBe(200);

    const milestoneComplete = await request(app).post(`/api/milestones/${milestoneId}/complete`).set(auth()).send({});
    expect([200, 400]).toContain(milestoneComplete.status);

    const milestoneDelete = await request(app).delete(`/api/milestones/${milestoneId}`).set(auth());
    expect(milestoneDelete.status).toBe(200);

    const contractTerminate = await request(app).post(`/api/contracts/${contractId}/terminate`).set(auth()).send({});
    expect(contractTerminate.status).toBe(200);

    const contractDelete = await request(app).delete(`/api/contracts/${contractId}`).set(auth());
    expect(contractDelete.status).toBe(200);

    const leaveDelete1 = await request(app).delete(`/api/leaves/${leaveId}`).set(auth());
    expect(leaveDelete1.status).toBe(200);

    const leaveDelete2 = await request(app).delete(`/api/leaves/${leave2Id}`).set(auth());
    expect(leaveDelete2.status).toBe(200);

    const employeeDelete = await request(app).delete(`/api/employees/${employeeId}`).set(auth());
    expect(employeeDelete.status).toBe(200);

    const expenseDelete = await request(app).delete(`/api/expenses/${expenseId}`).set(auth());
    expect(expenseDelete.status).toBe(200);

    const taskDelete = await request(app).delete(`/api/project-tasks/${projectTaskId}`).set(auth());
    expect(taskDelete.status).toBe(200);

    const projectDelete = await request(app).delete(`/api/projects/${projectId}`).set(auth());
    expect(projectDelete.status).toBe(200);

    const contactDelete = await request(app).delete(`/api/contacts/${contactId}`).set(auth());
    expect(contactDelete.status).toBe(200);

    const ticket2Delete = await request(app).delete(`/api/support-tickets/${ticket2Id}`).set(auth());
    expect(ticket2Delete.status).toBe(200);

    const ticketDelete = await request(app).delete(`/api/support-tickets/${ticketId}`).set(auth());
    expect(ticketDelete.status).toBe(200);

    const oppDelete = await request(app).delete(`/api/opportunities/${opportunityId}`).set(auth());
    expect(oppDelete.status).toBe(200);

    const supplierDelete = await request(app).delete(`/api/suppliers/${supplierId}`).set(auth());
    expect(supplierDelete.status).toBe(200);

    const customerDelete = await request(app).delete(`/api/customers/${customerId}`).set(auth());
    expect(customerDelete.status).toBe(200);
  });

  it('covers taxes + currencies + custom/scheduled reports CRUD', async () => {
    const taxCode = uniqueCode('TX12').toUpperCase();
    const categoryCode = uniqueCode('TCAT12').toUpperCase();
    const currencyCode = uniqueCode('CUR12').toUpperCase();
    const reportName = uniqueCode('RPT12');
    const scheduleName = uniqueCode('SCH12');

    const codeCreate = await request(app).post('/api/tax-codes').set(auth()).send({
      code: taxCode,
      nameAr: 'كود ضريبة مرحلة 12',
      type: 'VAT',
      rate: 15,
      isRecoverable: true,
      isActive: true
    });
    expect(codeCreate.status).toBe(201);
    const taxCodeId = Number(codeCreate.body.data.id);

    const codeGet = await request(app).get(`/api/tax-codes/${taxCodeId}`).set(auth());
    expect(codeGet.status).toBe(200);

    const codePut = await request(app).put(`/api/tax-codes/${taxCodeId}`).set(auth()).send({
      nameAr: 'كود ضريبة مرحلة 12 - محدث',
      rate: 10
    });
    expect(codePut.status).toBe(200);

    const categoryCreate = await request(app).post('/api/tax-categories').set(auth()).send({
      code: categoryCode,
      nameAr: 'فئة ضريبية 12',
      rate: 5,
      isActive: true
    });
    expect(categoryCreate.status).toBe(201);
    const categoryId = Number(categoryCreate.body.data.id);

    const categoryGet = await request(app).get(`/api/tax-categories/${categoryId}`).set(auth());
    expect(categoryGet.status).toBe(200);

    const categoryPut = await request(app).put(`/api/tax-categories/${categoryId}`).set(auth()).send({
      nameAr: 'فئة ضريبية 12 - محدثة'
    });
    expect(categoryPut.status).toBe(200);

    const declarationCreate = await request(app).post('/api/tax-declarations').set(auth()).send({
      periodStart: '2026-01-01',
      periodEnd: '2026-01-31',
      type: 'VAT',
      totalSales: 1000,
      totalPurchases: 500,
      outputTax: 150,
      inputTax: 75,
      netPayable: 75,
      status: 'DRAFT'
    });
    expect(declarationCreate.status).toBe(201);
    const declarationId = Number(declarationCreate.body.data.id);

    const declarationGet = await request(app).get(`/api/tax-declarations/${declarationId}`).set(auth());
    expect(declarationGet.status).toBe(200);

    const declarationPut = await request(app).put(`/api/tax-declarations/${declarationId}`).set(auth()).send({
      notes: 'تحديث إقرار مرحلة 12'
    });
    expect(declarationPut.status).toBe(200);

    const declarationSubmit = await request(app).post(`/api/tax-declarations/${declarationId}/submit`).set(auth()).send({});
    expect([200, 400]).toContain(declarationSubmit.status);

    const zatcaGet = await request(app).get('/api/zatca/settings').set(auth());
    expect(zatcaGet.status).toBe(200);

    const zatcaPut = await request(app).put('/api/zatca/settings').set(auth()).send({
      isEnabled: true,
      environment: 'sandbox',
      endpoint: '',
      otp: ''
    });
    expect(zatcaPut.status).toBe(200);

    const currencyCreate = await request(app).post('/api/currencies').set(auth()).send({
      code: currencyCode,
      nameAr: 'عملة مرحلة 12',
      symbol: '$',
      isBase: false,
      isActive: true
    });
    expect(currencyCreate.status).toBe(201);

    const currencyGet = await request(app).get(`/api/currencies/${currencyCode}`).set(auth());
    expect(currencyGet.status).toBe(200);

    const currencyPut = await request(app).put(`/api/currencies/${currencyCode}`).set(auth()).send({
      nameAr: 'عملة مرحلة 12 - محدثة'
    });
    expect(currencyPut.status).toBe(200);

    const rateCreate = await request(app).post('/api/exchange-rates').set(auth()).send({
      currencyCode,
      rateDate: '2026-03-01T00:00:00.000Z',
      rate: 3.75,
      source: 'manual'
    });
    expect(rateCreate.status).toBe(201);
    const rateId = Number(rateCreate.body.data.id);

    const latestRates = await request(app).get('/api/exchange-rates/latest').set(auth());
    expect(latestRates.status).toBe(200);

    const ratePut = await request(app).put(`/api/exchange-rates/${rateId}`).set(auth()).send({
      rate: 3.8
    });
    expect(ratePut.status).toBe(200);

    const diffGet = await request(app).get('/api/currency-diff').set(auth());
    expect(diffGet.status).toBe(200);

    const diffPut = await request(app).put('/api/currency-diff').set(auth()).send({
      baseCurrency: 'SAR',
      tolerancePercent: 1,
      autoPost: false
    });
    expect(diffPut.status).toBe(200);

    const taxReports = await request(app)
      .get('/api/tax-reports')
      .set(auth())
      .query({ dateFrom: '2026-01-01', dateTo: '2026-12-31' });
    expect(taxReports.status).toBe(200);

    const customCreate = await request(app).post('/api/custom-reports').set(auth()).send({
      name: reportName,
      reportType: 'GENERAL',
      definition: { columns: ['name', 'amount'] }
    });
    expect(customCreate.status).toBe(201);
    const customReportId = Number(customCreate.body.data.id);

    const customRun = await request(app).get(`/api/custom-reports/${customReportId}/run`).set(auth());
    expect(customRun.status).toBe(200);

    const customPut = await request(app).put(`/api/custom-reports/${customReportId}`).set(auth()).send({
      name: `${reportName}-U`
    });
    expect(customPut.status).toBe(200);

    const scheduleCreate = await request(app).post('/api/reports/schedules').set(auth()).send({
      name: scheduleName,
      reportType: 'GENERAL',
      schedule: '0 8 * * *',
      format: 'PDF',
      recipients: ['finance@erp.local'],
      isActive: true
    });
    expect(scheduleCreate.status).toBe(201);
    const scheduleId = Number(scheduleCreate.body.data.id);

    const schedulePut = await request(app).put(`/api/scheduled-reports/${scheduleId}`).set(auth()).send({
      format: 'XLSX'
    });
    expect(schedulePut.status).toBe(200);

    const scheduleDelete = await request(app).delete(`/api/scheduled-reports/${scheduleId}`).set(auth());
    expect(scheduleDelete.status).toBe(200);

    const customDelete = await request(app).delete(`/api/custom-reports/${customReportId}`).set(auth());
    expect(customDelete.status).toBe(200);

    const rateDelete = await request(app).delete(`/api/exchange-rates/${rateId}`).set(auth());
    expect(rateDelete.status).toBe(200);

    const currencyDelete = await request(app).delete(`/api/currencies/${currencyCode}`).set(auth());
    expect(currencyDelete.status).toBe(200);

    const declarationDelete = await request(app).delete(`/api/tax-declarations/${declarationId}`).set(auth());
    expect(declarationDelete.status).toBe(200);

    const categoryDelete = await request(app).delete(`/api/tax-categories/${categoryId}`).set(auth());
    expect(categoryDelete.status).toBe(200);

    const codeDelete = await request(app).delete(`/api/tax-codes/${taxCodeId}`).set(auth());
    expect(codeDelete.status).toBe(200);
  });
});

