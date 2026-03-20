import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/config/database';
import { ensureAdminUser, loginAdmin, uniqueCode } from './helpers';

async function ensureOpenPeriodFor(date: Date): Promise<void> {
  const existing = await prisma.accountingPeriod.findFirst({
    where: {
      startDate: { lte: date },
      endDate: { gte: date },
      status: 'OPEN',
      canPost: true,
      fiscalYear: { status: 'OPEN' }
    }
  });
  if (existing) return;

  const year = date.getUTCFullYear();
  const fiscalYear = await prisma.fiscalYear.upsert({
    where: { name: String(year) },
    update: { status: 'OPEN', isCurrent: true },
    create: {
      name: String(year),
      startDate: new Date(Date.UTC(year, 0, 1)),
      endDate: new Date(Date.UTC(year, 11, 31, 23, 59, 59)),
      status: 'OPEN',
      isCurrent: true
    }
  });

  await prisma.accountingPeriod.upsert({
    where: {
      fiscalYearId_number: {
        fiscalYearId: fiscalYear.id,
        number: date.getUTCMonth() + 1
      }
    },
    update: {
      startDate: new Date(Date.UTC(year, date.getUTCMonth(), 1)),
      endDate: new Date(Date.UTC(year, date.getUTCMonth() + 1, 0, 23, 59, 59)),
      status: 'OPEN',
      canPost: true
    },
    create: {
      fiscalYearId: fiscalYear.id,
      number: date.getUTCMonth() + 1,
      name: `P-${date.getUTCMonth() + 1}`,
      startDate: new Date(Date.UTC(year, date.getUTCMonth(), 1)),
      endDate: new Date(Date.UTC(year, date.getUTCMonth() + 1, 0, 23, 59, 59)),
      status: 'OPEN',
      canPost: true
    }
  });
}

async function ensurePostingAccounts(): Promise<void> {
  const accounts = [
    { code: '1100', nameAr: 'النقدية', type: 'ASSET', normalBalance: 'Debit' },
    { code: '1300', nameAr: 'الذمم المدينة', type: 'ASSET', normalBalance: 'Debit' },
    { code: '2100', nameAr: 'الذمم الدائنة', type: 'LIABILITY', normalBalance: 'Credit' },
    { code: '2200', nameAr: 'الضريبة', type: 'LIABILITY', normalBalance: 'Credit' },
    { code: '4100', nameAr: 'إيرادات', type: 'REVENUE', normalBalance: 'Credit' },
    { code: '5100', nameAr: 'مصروفات', type: 'EXPENSE', normalBalance: 'Debit' }
  ];

  for (const account of accounts) {
    await prisma.account.upsert({
      where: { code: account.code },
      update: {
        nameAr: account.nameAr,
        type: account.type as any,
        normalBalance: account.normalBalance,
        allowPosting: true,
        isActive: true
      },
      create: {
        code: account.code,
        nameAr: account.nameAr,
        type: account.type as any,
        normalBalance: account.normalBalance,
        allowPosting: true,
        isActive: true
      }
    });
  }

  await prisma.systemSettings.upsert({
    where: { id: 1 },
    update: { postingAccounts: {} },
    create: { id: 1, postingAccounts: {} }
  });
}

describe('Subcontractors system', () => {
  let token = '';
  let branchId = 0;
  let supplierId = 0;
  let projectId = 0;
  let subcontractId = 0;
  let ipcId = 0;
  let payableInvoiceId = 0;
  let paymentId = 0;
  let invoiceJournalId = 0;
  let paymentJournalId = 0;

  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    await ensureAdminUser();
    token = await loginAdmin();
    await ensureOpenPeriodFor(new Date('2026-03-19T00:00:00.000Z'));
    await ensurePostingAccounts();
  });

  afterAll(async () => {
    if (paymentId) {
      await prisma.paymentAllocation.deleteMany({ where: { paymentId } });
      await prisma.payment.deleteMany({ where: { id: paymentId } });
    }
    if (payableInvoiceId) {
      await prisma.invoiceLine.deleteMany({ where: { invoiceId: payableInvoiceId } });
      await prisma.invoice.deleteMany({ where: { id: payableInvoiceId } });
    }
    if (invoiceJournalId) {
      await prisma.journalEntry.deleteMany({ where: { id: invoiceJournalId } });
    }
    if (paymentJournalId) {
      await prisma.journalEntry.deleteMany({ where: { id: paymentJournalId } });
    }
    if (subcontractId) {
      await prisma.subcontract.deleteMany({ where: { id: subcontractId } });
    }
    if (projectId) {
      await prisma.project.deleteMany({ where: { id: projectId } });
    }
    if (supplierId) {
      await prisma.supplier.deleteMany({ where: { id: supplierId } });
    }
    if (branchId) {
      await prisma.branch.deleteMany({ where: { id: branchId } });
    }
  });

  it('creates subcontract, certifies IPC into payable, and pays it end-to-end', async () => {
    branchId = (
      await prisma.branch.create({
        data: {
          code: uniqueCode('BR'),
          nameAr: 'فرع مقاولي الباطن'
        }
      })
    ).id;

    supplierId = (
      await prisma.supplier.create({
        data: {
          code: uniqueCode('SUP'),
          nameAr: 'مقاول باطن تجريبي',
          branchId,
          paymentTerms: 15
        }
      })
    ).id;

    projectId = (
      await prisma.project.create({
        data: {
          code: uniqueCode('PRJ'),
          nameAr: 'مشروع اختبار مقاولي الباطن',
          branchId,
          budget: 250000
        }
      })
    ).id;

    const createSubcontractRes = await request(app).post('/api/subcontractors/subcontracts').set(auth()).send({
      branchId,
      supplierId,
      projectId,
      title: 'عقد تنفيذ أعمال تشطيب',
      contractValue: 120000,
      retentionRate: 10,
      scope: 'أعمال تشطيب داخلية'
    });

    expect(createSubcontractRes.status).toBe(201);
    subcontractId = Number(createSubcontractRes.body.data.id);
    expect(createSubcontractRes.body.data.number).toContain('SUB-');

    const activateRes = await request(app).post(`/api/subcontractors/subcontracts/${subcontractId}/activate`).set(auth()).send({});
    expect(activateRes.status).toBe(200);
    expect(activateRes.body.data.status).toBe('ACTIVE');

    const createIpcRes = await request(app).post('/api/subcontractors/ipcs').set(auth()).send({
      subcontractId,
      certificateDate: '2026-03-19',
      periodStart: '2026-03-01',
      periodEnd: '2026-03-15',
      claimedAmount: 30000,
      certifiedAmount: 28000,
      retentionRate: 10,
      notes: 'المستخلص الأول'
    });

    expect(createIpcRes.status).toBe(201);
    ipcId = Number(createIpcRes.body.data.id);
    expect(Number(createIpcRes.body.data.netAmount)).toBe(25200);

    const submitIpcRes = await request(app).post(`/api/subcontractors/ipcs/${ipcId}/submit`).set(auth()).send({});
    expect(submitIpcRes.status).toBe(200);
    expect(submitIpcRes.body.data.status).toBe('SUBMITTED');

    const approveIpcRes = await request(app).post(`/api/subcontractors/ipcs/${ipcId}/approve`).set(auth()).send({});
    expect(approveIpcRes.status).toBe(200);
    expect(approveIpcRes.body.data.status).toBe('CERTIFIED');
    payableInvoiceId = Number(approveIpcRes.body.data.payableInvoice?.id);
    expect(payableInvoiceId).toBeGreaterThan(0);

    const paymentRes = await request(app).post(`/api/subcontractors/ipcs/${ipcId}/payments`).set(auth()).send({
      amount: 25200,
      date: '2026-03-20',
      method: 'BANK_TRANSFER',
      completeImmediately: true
    });

    expect(paymentRes.status).toBe(201);
    paymentId = Number(paymentRes.body.data.payment.id);
    expect(paymentRes.body.data.payment.status).toBe('COMPLETED');
    expect(paymentRes.body.data.ipc.status).toBe('PAID');

    const [ipc, subcontract, payableInvoice, payment, dashboardRes, events] = await Promise.all([
      prisma.subcontractIpc.findUnique({ where: { id: ipcId } }),
      prisma.subcontract.findUnique({ where: { id: subcontractId } }),
      prisma.invoice.findUnique({ where: { id: payableInvoiceId } }),
      prisma.payment.findUnique({ where: { id: paymentId } }),
      request(app).get('/api/subcontractors/dashboard/summary').set(auth()),
      prisma.outboxEvent.findMany({
        where: {
          eventType: {
            in: [
              'subcontractors.subcontract.created',
              'subcontractors.subcontract.activated',
              'subcontractors.ipc.created',
              'subcontractors.ipc.submitted',
              'subcontractors.ipc.approved',
              'subcontractors.ipc.paid',
              'finance.invoice.created',
              'finance.invoice.issued',
              'finance.payment.created',
              'finance.payment.completed'
            ]
          }
        }
      })
    ]);

    invoiceJournalId = Number(payableInvoice?.journalEntryId || 0);
    paymentJournalId = Number(payment?.journalEntryId || 0);

    expect(ipc?.status).toBe('PAID');
    expect(ipc?.approvalStatus).toBe('APPROVED');
    expect(subcontract?.status).toBe('ACTIVE');
    expect(Number(subcontract?.certifiedAmount)).toBe(28000);
    expect(Number(subcontract?.paidAmount)).toBe(25200);
    expect(Number(payableInvoice?.outstanding)).toBe(0);
    expect(payableInvoice?.status).toBe('PAID');
    expect(payableInvoice?.type).toBe('PURCHASE');
    expect(payment?.status).toBe('COMPLETED');
    expect(dashboardRes.status).toBe(200);
    expect(Array.isArray(dashboardRes.body.data)).toBe(true);

    const eventTypes = new Set(events.map((event) => event.eventType));
    expect(eventTypes.has('subcontractors.subcontract.created')).toBe(true);
    expect(eventTypes.has('subcontractors.subcontract.activated')).toBe(true);
    expect(eventTypes.has('subcontractors.ipc.created')).toBe(true);
    expect(eventTypes.has('subcontractors.ipc.submitted')).toBe(true);
    expect(eventTypes.has('subcontractors.ipc.approved')).toBe(true);
    expect(eventTypes.has('subcontractors.ipc.paid')).toBe(true);
    expect(eventTypes.has('finance.invoice.created')).toBe(true);
    expect(eventTypes.has('finance.invoice.issued')).toBe(true);
    expect(eventTypes.has('finance.payment.created')).toBe(true);
    expect(eventTypes.has('finance.payment.completed')).toBe(true);
  });
});
