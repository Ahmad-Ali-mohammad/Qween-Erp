import { prisma } from '../../config/database';
import { getSystemDashboardDefinition, type SystemDashboardKey } from './catalog';

export type DashboardFilters = {
  branchId?: number;
  projectId?: number;
  dateFrom: Date;
  dateTo: Date;
};

export type DashboardSummaryItem = {
  key: string;
  label: string;
  value: number | string;
  tone?: 'neutral' | 'positive' | 'warning' | 'danger' | 'info';
  route?: string;
};

export type DashboardQueueItem = {
  key: string;
  label: string;
  count: number;
  tone?: 'neutral' | 'positive' | 'warning' | 'danger' | 'info';
  route?: string;
};

export type DashboardActivityItem = {
  key: string;
  title: string;
  subtitle?: string;
  date?: string;
  status?: string;
  route?: string;
};

export type DashboardAlertItem = {
  key: string;
  title: string;
  message: string;
  severity: 'info' | 'success' | 'warning' | 'danger';
  route?: string;
};

export type DashboardChart = {
  key: string;
  title: string;
  kind: 'line' | 'bar' | 'donut';
  series: Array<{ label: string; value: number }>;
};

type SystemDashboardBundle = {
  summary: DashboardSummaryItem[];
  queues: DashboardQueueItem[];
  activity: DashboardActivityItem[];
  alerts: DashboardAlertItem[];
  charts: DashboardChart[];
};

function toNumber(value: unknown): number {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function parsePositiveInt(value: unknown): number | undefined {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return undefined;
  }
  return parsed;
}

function parseDate(value: unknown, fallback: Date): Date {
  if (!value) return fallback;
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return fallback;
  return parsed;
}

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function startOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function mapAmountByMonth(rows: Array<{ date: Date; amount: number }>): Array<{ label: string; value: number }> {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const key = monthKey(row.date);
    totals.set(key, (totals.get(key) ?? 0) + row.amount);
  }
  return Array.from(totals.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([label, value]) => ({ label, value: Math.round(value * 100) / 100 }));
}

function buildSkeletonBundle(key: SystemDashboardKey): SystemDashboardBundle {
  const definition = getSystemDashboardDefinition(key);
  return {
    summary: [
      { key: 'coverage', label: 'حالة الإطلاق', value: 'جاهز للربط', tone: 'info', route: `#/systems/${key}` },
      { key: 'records', label: 'سجلات التشغيل', value: 0, route: `#/systems/${key}` },
      { key: 'approvals', label: 'اعتمادات معلقة', value: 0, route: `#/systems/${key}` },
      { key: 'alerts', label: 'تنبيهات حرجة', value: 0, route: `#/systems/${key}` }
    ],
    queues: [
      { key: 'queue-primary', label: 'قائمة العمل الرئيسية', count: 0, tone: 'info', route: `#/systems/${key}` },
      { key: 'queue-secondary', label: 'مراجعات بانتظار التفعيل', count: 0, route: `#/systems/${key}` },
      { key: 'queue-third', label: 'استثناءات مفتوحة', count: 0, route: `#/systems/${key}` }
    ],
    activity: [
      {
        key: 'bootstrap',
        title: `تم إطلاق لوحة ${definition.title}`,
        subtitle: 'الواجهة جاهزة والربط التشغيلي سيظهر تلقائيًا مع اكتمال خدمات المجال.',
        route: `#/systems/${key}`
      }
    ],
    alerts: [
      {
        key: 'activation',
        title: 'النظام ضمن الإصدار الحالي',
        message: 'تم إنشاء namespace قانوني ولوحة مستقلة لهذا النظام داخل البوابة الموحدة.',
        severity: 'info',
        route: `#/systems/${key}`
      }
    ],
    charts: [
      {
        key: 'readiness',
        title: 'جاهزية النظام',
        kind: 'donut',
        series: [
          { label: 'مكتمل في هذه الموجة', value: 35 },
          { label: 'جارٍ استكماله', value: 65 }
        ]
      }
    ]
  };
}

function buildEmptyAlerts(): DashboardAlertItem[] {
  return [{ key: 'healthy', title: 'لا توجد تنبيهات حرجة', message: 'الوضع التشغيلي مستقر ضمن معايير هذه اللوحة.', severity: 'success' }];
}

async function buildAccountingBundle(filters: DashboardFilters): Promise<SystemDashboardBundle> {
  const branchFilter = filters.branchId ? { branchId: filters.branchId } : {};
  const activityRange = { gte: filters.dateFrom, lte: filters.dateTo };
  const today = new Date();

  const [draftJournals, openPeriods, receivableAgg, payableAgg, bankAgg, unreconciledBanks, pendingPayments, draftTaxDeclarations] = await Promise.all([
    prisma.journalEntry.count({ where: { status: 'DRAFT' } }),
    prisma.accountingPeriod.count({ where: { status: 'OPEN' } }),
    prisma.invoice.aggregate({ where: { ...branchFilter, type: 'SALES', outstanding: { gt: 0 } }, _sum: { outstanding: true } }),
    prisma.invoice.aggregate({ where: { ...branchFilter, type: 'PURCHASE', outstanding: { gt: 0 } }, _sum: { outstanding: true } }),
    prisma.bankAccount.aggregate({ _sum: { currentBalance: true } }),
    prisma.bankTransaction.count({ where: { date: activityRange, isReconciled: false } }),
    prisma.payment.count({ where: { ...branchFilter, status: 'PENDING' } }),
    prisma.taxDeclaration.count({ where: { status: 'DRAFT' } })
  ]);

  const [overdueInvoices, recentJournals, recentInvoices, recentPayments, salesInvoices, purchaseInvoices] = await Promise.all([
    prisma.invoice.count({
      where: {
        ...branchFilter,
        type: 'SALES',
        dueDate: { lt: today },
        outstanding: { gt: 0 },
        status: { in: ['ISSUED', 'PARTIAL'] }
      }
    }),
    prisma.journalEntry.findMany({
      where: { date: activityRange },
      take: 5,
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
      select: { id: true, entryNumber: true, status: true, date: true, totalDebit: true }
    }),
    prisma.invoice.findMany({
      where: { ...branchFilter, date: activityRange },
      take: 5,
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
      include: {
        customer: { select: { nameAr: true } },
        supplier: { select: { nameAr: true } }
      }
    }),
    prisma.payment.findMany({
      where: { ...branchFilter, date: activityRange },
      take: 5,
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
      select: { id: true, number: true, type: true, status: true, amount: true, date: true }
    }),
    prisma.invoice.findMany({
      where: { ...branchFilter, type: 'SALES', status: { in: ['ISSUED', 'PAID', 'PARTIAL'] }, date: activityRange },
      orderBy: { date: 'asc' },
      select: { date: true, total: true }
    }),
    prisma.invoice.findMany({
      where: { ...branchFilter, type: 'PURCHASE', status: { in: ['ISSUED', 'PAID', 'PARTIAL'] }, date: activityRange },
      orderBy: { date: 'asc' },
      select: { date: true, total: true }
    })
  ]);

  const alerts: DashboardAlertItem[] = [];
  if (overdueInvoices > 0) {
    alerts.push({
      key: 'overdue-receivables',
      title: 'ذمم متأخرة التحصيل',
      message: `يوجد ${overdueInvoices} فاتورة مبيعات متأخرة وتتطلب متابعة.`,
      severity: 'warning',
      route: '#/account-statement'
    });
  }
  if (unreconciledBanks > 0) {
    alerts.push({
      key: 'bank-reconciliation',
      title: 'حركات بنكية غير مسواة',
      message: `لا تزال ${unreconciledBanks} حركة بنكية غير مسواة خلال الفترة المحددة.`,
      severity: 'warning',
      route: '#/banks'
    });
  }
  if (draftTaxDeclarations > 0) {
    alerts.push({
      key: 'tax-drafts',
      title: 'إقرارات ضريبية قيد الإعداد',
      message: `هناك ${draftTaxDeclarations} إقرار ضريبي في حالة مسودة.`,
      severity: 'info',
      route: '#/tax-reports'
    });
  }

  return {
    summary: [
      { key: 'draft-journals', label: 'قيود مسودة', value: draftJournals, tone: draftJournals > 0 ? 'warning' : 'positive', route: '#/general-ledger' },
      { key: 'open-periods', label: 'فترات مفتوحة', value: openPeriods, route: '#/year-close' },
      { key: 'receivables', label: 'الذمم المدينة', value: Math.round(toNumber(receivableAgg._sum.outstanding)), route: '#/account-statement' },
      { key: 'payables', label: 'الذمم الدائنة', value: Math.round(toNumber(payableAgg._sum.outstanding)), route: '#/supplier-statements' },
      { key: 'cash-position', label: 'المركز النقدي', value: Math.round(toNumber(bankAgg._sum.currentBalance)), route: '#/banks' },
      { key: 'bank-exceptions', label: 'استثناءات البنوك', value: unreconciledBanks, tone: unreconciledBanks > 0 ? 'warning' : 'positive', route: '#/banks' }
    ],
    queues: [
      { key: 'journals', label: 'قيود تنتظر الاعتماد', count: draftJournals, tone: draftJournals > 0 ? 'warning' : 'positive', route: '#/general-ledger' },
      { key: 'payments', label: 'دفعات قيد التنفيذ', count: pendingPayments, route: '#/receipts' },
      { key: 'tax-declarations', label: 'إقرارات ضريبية مسودة', count: draftTaxDeclarations, route: '#/tax-reports' }
    ],
    activity: [
      ...recentJournals.map((entry) => ({
        key: `journal-${entry.id}`,
        title: `قيد ${entry.entryNumber}`,
        subtitle: `إجمالي ${Math.round(toNumber(entry.totalDebit))}`,
        date: entry.date.toISOString(),
        status: entry.status,
        route: '#/general-ledger'
      })),
      ...recentInvoices.map((invoice) => ({
        key: `invoice-${invoice.id}`,
        title: `فاتورة ${invoice.number}`,
        subtitle: invoice.customer?.nameAr ?? invoice.supplier?.nameAr ?? 'بدون طرف',
        date: invoice.date.toISOString(),
        status: invoice.status,
        route: '#/sales-invoices'
      })),
      ...recentPayments.map((payment) => ({
        key: `payment-${payment.id}`,
        title: `دفعة ${payment.number}`,
        subtitle: `قيمة ${Math.round(toNumber(payment.amount))}`,
        date: payment.date.toISOString(),
        status: payment.status,
        route: '#/receipts'
      }))
    ]
      .sort((left, right) => String(right.date ?? '').localeCompare(String(left.date ?? '')))
      .slice(0, 10),
    alerts: alerts.length ? alerts : buildEmptyAlerts(),
    charts: [
      { key: 'sales-trend', title: 'اتجاه المبيعات', kind: 'line', series: mapAmountByMonth(salesInvoices.map((row) => ({ date: row.date, amount: toNumber(row.total) }))) },
      { key: 'expense-trend', title: 'اتجاه المصروفات', kind: 'bar', series: mapAmountByMonth(purchaseInvoices.map((row) => ({ date: row.date, amount: toNumber(row.total) }))) }
    ]
  };
}

async function buildCrmBundle(filters: DashboardFilters): Promise<SystemDashboardBundle> {
  const quoteBranchFilter = filters.branchId ? { branchId: filters.branchId } : {};
  const today = new Date();
  const soon = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000);

  const [customers, opportunities, wonOpportunities, pipelineAgg, quotesPending, overdueCollections, supportTickets, quotesExpiring] = await Promise.all([
    prisma.customer.count({ where: quoteBranchFilter }),
    prisma.opportunity.findMany({ orderBy: { updatedAt: 'desc' } }),
    prisma.opportunity.count({ where: { status: 'WON' } }),
    prisma.opportunity.aggregate({ where: { status: 'OPEN' }, _sum: { value: true } }),
    prisma.salesQuote.count({ where: { ...quoteBranchFilter, status: { notIn: ['APPROVED', 'ACCEPTED', 'REJECTED'] } } }),
    prisma.invoice.count({
      where: {
        ...quoteBranchFilter,
        type: 'SALES',
        dueDate: { lt: today },
        outstanding: { gt: 0 },
        status: { in: ['ISSUED', 'PARTIAL'] }
      }
    }),
    prisma.supportTicket.count({ where: { status: { notIn: ['CLOSED', 'RESOLVED'] } } }),
    prisma.salesQuote.count({ where: { ...quoteBranchFilter, validUntil: { gte: today, lte: soon } } })
  ]);

  const [recentOpportunities, recentQuotes, recentTickets, overdueInvoices] = await Promise.all([
    prisma.opportunity.findMany({ take: 5, orderBy: { updatedAt: 'desc' } }),
    prisma.salesQuote.findMany({ where: quoteBranchFilter, take: 5, orderBy: { updatedAt: 'desc' } }),
    prisma.supportTicket.findMany({ take: 5, orderBy: { updatedAt: 'desc' } }),
    prisma.invoice.findMany({
      where: {
        ...quoteBranchFilter,
        type: 'SALES',
        dueDate: { lt: today },
        outstanding: { gt: 0 }
      },
      take: 3,
      orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
      include: { customer: { select: { nameAr: true } } }
    })
  ]);

  const totalOpportunities = opportunities.length;
  const winRate = totalOpportunities === 0 ? 0 : Math.round((wonOpportunities / totalOpportunities) * 100);
  const stageDistribution = Array.from(
    opportunities.reduce((map, item) => {
      const stage = String(item.stage ?? 'UNKNOWN');
      map.set(stage, (map.get(stage) ?? 0) + 1);
      return map;
    }, new Map<string, number>())
  ).map(([label, value]) => ({ label, value }));
  const quoteTrend = mapAmountByMonth(recentQuotes.map((quote) => ({ date: quote.date, amount: toNumber(quote.total) })));

  const alerts: DashboardAlertItem[] = [];
  if (overdueCollections > 0) {
    alerts.push({ key: 'collections', title: 'تحصيلات متأخرة', message: `يوجد ${overdueCollections} فاتورة تحتاج متابعة تحصيل.`, severity: 'warning', route: '#/collections' });
  }
  if (quotesExpiring > 0) {
    alerts.push({ key: 'quotes-expiring', title: 'عروض قاربت على الانتهاء', message: `${quotesExpiring} عرض سعر ينتهي خلال أسبوعين.`, severity: 'info', route: '#/sales-quotes' });
  }
  if (opportunities.some((item) => item.expectedCloseDate && item.expectedCloseDate < today && item.status === 'OPEN')) {
    alerts.push({ key: 'stalled-opportunities', title: 'فرص متعثرة', message: 'هناك فرص تجاوزت تاريخ الإغلاق المتوقع وما زالت مفتوحة.', severity: 'warning', route: '#/opportunities' });
  }

  return {
    summary: [
      { key: 'customers', label: 'العملاء النشطون', value: customers, route: '#/customers' },
      { key: 'opportunities', label: 'الفرص المفتوحة', value: opportunities.filter((item) => item.status === 'OPEN').length, route: '#/opportunities' },
      { key: 'pipeline', label: 'قيمة الـ Pipeline', value: Math.round(toNumber(pipelineAgg._sum.value)), route: '#/opportunities' },
      { key: 'quotes', label: 'عروض أسعار مفتوحة', value: quotesPending, route: '#/sales-quotes' },
      { key: 'collections', label: 'تحصيلات متأخرة', value: overdueCollections, tone: overdueCollections > 0 ? 'warning' : 'positive', route: '#/collections' },
      { key: 'win-rate', label: 'معدل الفوز', value: `${winRate}%`, tone: winRate >= 50 ? 'positive' : 'info', route: '#/opportunities' }
    ],
    queues: [
      { key: 'opportunity-queue', label: 'فرص بانتظار المتابعة', count: opportunities.filter((item) => item.status === 'OPEN').length, route: '#/opportunities' },
      { key: 'quote-queue', label: 'عروض تحتاج مراجعة', count: quotesPending, route: '#/sales-quotes' },
      { key: 'ticket-queue', label: 'تذاكر دعم مفتوحة', count: supportTickets, route: '#/support' }
    ],
    activity: [
      ...recentOpportunities.map((row) => ({
        key: `opportunity-${row.id}`,
        title: row.title,
        subtitle: `مرحلة ${row.stage}`,
        date: row.updatedAt.toISOString(),
        status: row.status,
        route: '#/opportunities'
      })),
      ...recentQuotes.map((row) => ({
        key: `quote-${row.id}`,
        title: `عرض ${row.number}`,
        subtitle: `الإجمالي ${Math.round(toNumber(row.total))}`,
        date: row.updatedAt.toISOString(),
        status: row.status,
        route: '#/sales-quotes'
      })),
      ...recentTickets.map((row) => ({
        key: `ticket-${row.id}`,
        title: row.subject,
        subtitle: `تذكرة ${row.number}`,
        date: row.updatedAt.toISOString(),
        status: row.status,
        route: '#/support'
      }))
    ]
      .sort((left, right) => String(right.date ?? '').localeCompare(String(left.date ?? '')))
      .slice(0, 10),
    alerts: alerts.length
      ? alerts
      : overdueInvoices.length
        ? overdueInvoices.map((invoice) => ({
            key: `invoice-${invoice.id}`,
            title: 'مطالبة تحصيل تحتاج متابعة',
            message: `${invoice.customer?.nameAr ?? 'عميل'} على فاتورة ${invoice.number}`,
            severity: 'warning' as const,
            route: '#/collections'
          }))
        : buildEmptyAlerts(),
    charts: [
      { key: 'crm-stage-distribution', title: 'توزيع مراحل الفرص', kind: 'donut', series: stageDistribution.length ? stageDistribution : [{ label: 'لا توجد بيانات', value: 1 }] },
      { key: 'crm-quotes-trend', title: 'قيمة العروض الأخيرة', kind: 'bar', series: quoteTrend.length ? quoteTrend : [{ label: monthKey(today), value: 0 }] }
    ]
  };
}

async function buildHrBundle(filters: DashboardFilters): Promise<SystemDashboardBundle> {
  const branchFilter = filters.branchId ? { branchId: filters.branchId } : {};
  const dateRange = { gte: filters.dateFrom, lte: filters.dateTo };

  const [activeEmployees, pendingLeaves, openPayrollRuns, draftTimesheets, attendanceExceptions, laborCostAgg, recentEmployees, recentLeaves, recentPayrollRuns, recentTimesheets] =
    await Promise.all([
      prisma.employee.count({ where: { ...branchFilter, status: 'ACTIVE' } }),
      prisma.leaveRequest.count({ where: { status: 'PENDING' } }),
      prisma.payrollRun.count({ where: { ...branchFilter, status: { notIn: ['PAID', 'POSTED', 'CLOSED'] } } }),
      prisma.timesheet.count({ where: { ...branchFilter, status: { not: 'APPROVED' } } }),
      prisma.attendance.count({ where: { ...branchFilter, date: dateRange, status: { not: 'PRESENT' } } }),
      prisma.timesheet.aggregate({ where: { ...branchFilter, date: dateRange }, _sum: { amount: true } }),
      prisma.employee.findMany({ where: branchFilter, take: 5, orderBy: { createdAt: 'desc' } }),
      prisma.leaveRequest.findMany({ take: 5, orderBy: { updatedAt: 'desc' } }),
      prisma.payrollRun.findMany({ where: branchFilter, take: 5, orderBy: { updatedAt: 'desc' } }),
      prisma.timesheet.findMany({
        where: { ...branchFilter, date: dateRange },
        take: 5,
        orderBy: [{ date: 'desc' }, { id: 'desc' }],
        include: {
          employee: { select: { fullName: true } },
          project: { select: { nameAr: true } }
        }
      })
    ]);

  const projectCostRows = await prisma.timesheet.findMany({
    where: { ...branchFilter, date: dateRange },
    include: { project: { select: { nameAr: true } } }
  });
  const projectCostSeries = Array.from(
    projectCostRows.reduce((map, row) => {
      map.set(row.project.nameAr, (map.get(row.project.nameAr) ?? 0) + toNumber(row.amount));
      return map;
    }, new Map<string, number>())
  )
    .sort((left, right) => right[1] - left[1])
    .slice(0, 6)
    .map(([label, value]) => ({ label, value: Math.round(value) }));

  const attendanceRows = await prisma.attendance.findMany({ where: { ...branchFilter, date: dateRange } });
  const attendanceStatusSeries = Array.from(
    attendanceRows.reduce((map, row) => {
      map.set(row.status, (map.get(row.status) ?? 0) + 1);
      return map;
    }, new Map<string, number>())
  ).map(([label, value]) => ({ label, value }));

  const alerts: DashboardAlertItem[] = [];
  if (pendingLeaves > 0) alerts.push({ key: 'leave-approvals', title: 'طلبات إجازة معلقة', message: `${pendingLeaves} طلب إجازة بانتظار الاعتماد.`, severity: 'warning', route: '#/leaves' });
  if (draftTimesheets > 0) alerts.push({ key: 'timesheet-approvals', title: 'سجلات وقت غير معتمدة', message: `${draftTimesheets} سجل وقت يحتاج مراجعة أو اعتماد.`, severity: 'info', route: '#/timesheets' });
  if (attendanceExceptions > 0) alerts.push({ key: 'attendance-exceptions', title: 'استثناءات حضور', message: `${attendanceExceptions} حالة حضور غير اعتيادية خلال الفترة المختارة.`, severity: 'warning', route: '#/employees' });

  return {
    summary: [
      { key: 'headcount', label: 'إجمالي الموظفين النشطين', value: activeEmployees, route: '#/employees' },
      { key: 'leave-approvals', label: 'إجازات بانتظار الاعتماد', value: pendingLeaves, tone: pendingLeaves > 0 ? 'warning' : 'positive', route: '#/leaves' },
      { key: 'payroll-cycle', label: 'دورات رواتب مفتوحة', value: openPayrollRuns, route: '#/payroll' },
      { key: 'timesheet-drafts', label: 'سجلات وقت غير معتمدة', value: draftTimesheets, route: '#/timesheets' },
      { key: 'labor-cost', label: 'تكلفة العمالة', value: Math.round(toNumber(laborCostAgg._sum.amount)), route: '#/payroll' },
      { key: 'attendance-exceptions', label: 'استثناءات الحضور', value: attendanceExceptions, route: '#/employees' }
    ],
    queues: [
      { key: 'leave-queue', label: 'طوابير الإجازات', count: pendingLeaves, route: '#/leaves' },
      { key: 'timesheet-queue', label: 'اعتماد سجلات الوقت', count: draftTimesheets, route: '#/timesheets' },
      { key: 'payroll-queue', label: 'معالجة الرواتب', count: openPayrollRuns, route: '#/payroll' }
    ],
    activity: [
      ...recentEmployees.map((row) => ({
        key: `employee-${row.id}`,
        title: row.fullName,
        subtitle: row.position ?? 'موظف',
        date: row.createdAt.toISOString(),
        status: row.status,
        route: '#/employees'
      })),
      ...recentLeaves.map((row) => ({
        key: `leave-${row.id}`,
        title: `طلب إجازة للموظف ${row.employeeId}`,
        subtitle: row.type,
        date: row.updatedAt.toISOString(),
        status: row.status,
        route: '#/leaves'
      })),
      ...recentPayrollRuns.map((row) => ({
        key: `payroll-${row.id}`,
        title: `كشف رواتب ${row.code}`,
        subtitle: `${row.month}/${row.year}`,
        date: row.updatedAt.toISOString(),
        status: row.status,
        route: '#/payroll'
      })),
      ...recentTimesheets.map((row) => ({
        key: `timesheet-${row.id}`,
        title: row.employee.fullName,
        subtitle: row.project.nameAr,
        date: row.date.toISOString(),
        status: row.status,
        route: '#/timesheets'
      }))
    ]
      .sort((left, right) => String(right.date ?? '').localeCompare(String(left.date ?? '')))
      .slice(0, 10),
    alerts: alerts.length ? alerts : buildEmptyAlerts(),
    charts: [
      { key: 'labor-by-project', title: 'تكلفة العمالة حسب المشروع', kind: 'bar', series: projectCostSeries.length ? projectCostSeries : [{ label: 'لا توجد بيانات', value: 0 }] },
      { key: 'attendance-status', title: 'توزيع حالات الحضور', kind: 'donut', series: attendanceStatusSeries.length ? attendanceStatusSeries : [{ label: 'لا توجد بيانات', value: 1 }] }
    ]
  };
}

async function buildProjectsBundle(filters: DashboardFilters): Promise<SystemDashboardBundle> {
  const branchFilter = filters.branchId ? { branchId: filters.branchId } : {};
  const projectFilter = filters.projectId ? { id: filters.projectId } : {};
  const effectiveProjectFilter = { ...branchFilter, ...projectFilter };

  const [projects, tasks, expenses, milestones, recentProjects, recentTasks, recentExpenses] = await Promise.all([
    prisma.project.findMany({ where: effectiveProjectFilter, orderBy: { updatedAt: 'desc' } }),
    prisma.projectTask.findMany({ where: filters.projectId ? { projectId: filters.projectId } : {}, orderBy: { updatedAt: 'desc' } }),
    prisma.projectExpense.findMany({
      where: { ...(filters.projectId ? { projectId: filters.projectId } : {}), date: { gte: filters.dateFrom, lte: filters.dateTo } },
      include: { project: { select: { nameAr: true } } },
      orderBy: { date: 'desc' }
    }),
    prisma.contractMilestone.findMany({ orderBy: [{ dueDate: 'asc' }, { id: 'asc' }] }),
    prisma.project.findMany({ where: effectiveProjectFilter, take: 5, orderBy: { updatedAt: 'desc' } }),
    prisma.projectTask.findMany({ where: filters.projectId ? { projectId: filters.projectId } : {}, take: 5, orderBy: { updatedAt: 'desc' } }),
    prisma.projectExpense.findMany({
      where: { ...(filters.projectId ? { projectId: filters.projectId } : {}), date: { gte: filters.dateFrom, lte: filters.dateTo } },
      include: { project: { select: { nameAr: true } } },
      take: 5,
      orderBy: { date: 'desc' }
    })
  ]);

  const budgetTotal = projects.reduce((sum, row) => sum + toNumber(row.budget), 0);
  const actualCostTotal = projects.reduce((sum, row) => sum + toNumber(row.actualCost), 0);
  const overBudgetProjects = projects.filter((row) => toNumber(row.budget) > 0 && toNumber(row.actualCost) > toNumber(row.budget));
  const pendingMilestones = milestones.filter((row) => row.status !== 'PAID' && row.status !== 'DONE');
  const taskStatusSeries = Array.from(
    tasks.reduce((map, row) => {
      map.set(row.status, (map.get(row.status) ?? 0) + 1);
      return map;
    }, new Map<string, number>())
  ).map(([label, value]) => ({ label, value }));
  const costSeries = projects
    .map((row) => ({ label: row.nameAr, value: Math.round(toNumber(row.actualCost)) }))
    .sort((left, right) => right.value - left.value)
    .slice(0, 6);

  const alerts: DashboardAlertItem[] = [];
  if (overBudgetProjects.length) alerts.push({ key: 'over-budget', title: 'مشاريع تجاوزت الميزانية', message: `يوجد ${overBudgetProjects.length} مشروع تجاوز التكلفة المخططة.`, severity: 'warning', route: '#/projects' });
  if (pendingMilestones.length) alerts.push({ key: 'milestones', title: 'التزامات تعاقدية مفتوحة', message: `${pendingMilestones.length} milestone/claim بحاجة متابعة.`, severity: 'info', route: '#/contracts' });

  return {
    summary: [
      { key: 'active-projects', label: 'المشاريع النشطة', value: projects.filter((row) => row.isActive).length, route: '#/projects' },
      { key: 'project-budget', label: 'إجمالي الميزانيات', value: Math.round(budgetTotal), route: '#/projects' },
      { key: 'actual-cost', label: 'التكلفة الفعلية', value: Math.round(actualCostTotal), route: '#/projects' },
      { key: 'over-budget', label: 'انحرافات الميزانية', value: overBudgetProjects.length, tone: overBudgetProjects.length ? 'warning' : 'positive', route: '#/projects' },
      { key: 'open-tasks', label: 'مهام مفتوحة', value: tasks.filter((row) => row.status !== 'DONE').length, route: '#/projects' },
      { key: 'linked-contracts', label: 'مشاريع مرتبطة بعقود', value: projects.filter((row) => row.contractId).length, route: '#/contracts' }
    ],
    queues: [
      { key: 'task-queue', label: 'طابور المهام', count: tasks.filter((row) => row.status !== 'DONE').length, route: '#/projects' },
      { key: 'milestone-queue', label: 'مستخلصات/مراحل مفتوحة', count: pendingMilestones.length, route: '#/contracts' },
      { key: 'cost-queue', label: 'مصروفات حديثة', count: expenses.length, route: '#/projects' }
    ],
    activity: [
      ...recentProjects.map((row) => ({
        key: `project-${row.id}`,
        title: row.nameAr,
        subtitle: row.code,
        date: row.updatedAt.toISOString(),
        status: row.status,
        route: '#/projects'
      })),
      ...recentTasks.map((row) => ({
        key: `task-${row.id}`,
        title: row.title,
        subtitle: `أولوية ${row.priority}`,
        date: row.updatedAt.toISOString(),
        status: row.status,
        route: '#/projects'
      })),
      ...recentExpenses.map((row) => ({
        key: `expense-${row.id}`,
        title: row.project?.nameAr ?? 'مصروف مشروع',
        subtitle: `${row.category ?? 'EXPENSE'} - ${Math.round(toNumber(row.amount))}`,
        date: row.date.toISOString(),
        status: 'RECORDED',
        route: '#/projects'
      }))
    ]
      .sort((left, right) => String(right.date ?? '').localeCompare(String(left.date ?? '')))
      .slice(0, 10),
    alerts: alerts.length ? alerts : buildEmptyAlerts(),
    charts: [
      { key: 'project-costs', title: 'أعلى المشاريع تكلفة', kind: 'bar', series: costSeries.length ? costSeries : [{ label: 'لا توجد بيانات', value: 0 }] },
      { key: 'task-status', title: 'حالة المهام', kind: 'donut', series: taskStatusSeries.length ? taskStatusSeries : [{ label: 'لا توجد بيانات', value: 1 }] }
    ]
  };
}

async function buildProcurementBundle(filters: DashboardFilters): Promise<SystemDashboardBundle> {
  const branchFilter = filters.branchId ? { branchId: filters.branchId } : {};
  const dateRange = { gte: filters.dateFrom, lte: filters.dateTo };
  const today = new Date();

  const [suppliers, purchaseOrders, receipts, supplierInvoices, pendingSupplierPayments, recentOrders, recentReceipts, recentSupplierInvoices] = await Promise.all([
    prisma.supplier.count({ where: branchFilter }),
    prisma.purchaseOrder.findMany({ where: branchFilter, orderBy: { updatedAt: 'desc' } }),
    prisma.purchaseReceipt.findMany({ where: { date: dateRange }, orderBy: { updatedAt: 'desc' } }),
    prisma.invoice.findMany({
      where: { ...branchFilter, type: 'PURCHASE' },
      include: { supplier: { select: { nameAr: true } } },
      orderBy: { updatedAt: 'desc' }
    }),
    prisma.payment.count({ where: { ...branchFilter, type: 'PAYMENT', status: 'PENDING' } }),
    prisma.purchaseOrder.findMany({ where: branchFilter, take: 5, orderBy: { updatedAt: 'desc' } }),
    prisma.purchaseReceipt.findMany({ where: { date: dateRange }, take: 5, orderBy: { updatedAt: 'desc' } }),
    prisma.invoice.findMany({
      where: { ...branchFilter, type: 'PURCHASE' },
      take: 5,
      include: { supplier: { select: { nameAr: true } } },
      orderBy: { updatedAt: 'desc' }
    })
  ]);

  const openPurchaseOrders = purchaseOrders.filter((row) => !['CLOSED', 'RECEIVED', 'CANCELLED'].includes(String(row.status).toUpperCase()));
  const unmatchedInvoices = supplierInvoices.filter((row) => row.status === 'DRAFT');
  const overdueSupplierInvoices = supplierInvoices.filter((row) => row.dueDate && row.dueDate < today && toNumber(row.outstanding) > 0);
  const spendTotal = supplierInvoices.reduce((sum, row) => sum + toNumber(row.total), 0);
  const poStatusSeries = Array.from(
    purchaseOrders.reduce((map, row) => {
      map.set(row.status, (map.get(row.status) ?? 0) + 1);
      return map;
    }, new Map<string, number>())
  ).map(([label, value]) => ({ label, value }));
  const spendTrend = mapAmountByMonth(supplierInvoices.filter((row) => row.date >= filters.dateFrom && row.date <= filters.dateTo).map((row) => ({ date: row.date, amount: toNumber(row.total) })));

  const alerts: DashboardAlertItem[] = [];
  const delayedOrders = purchaseOrders.filter((row) => row.expectedDate && row.expectedDate < today && !['CLOSED', 'RECEIVED'].includes(String(row.status).toUpperCase()));
  if (delayedOrders.length) alerts.push({ key: 'delayed-orders', title: 'أوامر شراء متأخرة', message: `${delayedOrders.length} أمر شراء تجاوز تاريخ التوريد المتوقع.`, severity: 'warning', route: '#/purchase-orders' });
  if (overdueSupplierInvoices.length) alerts.push({ key: 'overdue-supplier-invoices', title: 'فواتير موردين مستحقة', message: `${overdueSupplierInvoices.length} فاتورة موردين تجاوزت تاريخ الاستحقاق.`, severity: 'warning', route: '#/purchase-invoices' });

  return {
    summary: [
      { key: 'suppliers', label: 'الموردون النشطون', value: suppliers, route: '#/suppliers' },
      { key: 'open-pos', label: 'أوامر شراء مفتوحة', value: openPurchaseOrders.length, route: '#/purchase-orders' },
      { key: 'grn', label: 'استلامات بضائع', value: receipts.length, route: '#/goods-receipts' },
      { key: 'unmatched-invoices', label: 'فواتير تحتاج مطابقة', value: unmatchedInvoices.length, route: '#/purchase-invoices' },
      { key: 'pending-payments', label: 'دفعات موردين معلقة', value: pendingSupplierPayments, route: '#/supplier-payments' },
      { key: 'spend', label: 'إجمالي الإنفاق', value: Math.round(spendTotal), route: '#/purchase-orders' }
    ],
    queues: [
      { key: 'po-queue', label: 'أوامر شراء قيد المتابعة', count: openPurchaseOrders.length, route: '#/purchase-orders' },
      { key: 'receipt-queue', label: 'استلامات قيد الإقفال', count: receipts.filter((row) => String(row.status).toUpperCase() === 'DRAFT').length, route: '#/goods-receipts' },
      { key: 'payment-queue', label: 'استحقاقات الموردين', count: overdueSupplierInvoices.length, route: '#/supplier-payments' }
    ],
    activity: [
      ...recentOrders.map((row) => ({
        key: `po-${row.id}`,
        title: `أمر شراء ${row.number}`,
        subtitle: `الإجمالي ${Math.round(toNumber(row.total))}`,
        date: row.updatedAt.toISOString(),
        status: row.status,
        route: '#/purchase-orders'
      })),
      ...recentReceipts.map((row) => ({
        key: `grn-${row.id}`,
        title: `استلام ${row.number}`,
        subtitle: `المخزن ${row.warehouseId ?? '-'}`,
        date: row.updatedAt.toISOString(),
        status: row.status,
        route: '#/goods-receipts'
      })),
      ...recentSupplierInvoices.map((row) => ({
        key: `pi-${row.id}`,
        title: `فاتورة ${row.number}`,
        subtitle: row.supplier?.nameAr ?? 'مورد',
        date: row.updatedAt.toISOString(),
        status: row.status,
        route: '#/purchase-invoices'
      }))
    ]
      .sort((left, right) => String(right.date ?? '').localeCompare(String(left.date ?? '')))
      .slice(0, 10),
    alerts: alerts.length ? alerts : buildEmptyAlerts(),
    charts: [
      { key: 'po-status', title: 'توزيع حالات أوامر الشراء', kind: 'donut', series: poStatusSeries.length ? poStatusSeries : [{ label: 'لا توجد بيانات', value: 1 }] },
      { key: 'procurement-spend', title: 'اتجاه الإنفاق', kind: 'line', series: spendTrend.length ? spendTrend : [{ label: monthKey(today), value: 0 }] }
    ]
  };
}

async function buildInventoryBundle(filters: DashboardFilters): Promise<SystemDashboardBundle> {
  const branchFilter = filters.branchId ? { branchId: filters.branchId } : {};
  const dateRange = { gte: filters.dateFrom, lte: filters.dateTo };

  const [items, warehouses, stockCounts, movements, recentItems, recentCounts, recentMovements] = await Promise.all([
    prisma.item.findMany({ orderBy: { updatedAt: 'desc' } }),
    prisma.warehouse.findMany({ where: branchFilter, orderBy: { updatedAt: 'desc' } }),
    prisma.stockCount.findMany({ orderBy: { updatedAt: 'desc' } }),
    prisma.stockMovement.findMany({ where: { date: dateRange }, orderBy: { date: 'desc' } }),
    prisma.item.findMany({ take: 5, orderBy: { updatedAt: 'desc' } }),
    prisma.stockCount.findMany({ take: 5, orderBy: { updatedAt: 'desc' } }),
    prisma.stockMovement.findMany({ where: { date: dateRange }, take: 5, orderBy: { date: 'desc' } })
  ]);

  const activeItems = items.filter((row) => row.isActive);
  const underMin = items.filter((row) => toNumber(row.onHandQty) < Math.max(toNumber(row.minStock), toNumber(row.reorderPoint)));
  const inventoryValue = items.reduce((sum, row) => sum + toNumber(row.inventoryValue), 0);
  const movementTypeSeries = Array.from(
    movements.reduce((map, row) => {
      map.set(row.type, (map.get(row.type) ?? 0) + 1);
      return map;
    }, new Map<string, number>())
  ).map(([label, value]) => ({ label, value }));
  const topItems = activeItems
    .map((row) => ({ label: row.nameAr, value: Math.round(toNumber(row.inventoryValue)) }))
    .sort((left, right) => right.value - left.value)
    .slice(0, 6);

  const alerts: DashboardAlertItem[] = [];
  if (underMin.length) alerts.push({ key: 'low-stock', title: 'أصناف تحت الحد الأدنى', message: `${underMin.length} صنف يحتاج إعادة تموين أو نقل مخزني.`, severity: 'warning', route: '#/inventory-items' });
  if (stockCounts.some((row) => String(row.status).toUpperCase() === 'DRAFT')) alerts.push({ key: 'count-drafts', title: 'جرد دوري غير مغلق', message: 'توجد عمليات جرد ما زالت في حالة مسودة.', severity: 'info', route: '#/stock-counts' });

  return {
    summary: [
      { key: 'items', label: 'الأصناف النشطة', value: activeItems.length, route: '#/inventory-items' },
      { key: 'warehouses', label: 'المستودعات', value: warehouses.length, route: '#/warehouses' },
      { key: 'under-min', label: 'أصناف تحت الحد', value: underMin.length, tone: underMin.length ? 'warning' : 'positive', route: '#/inventory-items' },
      { key: 'stock-counts', label: 'عمليات الجرد', value: stockCounts.length, route: '#/stock-counts' },
      { key: 'movements', label: 'حركات المخزون', value: movements.length, route: '#/inventory-movements' },
      { key: 'inventory-value', label: 'قيمة المخزون', value: Math.round(inventoryValue), route: '#/inventory-items' }
    ],
    queues: [
      { key: 'low-stock-queue', label: 'معالجة الأصناف الناقصة', count: underMin.length, route: '#/inventory-items' },
      { key: 'counts-queue', label: 'اعتماد الجرد', count: stockCounts.filter((row) => String(row.status).toUpperCase() === 'DRAFT').length, route: '#/stock-counts' },
      { key: 'movements-queue', label: 'حركات تحتاج مراجعة', count: movements.filter((row) => toNumber(row.quantity) < 0).length, route: '#/inventory-movements' }
    ],
    activity: [
      ...recentItems.map((row) => ({
        key: `item-${row.id}`,
        title: row.nameAr,
        subtitle: row.code,
        date: row.updatedAt.toISOString(),
        status: row.isActive ? 'ACTIVE' : 'INACTIVE',
        route: '#/inventory-items'
      })),
      ...recentCounts.map((row) => ({
        key: `count-${row.id}`,
        title: `جرد ${row.number}`,
        subtitle: `مخزن ${row.warehouseId}`,
        date: row.updatedAt.toISOString(),
        status: row.status,
        route: '#/stock-counts'
      })),
      ...recentMovements.map((row) => ({
        key: `movement-${row.id}`,
        title: `حركة ${row.type}`,
        subtitle: `الصنف ${row.itemId} - الكمية ${Math.round(toNumber(row.quantity))}`,
        date: row.date.toISOString(),
        status: 'POSTED',
        route: '#/inventory-movements'
      }))
    ]
      .sort((left, right) => String(right.date ?? '').localeCompare(String(left.date ?? '')))
      .slice(0, 10),
    alerts: alerts.length ? alerts : buildEmptyAlerts(),
    charts: [
      { key: 'movement-types', title: 'أنواع الحركات', kind: 'donut', series: movementTypeSeries.length ? movementTypeSeries : [{ label: 'لا توجد بيانات', value: 1 }] },
      { key: 'top-items', title: 'أعلى الأصناف قيمة', kind: 'bar', series: topItems.length ? topItems : [{ label: 'لا توجد بيانات', value: 0 }] }
    ]
  };
}

async function buildAssetsBundle(filters: DashboardFilters): Promise<SystemDashboardBundle> {
  const branchFilter = filters.branchId ? { branchId: filters.branchId } : {};

  const [assets, schedules, recentAssets, recentSchedules] = await Promise.all([
    prisma.fixedAsset.findMany({ where: branchFilter, include: { category: { select: { nameAr: true } } }, orderBy: { updatedAt: 'desc' } }),
    prisma.depreciationSchedule.findMany({ orderBy: { createdAt: 'desc' }, include: { asset: { select: { nameAr: true } } } }),
    prisma.fixedAsset.findMany({ where: branchFilter, take: 5, include: { category: { select: { nameAr: true } } }, orderBy: { updatedAt: 'desc' } }),
    prisma.depreciationSchedule.findMany({ take: 5, orderBy: { createdAt: 'desc' }, include: { asset: { select: { nameAr: true } } } })
  ]);

  const activeAssets = assets.filter((row) => row.status === 'ACTIVE');
  const maintenanceAssets = assets.filter((row) => row.status === 'MAINTENANCE');
  const depreciatingAssets = assets.filter((row) => row.isDepreciating);
  const pendingDepreciation = schedules.filter((row) => String(row.status).toUpperCase() === 'PENDING');
  const nbvTotal = assets.reduce((sum, row) => sum + toNumber(row.netBookValue), 0);
  const statusSeries = Array.from(
    assets.reduce((map, row) => {
      map.set(row.status, (map.get(row.status) ?? 0) + 1);
      return map;
    }, new Map<string, number>())
  ).map(([label, value]) => ({ label, value }));
  const categorySeries = Array.from(
    assets.reduce((map, row) => {
      map.set(row.category.nameAr, (map.get(row.category.nameAr) ?? 0) + toNumber(row.netBookValue));
      return map;
    }, new Map<string, number>())
  )
    .sort((left, right) => right[1] - left[1])
    .slice(0, 6)
    .map(([label, value]) => ({ label, value: Math.round(value) }));

  const alerts: DashboardAlertItem[] = [];
  if (maintenanceAssets.length) alerts.push({ key: 'maintenance-assets', title: 'معدات تحت الصيانة', message: `${maintenanceAssets.length} أصل في حالة صيانة ويحتاج متابعة تشغيلية.`, severity: 'warning', route: '#/assets' });
  if (pendingDepreciation.length) alerts.push({ key: 'pending-depreciation', title: 'إهلاك غير مرحل', message: `${pendingDepreciation.length} سجل إهلاك لم يتم ترحيله بعد.`, severity: 'info', route: '#/assets' });

  return {
    summary: [
      { key: 'active-assets', label: 'أصول عاملة', value: activeAssets.length, route: '#/assets' },
      { key: 'maintenance-assets', label: 'أصول في الصيانة', value: maintenanceAssets.length, tone: maintenanceAssets.length ? 'warning' : 'positive', route: '#/assets' },
      { key: 'depreciating-assets', label: 'أصول قابلة للإهلاك', value: depreciatingAssets.length, route: '#/assets' },
      { key: 'nbv', label: 'صافي القيمة الدفترية', value: Math.round(nbvTotal), route: '#/assets' },
      { key: 'pending-depreciation', label: 'إهلاكات معلقة', value: pendingDepreciation.length, route: '#/assets' },
      { key: 'attachments', label: 'أصول بمرفقات', value: assets.filter((row) => row.attachmentsCount > 0).length, route: '#/assets' }
    ],
    queues: [
      { key: 'asset-maintenance', label: 'قائمة الصيانة', count: maintenanceAssets.length, route: '#/assets' },
      { key: 'asset-depreciation', label: 'ترحيل الإهلاك', count: pendingDepreciation.length, route: '#/assets' },
      { key: 'asset-disposal', label: 'استبعاد/بيع', count: assets.filter((row) => ['SOLD', 'SCRAPPED'].includes(row.status)).length, route: '#/assets' }
    ],
    activity: [
      ...recentAssets.map((row) => ({
        key: `asset-${row.id}`,
        title: row.nameAr,
        subtitle: row.category.nameAr,
        date: row.updatedAt.toISOString(),
        status: row.status,
        route: '#/assets'
      })),
      ...recentSchedules.map((row) => ({
        key: `depr-${row.id}`,
        title: row.asset.nameAr,
        subtitle: `فترة ${row.period}/${row.fiscalYear}`,
        date: row.createdAt.toISOString(),
        status: row.status,
        route: '#/assets'
      }))
    ]
      .sort((left, right) => String(right.date ?? '').localeCompare(String(left.date ?? '')))
      .slice(0, 10),
    alerts: alerts.length ? alerts : buildEmptyAlerts(),
    charts: [
      { key: 'asset-status', title: 'حالات الأصول', kind: 'donut', series: statusSeries.length ? statusSeries : [{ label: 'لا توجد بيانات', value: 1 }] },
      { key: 'asset-categories', title: 'القيمة حسب الفئة', kind: 'bar', series: categorySeries.length ? categorySeries : [{ label: 'لا توجد بيانات', value: 0 }] }
    ]
  };
}

async function buildDocumentsBundle(filters: DashboardFilters): Promise<SystemDashboardBundle> {
  const branchFilter = filters.branchId ? { branchId: filters.branchId } : {};
  const todayStart = startOfDay(new Date());

  const [documents, recentDocuments] = await Promise.all([
    prisma.document.findMany({ where: branchFilter, orderBy: { updatedAt: 'desc' } }),
    prisma.document.findMany({ where: branchFilter, take: 8, orderBy: { updatedAt: 'desc' } })
  ]);

  const uploadsToday = documents.filter((row) => row.createdAt >= todayStart).length;
  const activeDocs = documents.filter((row) => row.status === 'ACTIVE');
  const archivedDocs = documents.filter((row) => row.status === 'ARCHIVED');
  const ocrQueue = documents.filter((row) => !row.ocrText && /(pdf|image)/i.test(row.mimeType)).length;
  const restrictedDocs = documents.filter((row) => ['hr', 'contracts', 'finance'].includes(String(row.module).toLowerCase()));
  const moduleSeries = Array.from(
    documents.reduce((map, row) => {
      map.set(row.module, (map.get(row.module) ?? 0) + 1);
      return map;
    }, new Map<string, number>())
  )
    .sort((left, right) => right[1] - left[1])
    .slice(0, 6)
    .map(([label, value]) => ({ label, value }));
  const uploadTrend = mapAmountByMonth(documents.map((row) => ({ date: row.createdAt, amount: 1 })));

  const alerts: DashboardAlertItem[] = [];
  if (ocrQueue) alerts.push({ key: 'ocr-queue', title: 'مستندات بانتظار OCR', message: `${ocrQueue} مستند ما زال بدون فهرسة نصية.`, severity: 'info', route: '#/documents' });
  if (restrictedDocs.length) alerts.push({ key: 'restricted', title: 'مستندات حساسة', message: `${restrictedDocs.length} مستندًا ضمن وحدات عالية الحساسية ويتطلب ضبط وصول دقيق.`, severity: 'warning', route: '#/documents' });

  return {
    summary: [
      { key: 'documents-total', label: 'إجمالي المستندات', value: documents.length, route: '#/documents' },
      { key: 'documents-active', label: 'مستندات نشطة', value: activeDocs.length, route: '#/documents' },
      { key: 'documents-archived', label: 'مستندات مؤرشفة', value: archivedDocs.length, route: '#/documents' },
      { key: 'uploads-today', label: 'تحميلات اليوم', value: uploadsToday, route: '#/documents' },
      { key: 'ocr-queue', label: 'قائمة OCR', value: ocrQueue, route: '#/documents' },
      { key: 'modules-covered', label: 'الوحدات المغطاة', value: new Set(documents.map((row) => row.module)).size, route: '#/documents' }
    ],
    queues: [
      { key: 'ocr', label: 'فهرسة OCR', count: ocrQueue, route: '#/documents' },
      { key: 'archiving', label: 'عناصر بانتظار الأرشفة', count: activeDocs.filter((row) => row.versionNumber > 1).length, route: '#/documents' },
      { key: 'restricted-access', label: 'مراجعات الوصول', count: restrictedDocs.length, route: '#/documents' }
    ],
    activity: recentDocuments.map((row) => ({
      key: `document-${row.id}`,
      title: row.originalName ?? row.fileName,
      subtitle: `${row.module} / ${row.entityType}`,
      date: row.updatedAt.toISOString(),
      status: row.status,
      route: '#/documents'
    })),
    alerts: alerts.length ? alerts : buildEmptyAlerts(),
    charts: [
      { key: 'documents-by-module', title: 'توزيع المستندات حسب الوحدة', kind: 'donut', series: moduleSeries.length ? moduleSeries : [{ label: 'لا توجد بيانات', value: 1 }] },
      { key: 'document-upload-trend', title: 'اتجاه التحميلات', kind: 'line', series: uploadTrend.length ? uploadTrend : [{ label: monthKey(todayStart), value: 0 }] }
    ]
  };
}

async function buildContractsBundle(filters: DashboardFilters): Promise<SystemDashboardBundle> {
  const branchFilter = filters.branchId ? { branchId: filters.branchId } : {};
  const today = new Date();
  const nextThirtyDays = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);

  const [contracts, milestones, recentContracts] = await Promise.all([
    prisma.contract.findMany({ where: branchFilter, orderBy: { updatedAt: 'desc' } }),
    prisma.contractMilestone.findMany({ orderBy: [{ dueDate: 'asc' }, { id: 'asc' }] }),
    prisma.contract.findMany({ where: branchFilter, take: 6, orderBy: { updatedAt: 'desc' } })
  ]);

  const approvedContracts = contracts.filter((row) => row.approvalStatus === 'APPROVED');
  const renewalsDue = contracts.filter((row) => row.endDate && row.endDate >= today && row.endDate <= nextThirtyDays);
  const expiredContracts = contracts.filter((row) => row.endDate && row.endDate < today && row.status !== 'CLOSED');
  const pendingMilestones = milestones.filter((row) => row.status !== 'PAID' && row.status !== 'DONE');
  const commitments = contracts.reduce((sum, row) => sum + toNumber(row.value), 0);
  const statusSeries = Array.from(
    contracts.reduce((map, row) => {
      map.set(row.status, (map.get(row.status) ?? 0) + 1);
      return map;
    }, new Map<string, number>())
  ).map(([label, value]) => ({ label, value }));
  const milestoneSeries = pendingMilestones.filter((row) => row.dueDate).slice(0, 6).map((row) => ({ label: row.title, value: Math.round(toNumber(row.amount)) }));

  const alerts: DashboardAlertItem[] = [];
  if (renewalsDue.length) alerts.push({ key: 'renewals', title: 'عقود على وشك الانتهاء', message: `${renewalsDue.length} عقد يحتاج قرار تجديد أو إقفال.`, severity: 'warning', route: '#/contracts' });
  if (expiredContracts.length) alerts.push({ key: 'expired', title: 'عقود منتهية غير مغلقة', message: `${expiredContracts.length} عقد تجاوز تاريخ الانتهاء وما يزال نشطًا.`, severity: 'danger', route: '#/contracts' });

  return {
    summary: [
      { key: 'contracts-total', label: 'إجمالي العقود', value: contracts.length, route: '#/contracts' },
      { key: 'contracts-approved', label: 'عقود معتمدة', value: approvedContracts.length, route: '#/contracts' },
      { key: 'renewals-due', label: 'تجديدات قريبة', value: renewalsDue.length, tone: renewalsDue.length ? 'warning' : 'positive', route: '#/contracts' },
      { key: 'open-obligations', label: 'التزامات مالية مفتوحة', value: pendingMilestones.length, route: '#/contracts' },
      { key: 'commitments', label: 'قيمة الالتزامات', value: Math.round(commitments), route: '#/contracts' },
      { key: 'attachments', label: 'عقود بمرفقات', value: contracts.filter((row) => row.attachmentsCount > 0).length, route: '#/contracts' }
    ],
    queues: [
      { key: 'contract-approvals', label: 'اعتمادات العقود', count: contracts.filter((row) => row.approvalStatus === 'PENDING').length, route: '#/contracts' },
      { key: 'milestones-queue', label: 'التزامات مستحقة', count: pendingMilestones.length, route: '#/contracts' },
      { key: 'amendments-queue', label: 'عقود مسودة/تعديلات', count: contracts.filter((row) => row.status === 'DRAFT').length, route: '#/contracts' }
    ],
    activity: [
      ...recentContracts.map((row) => ({
        key: `contract-${row.id}`,
        title: row.title,
        subtitle: row.number,
        date: row.updatedAt.toISOString(),
        status: row.status,
        route: '#/contracts'
      })),
      ...pendingMilestones.slice(0, 4).map((row) => ({
        key: `milestone-${row.id}`,
        title: row.title,
        subtitle: `قيمة ${Math.round(toNumber(row.amount))}`,
        date: row.dueDate?.toISOString(),
        status: row.status,
        route: '#/contracts'
      }))
    ]
      .sort((left, right) => String(right.date ?? '').localeCompare(String(left.date ?? '')))
      .slice(0, 10),
    alerts: alerts.length ? alerts : buildEmptyAlerts(),
    charts: [
      { key: 'contract-status', title: 'توزيع حالات العقود', kind: 'donut', series: statusSeries.length ? statusSeries : [{ label: 'لا توجد بيانات', value: 1 }] },
      { key: 'contract-obligations', title: 'التزامات قريبة', kind: 'bar', series: milestoneSeries.length ? milestoneSeries : [{ label: 'لا توجد بيانات', value: 0 }] }
    ]
  };
}

async function buildSubcontractorsBundle(filters: DashboardFilters): Promise<SystemDashboardBundle> {
  const branchFilter = filters.branchId ? { branchId: filters.branchId } : {};
  const today = new Date();

  const [subcontracts, ipcs] = await Promise.all([
    prisma.subcontract.findMany({
      where: branchFilter,
      include: {
        supplier: { select: { nameAr: true } },
        project: { select: { nameAr: true } }
      },
      orderBy: { updatedAt: 'desc' }
    }),
    prisma.subcontractIpc.findMany({
      where: {
        ...(filters.projectId ? { subcontract: { is: { projectId: filters.projectId } } } : {})
      },
      include: {
        subcontract: {
          include: {
            supplier: { select: { nameAr: true } },
            project: { select: { nameAr: true } }
          }
        },
        payableInvoice: {
          include: {
            payments: {
              include: {
                payment: {
                  select: {
                    id: true,
                    number: true,
                    amount: true,
                    status: true,
                    date: true
                  }
                }
              }
            }
          }
        }
      },
      orderBy: [{ certificateDate: 'desc' }, { id: 'desc' }]
    })
  ]);

  const relevantIpcs = ipcs.filter((row: any) => !filters.branchId || row.subcontract.branchId === filters.branchId);
  const activeContracts = subcontracts.filter((row: any) => row.status === 'ACTIVE');
  const pendingIpcs = relevantIpcs.filter((row: any) => row.approvalStatus === 'PENDING');
  const certifiedIpcs = relevantIpcs.filter((row: any) => row.approvalStatus === 'APPROVED');
  const paymentQueue = relevantIpcs.filter((row: any) => Number(row.payableInvoice?.outstanding ?? 0) > 0.01);
  const overduePayables = paymentQueue.filter((row: any) => row.payableInvoice?.dueDate && row.payableInvoice.dueDate < today);
  const retentionExposure = certifiedIpcs.reduce((sum: number, row: any) => sum + Number(row.retentionAmount ?? 0), 0);
  const certifiedValue = certifiedIpcs.reduce((sum: number, row: any) => sum + Number(row.certifiedAmount ?? 0), 0);
  const paidValue = relevantIpcs.reduce((sum: number, row: any) => sum + Number(row.payableInvoice?.paidAmount ?? 0), 0);
  const performanceFlags = subcontracts.filter((row: any) => row.performanceRating !== null && Number(row.performanceRating ?? 0) <= 2);

  const alerts: DashboardAlertItem[] = [];
  if (pendingIpcs.length) {
    alerts.push({
      key: 'subcontract-ipc-pending',
      title: 'مستخلصات بانتظار الاعتماد',
      message: `هناك ${pendingIpcs.length} مستخلص يحتاج اعتمادًا وتحويلًا إلى ذمة.`,
      severity: 'warning',
      route: '#/systems/subcontractors/contracts'
    });
  }
  if (overduePayables.length) {
    alerts.push({
      key: 'subcontract-overdue-payables',
      title: 'ذمم مقاولي باطن متأخرة',
      message: `${overduePayables.length} مستخلص معتمد لم يسدد في الموعد المتوقع.`,
      severity: 'danger',
      route: '#/systems/subcontractors/payments'
    });
  }
  if (performanceFlags.length) {
    alerts.push({
      key: 'subcontract-performance',
      title: 'مقاولون بحاجة متابعة أداء',
      message: `${performanceFlags.length} عقد يحمل تقييم أداء منخفض ويستحق المراجعة.`,
      severity: 'info',
      route: '#/systems/subcontractors/contracts'
    });
  }

  const statusSeries = (Array.from(
    subcontracts.reduce((map: Map<string, number>, row: any) => {
      map.set(row.status, (map.get(row.status) ?? 0) + 1);
      return map;
    }, new Map<string, number>())
  ) as Array<[string, number]>).map(([label, value]) => ({ label, value }));

  const ipcSeries = (Array.from(
    relevantIpcs.reduce((map: Map<string, number>, row: any) => {
      map.set(row.status, (map.get(row.status) ?? 0) + 1);
      return map;
    }, new Map<string, number>())
  ) as Array<[string, number]>).map(([label, value]) => ({ label, value }));

  return {
    summary: [
      { key: 'subcontracts-total', label: 'إجمالي عقود الباطن', value: subcontracts.length, route: '#/systems/subcontractors/contracts' },
      { key: 'subcontracts-active', label: 'عقود فعالة', value: activeContracts.length, route: '#/systems/subcontractors/contracts' },
      { key: 'subcontracts-certified', label: 'قيمة الأعمال المعتمدة', value: Math.round(certifiedValue), route: '#/systems/subcontractors/payments' },
      { key: 'subcontracts-paid', label: 'المدفوع للمقاولين', value: Math.round(paidValue), route: '#/systems/subcontractors/payments' },
      { key: 'subcontracts-retention', label: 'احتجازات قائمة', value: Math.round(retentionExposure), route: '#/systems/subcontractors/payments' },
      { key: 'subcontracts-payment-queue', label: 'دفعات قيد المتابعة', value: paymentQueue.length, tone: paymentQueue.length ? 'warning' : 'positive', route: '#/systems/subcontractors/payments' }
    ],
    queues: [
      { key: 'subcontracts-approvals', label: 'مستخلصات بانتظار الاعتماد', count: pendingIpcs.length, route: '#/systems/subcontractors/contracts' },
      { key: 'subcontracts-payables', label: 'ذمم قيد السداد', count: paymentQueue.length, route: '#/systems/subcontractors/payments' },
      { key: 'subcontracts-flags', label: 'تقييمات أداء منخفضة', count: performanceFlags.length, route: '#/systems/subcontractors/contracts' }
    ],
    activity: [
      ...subcontracts.slice(0, 5).map((row: any) => ({
        key: `subcontract-${row.id}`,
        title: row.title,
        subtitle: `${row.number} / ${row.supplier?.nameAr ?? row.project?.nameAr ?? 'بدون ربط'}`,
        date: row.updatedAt.toISOString(),
        status: row.status,
        route: '#/systems/subcontractors/contracts'
      })),
      ...relevantIpcs.slice(0, 5).map((row: any) => ({
        key: `subcontract-ipc-${row.id}`,
        title: row.number,
        subtitle: `${row.subcontract.title} / صافي ${Math.round(toNumber(row.netAmount))}`,
        date: row.updatedAt.toISOString(),
        status: row.status,
        route: '#/systems/subcontractors/payments'
      }))
    ]
      .sort((left, right) => String(right.date ?? '').localeCompare(String(left.date ?? '')))
      .slice(0, 10),
    alerts: alerts.length ? alerts : buildEmptyAlerts(),
    charts: [
      { key: 'subcontracts-status', title: 'توزيع حالات العقود', kind: 'donut', series: statusSeries.length ? statusSeries : [{ label: 'لا توجد بيانات', value: 1 }] },
      { key: 'subcontracts-ipc-status', title: 'توزيع حالات المستخلصات', kind: 'bar', series: ipcSeries.length ? ipcSeries : [{ label: 'لا توجد بيانات', value: 0 }] }
    ]
  };
}

async function buildTenderingBundle(filters: DashboardFilters): Promise<SystemDashboardBundle> {
  const branchFilter = filters.branchId ? { branchId: filters.branchId } : {};
  const today = new Date();
  const nextFourteenDays = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000);

  const [tenders, recentTenders] = await Promise.all([
    prisma.tender.findMany({
      where: branchFilter,
      include: {
        customer: { select: { nameAr: true } },
        opportunity: { select: { title: true } },
        estimateLines: true,
        competitors: true
      },
      orderBy: { updatedAt: 'desc' }
    }),
    prisma.tender.findMany({
      where: branchFilter,
      take: 6,
      include: {
        customer: { select: { nameAr: true } },
        opportunity: { select: { title: true } }
      },
      orderBy: { updatedAt: 'desc' }
    })
  ]);

  const drafts = tenders.filter((row) => row.status === 'DRAFT');
  const submitted = tenders.filter((row) => row.status === 'SUBMITTED');
  const won = tenders.filter((row) => row.result === 'WON' || row.status === 'WON');
  const lost = tenders.filter((row) => row.result === 'LOST' || row.status === 'LOST');
  const cancelled = tenders.filter((row) => row.result === 'CANCELLED' || row.status === 'CANCELLED');
  const dueSoon = tenders.filter((row) => row.bidDueDate && row.bidDueDate >= today && row.bidDueDate <= nextFourteenDays && !row.result);
  const totalEstimated = tenders.reduce((sum, row) => sum + toNumber(row.estimatedValue), 0);
  const totalOffered = tenders.reduce((sum, row) => sum + toNumber(row.offeredValue), 0);
  const resultedCount = won.length + lost.length + cancelled.length;
  const winRate = resultedCount ? Math.round((won.length / resultedCount) * 100) : 0;

  const alerts: DashboardAlertItem[] = [];
  if (dueSoon.length) {
    alerts.push({
      key: 'tenders-due',
      title: 'عطاءات تقترب من موعد الإغلاق',
      message: `${dueSoon.length} عطاء يحتاج إنهاء التسعير أو الإرسال خلال 14 يومًا.`,
      severity: 'warning',
      route: '#/systems/tendering/tenders'
    });
  }
  if (submitted.length) {
    alerts.push({
      key: 'results-pending',
      title: 'عطاءات مرسلة بانتظار النتيجة',
      message: `هناك ${submitted.length} عطاء مرسل يحتاج تحديث النتيجة أو قرار المتابعة.`,
      severity: 'info',
      route: '#/systems/tendering/tenders'
    });
  }
  if (!won.length && resultedCount > 0) {
    alerts.push({
      key: 'win-rate-low',
      title: 'لا توجد ترسية رابحة حديثًا',
      message: 'راجع استراتيجية التسعير والمنافسين في آخر العطاءات المغلقة.',
      severity: 'warning',
      route: '#/systems/tendering/analysis'
    });
  }

  const statusSeries = Array.from(
    tenders.reduce((map, row) => {
      const label = row.result ?? row.status;
      map.set(label, (map.get(label) ?? 0) + 1);
      return map;
    }, new Map<string, number>())
  ).map(([label, value]) => ({ label, value }));

  const recentValueSeries = recentTenders
    .slice()
    .reverse()
    .map((row) => ({
      label: row.number,
      value: Math.round(toNumber(row.offeredValue))
    }));

  return {
    summary: [
      { key: 'tenders-total', label: 'إجمالي العطاءات', value: tenders.length, route: '#/systems/tendering/tenders' },
      { key: 'tenders-drafts', label: 'مسودات التسعير', value: drafts.length, tone: drafts.length ? 'warning' : 'positive', route: '#/systems/tendering/tenders' },
      { key: 'tenders-submitted', label: 'عطاءات مرسلة', value: submitted.length, route: '#/systems/tendering/tenders' },
      { key: 'tenders-offered', label: 'القيمة المقدمة', value: Math.round(totalOffered), route: '#/systems/tendering/analysis' },
      { key: 'tenders-estimated', label: 'القيمة التقديرية', value: Math.round(totalEstimated), route: '#/systems/tendering/analysis' },
      { key: 'tenders-win-rate', label: 'معدل الفوز', value: `${winRate}%`, tone: winRate >= 40 ? 'positive' : 'info', route: '#/systems/tendering/analysis' }
    ],
    queues: [
      { key: 'tenders-pricing', label: 'عطاءات قيد التسعير', count: drafts.length, route: '#/systems/tendering/tenders' },
      { key: 'tenders-results', label: 'نتائج بانتظار التسجيل', count: submitted.length, route: '#/systems/tendering/tenders' },
      { key: 'tenders-due-soon', label: 'عطاءات قريبة الإغلاق', count: dueSoon.length, route: '#/systems/tendering/tenders' }
    ],
    activity: recentTenders.map((row) => ({
      key: `tender-${row.id}`,
      title: row.title,
      subtitle: `${row.number} / ${row.customer?.nameAr ?? row.opportunity?.title ?? 'بدون جهة مرتبطة'}`,
      date: row.updatedAt.toISOString(),
      status: row.result ?? row.status,
      route: '#/systems/tendering/tenders'
    })),
    alerts: alerts.length ? alerts : buildEmptyAlerts(),
    charts: [
      { key: 'tendering-status', title: 'توزيع الحالات والنتائج', kind: 'donut', series: statusSeries.length ? statusSeries : [{ label: 'لا توجد بيانات', value: 1 }] },
      { key: 'tendering-values', title: 'قيمة آخر العطاءات', kind: 'bar', series: recentValueSeries.length ? recentValueSeries : [{ label: 'لا توجد بيانات', value: 0 }] }
    ]
  };
}

async function buildSiteOpsBundle(filters: DashboardFilters): Promise<SystemDashboardBundle> {
  const branchFilter = filters.branchId ? { branchId: filters.branchId } : {};
  const projectFilter = filters.projectId ? { projectId: filters.projectId } : {};
  const scopedWhere = { ...branchFilter, ...projectFilter };
  const dateRange = { gte: filters.dateFrom, lte: filters.dateTo };
  const now = new Date();

  const [
    dailyLogsCount,
    dailyPendingApproval,
    materialRequestsOpen,
    materialPendingApproval,
    blockedMaterialRequests,
    openIssues,
    criticalIssues,
    attendanceRecords,
    attendancePendingApproval,
    progressAvg,
    materialIssuedAgg,
    issueSiteCostAgg
  ] = await Promise.all([
    prisma.siteDailyLog.count({ where: { ...scopedWhere, logDate: dateRange } }),
    prisma.siteDailyLog.count({
      where: {
        ...scopedWhere,
        logDate: dateRange,
        approvalStatus: 'PENDING'
      }
    }),
    prisma.siteMaterialRequest.count({
      where: {
        ...scopedWhere,
        requestDate: dateRange,
        status: { in: ['DRAFT', 'SUBMITTED', 'APPROVED', 'PARTIAL'] }
      }
    }),
    prisma.siteMaterialRequest.count({
      where: {
        ...scopedWhere,
        requestDate: dateRange,
        approvalStatus: 'PENDING'
      }
    }),
    prisma.siteMaterialRequest.count({
      where: {
        ...scopedWhere,
        status: { in: ['SUBMITTED', 'APPROVED'] },
        requiredBy: { lt: now }
      }
    }),
    prisma.siteIssue.count({
      where: {
        ...scopedWhere,
        issueDate: dateRange,
        status: { not: 'RESOLVED' }
      }
    }),
    prisma.siteIssue.count({
      where: {
        ...scopedWhere,
        issueDate: dateRange,
        status: { not: 'RESOLVED' },
        severity: { in: ['HIGH', 'CRITICAL'] }
      }
    }),
    prisma.siteAttendance.count({ where: { ...scopedWhere, date: dateRange } }),
    prisma.siteAttendance.count({
      where: {
        ...scopedWhere,
        date: dateRange,
        approvalStatus: { not: 'APPROVED' }
      }
    }),
    prisma.siteProgress.aggregate({
      where: { ...scopedWhere, reportDate: dateRange },
      _avg: {
        plannedPercent: true,
        actualPercent: true
      }
    }),
    prisma.siteMaterialRequest.aggregate({
      where: { ...scopedWhere, requestDate: dateRange },
      _sum: { issuedQuantity: true }
    }),
    prisma.stockMovement.aggregate({
      where: {
        type: 'ISSUE_SITE',
        date: dateRange,
        ...(filters.projectId ? { reference: { contains: String(filters.projectId), mode: 'insensitive' } } : {})
      },
      _sum: { totalCost: true }
    })
  ]);

  const [recentDailyLogs, recentMaterials, recentIssues, progressRows, materialRows, attendanceRows] = await Promise.all([
    prisma.siteDailyLog.findMany({
      where: scopedWhere,
      include: { project: { select: { nameAr: true } } },
      take: 5,
      orderBy: [{ logDate: 'desc' }, { id: 'desc' }]
    }),
    prisma.siteMaterialRequest.findMany({
      where: scopedWhere,
      include: {
        project: { select: { nameAr: true } },
        item: { select: { nameAr: true } }
      },
      take: 5,
      orderBy: [{ requestDate: 'desc' }, { id: 'desc' }]
    }),
    prisma.siteIssue.findMany({
      where: scopedWhere,
      include: { project: { select: { nameAr: true } } },
      take: 5,
      orderBy: [{ issueDate: 'desc' }, { id: 'desc' }]
    }),
    prisma.siteProgress.findMany({
      where: { ...scopedWhere, reportDate: dateRange },
      orderBy: { reportDate: 'asc' },
      select: { reportDate: true, plannedPercent: true, actualPercent: true }
    }),
    prisma.siteMaterialRequest.findMany({
      where: { ...scopedWhere, requestDate: dateRange },
      select: { status: true }
    }),
    prisma.siteAttendance.findMany({
      where: { ...scopedWhere, date: dateRange },
      select: { status: true }
    })
  ]);

  const alerts: DashboardAlertItem[] = [];
  if (blockedMaterialRequests > 0) {
    alerts.push({
      key: 'site-ops-blocked-materials',
      title: 'طلبات مواد متأخرة',
      message: `${blockedMaterialRequests} طلب مواد تجاوز تاريخ الحاجة ويحتاج تدخلًا فوريًا.`,
      severity: 'warning',
      route: '#/systems/site-ops/materials'
    });
  }
  if (criticalIssues > 0) {
    alerts.push({
      key: 'site-ops-critical-issues',
      title: 'مشاكل ميدانية حرجة',
      message: `يوجد ${criticalIssues} مشكلة عالية/حرجة غير محلولة في المواقع.`,
      severity: 'danger',
      route: '#/systems/site-ops/issues'
    });
  }
  if (attendancePendingApproval > 0) {
    alerts.push({
      key: 'site-ops-attendance-pending',
      title: 'حضور ميداني غير معتمد',
      message: `${attendancePendingApproval} سجل حضور يحتاج اعتماد قبل إقفال اليوم.`,
      severity: 'info',
      route: '#/systems/site-ops/attendance'
    });
  }

  const statusSeries = Array.from(
    materialRows.reduce((map, row) => {
      const label = String(row.status ?? 'UNKNOWN');
      map.set(label, (map.get(label) ?? 0) + 1);
      return map;
    }, new Map<string, number>())
  ).map(([label, value]) => ({ label, value }));

  const attendanceSeries = Array.from(
    attendanceRows.reduce((map, row) => {
      const label = String(row.status ?? 'UNKNOWN');
      map.set(label, (map.get(label) ?? 0) + 1);
      return map;
    }, new Map<string, number>())
  ).map(([label, value]) => ({ label, value }));

  const plannedSeries = mapAmountByMonth(progressRows.map((row) => ({ date: row.reportDate, amount: toNumber(row.plannedPercent) })));
  const actualSeries = mapAmountByMonth(progressRows.map((row) => ({ date: row.reportDate, amount: toNumber(row.actualPercent) })));

  return {
    summary: [
      { key: 'site-daily-logs', label: 'اليوميات الميدانية', value: dailyLogsCount, route: '#/systems/site-ops/daily' },
      { key: 'site-material-open', label: 'طلبات المواد المفتوحة', value: materialRequestsOpen, tone: materialRequestsOpen > 0 ? 'warning' : 'positive', route: '#/systems/site-ops/materials' },
      { key: 'site-issues-open', label: 'المشاكل المفتوحة', value: openIssues, tone: openIssues > 0 ? 'warning' : 'positive', route: '#/systems/site-ops/issues' },
      { key: 'site-attendance', label: 'سجلات الحضور', value: attendanceRecords, route: '#/systems/site-ops/attendance' },
      { key: 'site-issued-qty', label: 'كمية مواد مصروفة', value: Math.round(toNumber(materialIssuedAgg._sum.issuedQuantity)), route: '#/systems/site-ops/materials' },
      { key: 'site-cost-impact', label: 'أثر تكلفة المواد', value: Math.round(toNumber(issueSiteCostAgg._sum.totalCost)), route: '#/systems/site-ops/materials' }
    ],
    queues: [
      { key: 'site-queue-daily', label: 'يوميات بانتظار الاعتماد', count: dailyPendingApproval, route: '#/systems/site-ops/daily' },
      { key: 'site-queue-material', label: 'طلبات مواد قيد القرار', count: materialPendingApproval, route: '#/systems/site-ops/materials' },
      { key: 'site-queue-issues', label: 'مشاكل ميدانية مفتوحة', count: openIssues, route: '#/systems/site-ops/issues' },
      { key: 'site-queue-attendance', label: 'حضور غير معتمد', count: attendancePendingApproval, route: '#/systems/site-ops/attendance' }
    ],
    activity: [
      ...recentDailyLogs.map((row) => ({
        key: `site-daily-${row.id}`,
        title: `يومية ${row.number}`,
        subtitle: row.project?.nameAr ?? 'بدون مشروع',
        date: row.logDate.toISOString(),
        status: row.status,
        route: '#/systems/site-ops/daily'
      })),
      ...recentMaterials.map((row) => ({
        key: `site-material-${row.id}`,
        title: `طلب مواد ${row.number}`,
        subtitle: `${row.item?.nameAr ?? 'بدون صنف'} / ${row.project?.nameAr ?? 'بدون مشروع'}`,
        date: row.requestDate.toISOString(),
        status: row.status,
        route: '#/systems/site-ops/materials'
      })),
      ...recentIssues.map((row) => ({
        key: `site-issue-${row.id}`,
        title: row.title,
        subtitle: row.project?.nameAr ?? 'بدون مشروع',
        date: row.issueDate.toISOString(),
        status: row.status,
        route: '#/systems/site-ops/issues'
      }))
    ]
      .sort((left, right) => String(right.date ?? '').localeCompare(String(left.date ?? '')))
      .slice(0, 12),
    alerts: alerts.length ? alerts : buildEmptyAlerts(),
    charts: [
      { key: 'site-progress-planned', title: 'الخطة الشهرية %', kind: 'line', series: plannedSeries.length ? plannedSeries : [{ label: monthKey(now), value: 0 }] },
      { key: 'site-progress-actual', title: 'الإنجاز الفعلي %', kind: 'bar', series: actualSeries.length ? actualSeries : [{ label: monthKey(now), value: 0 }] },
      { key: 'site-material-status', title: 'توزيع حالة طلبات المواد', kind: 'donut', series: statusSeries.length ? statusSeries : [{ label: 'لا توجد بيانات', value: 1 }] },
      { key: 'site-attendance-status', title: 'توزيع حالات الحضور', kind: 'donut', series: attendanceSeries.length ? attendanceSeries : [{ label: 'لا توجد بيانات', value: 1 }] },
      {
        key: 'site-progress-gap',
        title: 'فجوة الأداء (خطة/فعلي)',
        kind: 'bar',
        series: [
          { label: 'متوسط الخطة', value: Math.round(toNumber(progressAvg._avg.plannedPercent)) },
          { label: 'متوسط الفعلي', value: Math.round(toNumber(progressAvg._avg.actualPercent)) }
        ]
      }
    ]
  };
}

async function buildPrintingBundle(filters: DashboardFilters): Promise<SystemDashboardBundle> {
  const branchFilter = filters.branchId ? { branchId: filters.branchId } : {};
  const dateRange = { gte: filters.dateFrom, lte: filters.dateTo };
  const now = new Date();

  const [activeTemplates, inactiveTemplates, queuedPrintJobs, failedPrintJobs, queuedExports, failedExports, queuedConversions, failedConversions, auditCount, recentTemplates, recentPrintJobs, recentExportJobs, recentConversionJobs, printStatusRows, exportStatusRows, conversionStatusRows, printFormatRows, exportFormatRows] =
    await Promise.all([
      prisma.printTemplate.count({ where: { ...branchFilter, status: 'ACTIVE' } }),
      prisma.printTemplate.count({ where: { ...branchFilter, status: 'INACTIVE' } }),
      prisma.printJob.count({ where: { ...branchFilter, status: { in: ['QUEUED', 'RUNNING'] } } }),
      prisma.printJob.count({ where: { ...branchFilter, status: 'FAILED' } }),
      prisma.exportJob.count({ where: { ...branchFilter, status: { in: ['QUEUED', 'RUNNING'] } } }),
      prisma.exportJob.count({ where: { ...branchFilter, status: 'FAILED' } }),
      prisma.conversionJob.count({ where: { ...branchFilter, status: { in: ['QUEUED', 'RUNNING'] } } }),
      prisma.conversionJob.count({ where: { ...branchFilter, status: 'FAILED' } }),
      prisma.printAudit.count({ where: { ...branchFilter, createdAt: dateRange } }),
      prisma.printTemplate.findMany({
        where: branchFilter,
        take: 4,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        select: { id: true, key: true, title: true, status: true, defaultFormat: true, updatedAt: true }
      }),
      prisma.printJob.findMany({
        where: { ...branchFilter, requestedAt: dateRange },
        take: 5,
        orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }],
        include: {
          template: { select: { title: true } }
        }
      }),
      prisma.exportJob.findMany({
        where: { ...branchFilter, requestedAt: dateRange },
        take: 4,
        orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }]
      }),
      prisma.conversionJob.findMany({
        where: { ...branchFilter, requestedAt: dateRange },
        take: 4,
        orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }]
      }),
      prisma.printJob.findMany({
        where: { ...branchFilter, requestedAt: dateRange },
        select: { status: true, requestedAt: true, outputFormat: true }
      }),
      prisma.exportJob.findMany({
        where: { ...branchFilter, requestedAt: dateRange },
        select: { status: true, requestedAt: true, outputFormat: true }
      }),
      prisma.conversionJob.findMany({
        where: { ...branchFilter, requestedAt: dateRange },
        select: { status: true, requestedAt: true, sourceFormat: true, targetFormat: true }
      }),
      prisma.printJob.findMany({
        where: { ...branchFilter, requestedAt: dateRange },
        select: { outputFormat: true, requestedAt: true }
      }),
      prisma.exportJob.findMany({
        where: { ...branchFilter, requestedAt: dateRange },
        select: { outputFormat: true, requestedAt: true }
      })
    ]);

  const alerts: DashboardAlertItem[] = [];
  const failedTotal = failedPrintJobs + failedExports + failedConversions;
  if (failedTotal > 0) {
    alerts.push({
      key: 'printing-failures',
      title: 'مهام فاشلة تحتاج إعادة معالجة',
      message: `يوجد ${failedTotal} مهمة فاشلة بين الطباعة والتصدير والتحويل.`,
      severity: 'warning',
      route: '#/systems/printing/jobs'
    });
  }
  if (inactiveTemplates > 0) {
    alerts.push({
      key: 'inactive-templates',
      title: 'قوالب غير نشطة',
      message: `${inactiveTemplates} قالب غير نشط وقد يؤثر على الإصدارات التلقائية.`,
      severity: 'info',
      route: '#/systems/printing/templates'
    });
  }
  if (queuedPrintJobs + queuedExports + queuedConversions > 40) {
    alerts.push({
      key: 'queue-pressure',
      title: 'ضغط مرتفع على طابور الإخراج',
      message: 'عدد المهام في الطوابير تجاوز الحد المرجعي ويحتاج موازنة تشغيلية.',
      severity: 'warning',
      route: '#/systems/printing/jobs'
    });
  }

  const statusSeries = Array.from(
    [...printStatusRows, ...exportStatusRows, ...conversionStatusRows].reduce((map, row) => {
      const label = String(row.status ?? 'UNKNOWN');
      map.set(label, (map.get(label) ?? 0) + 1);
      return map;
    }, new Map<string, number>())
  ).map(([label, value]) => ({ label, value }));

  const formatSeries = Array.from(
    [...printFormatRows.map((row) => row.outputFormat), ...exportFormatRows.map((row) => row.outputFormat), ...conversionStatusRows.map((row) => row.targetFormat)].reduce((map, format) => {
      const label = String(format ?? 'UNKNOWN').toUpperCase();
      map.set(label, (map.get(label) ?? 0) + 1);
      return map;
    }, new Map<string, number>())
  ).map(([label, value]) => ({ label, value }));

  const volumeSeries = mapAmountByMonth(
    [...printStatusRows, ...exportStatusRows, ...conversionStatusRows].map((row) => ({
      date: row.requestedAt,
      amount: 1
    }))
  );

  return {
    summary: [
      { key: 'printing-templates-active', label: 'قوالب نشطة', value: activeTemplates, route: '#/systems/printing/templates' },
      { key: 'printing-templates-inactive', label: 'قوالب غير نشطة', value: inactiveTemplates, tone: inactiveTemplates > 0 ? 'warning' : 'positive', route: '#/systems/printing/templates' },
      { key: 'printing-queue', label: 'مهام طباعة قيد التنفيذ', value: queuedPrintJobs, route: '#/systems/printing/jobs' },
      { key: 'printing-exports', label: 'مهام تصدير قيد التنفيذ', value: queuedExports, route: '#/systems/printing/jobs' },
      { key: 'printing-conversions', label: 'مهام تحويل قيد التنفيذ', value: queuedConversions, route: '#/systems/printing/jobs' },
      { key: 'printing-audit', label: 'سجل تدقيق الفترة', value: auditCount, route: '#/systems/printing/archive' }
    ],
    queues: [
      { key: 'printing-queue-print', label: 'طابور الطباعة', count: queuedPrintJobs, tone: queuedPrintJobs > 20 ? 'warning' : 'neutral', route: '#/systems/printing/jobs' },
      { key: 'printing-queue-export', label: 'طابور التصدير', count: queuedExports, tone: queuedExports > 20 ? 'warning' : 'neutral', route: '#/systems/printing/jobs' },
      { key: 'printing-queue-conversion', label: 'طابور التحويل', count: queuedConversions, tone: queuedConversions > 20 ? 'warning' : 'neutral', route: '#/systems/printing/jobs' },
      { key: 'printing-queue-failed', label: 'مهام فاشلة', count: failedTotal, tone: failedTotal > 0 ? 'danger' : 'positive', route: '#/systems/printing/jobs' }
    ],
    activity: [
      ...recentTemplates.map((row) => ({
        key: `printing-template-${row.id}`,
        title: `قالب ${row.key}`,
        subtitle: `${row.title} • ${row.defaultFormat}`,
        date: row.updatedAt.toISOString(),
        status: row.status,
        route: '#/systems/printing/templates'
      })),
      ...recentPrintJobs.map((row) => ({
        key: `printing-job-${row.id}`,
        title: `طباعة ${row.number}`,
        subtitle: `${row.template?.title ?? row.entityType} • ${row.outputFormat}`,
        date: row.requestedAt.toISOString(),
        status: row.status,
        route: '#/systems/printing/jobs'
      })),
      ...recentExportJobs.map((row) => ({
        key: `export-job-${row.id}`,
        title: `تصدير ${row.number}`,
        subtitle: `${row.sourceType} • ${row.outputFormat}`,
        date: row.requestedAt.toISOString(),
        status: row.status,
        route: '#/systems/printing/jobs'
      })),
      ...recentConversionJobs.map((row) => ({
        key: `conversion-job-${row.id}`,
        title: `تحويل ${row.number}`,
        subtitle: `${row.sourceFormat} -> ${row.targetFormat}`,
        date: row.requestedAt.toISOString(),
        status: row.status,
        route: '#/systems/printing/jobs'
      }))
    ]
      .sort((left, right) => String(right.date ?? '').localeCompare(String(left.date ?? '')))
      .slice(0, 12),
    alerts: alerts.length ? alerts : buildEmptyAlerts(),
    charts: [
      { key: 'printing-volume', title: 'حجم المهام الشهري', kind: 'line', series: volumeSeries.length ? volumeSeries : [{ label: monthKey(now), value: 0 }] },
      { key: 'printing-status-distribution', title: 'توزيع حالات التنفيذ', kind: 'donut', series: statusSeries.length ? statusSeries : [{ label: 'لا توجد بيانات', value: 1 }] },
      { key: 'printing-format-distribution', title: 'توزيع صيغ الإخراج', kind: 'bar', series: formatSeries.length ? formatSeries : [{ label: 'لا توجد بيانات', value: 0 }] }
    ]
  };
}

async function buildBudgetingBundle(filters: DashboardFilters): Promise<SystemDashboardBundle> {
  const scenarioWhere: any = {};
  if (filters.branchId) scenarioWhere.branchId = filters.branchId;
  if (filters.dateFrom || filters.dateTo) {
    scenarioWhere.createdAt = { gte: filters.dateFrom, lte: filters.dateTo };
  }

  const versionWhere: any = {};
  if (filters.branchId) {
    versionWhere.scenario = { is: { branchId: filters.branchId } };
  }

  const allocationWhere: any = {};
  if (filters.branchId) allocationWhere.branchId = filters.branchId;
  if (filters.projectId) allocationWhere.projectId = filters.projectId;

  const forecastWhere: any = {};
  if (filters.branchId) forecastWhere.branchId = filters.branchId;

  const varianceWhere: any = {};
  if (filters.branchId) varianceWhere.branchId = filters.branchId;
  if (filters.projectId) varianceWhere.projectId = filters.projectId;

  const [scenarios, versions, allocations, forecasts, variances] = await Promise.all([
    prisma.budgetScenario.findMany({
      where: scenarioWhere,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: 6
    }),
    prisma.budgetVersion.findMany({
      where: versionWhere,
      include: {
        scenario: { select: { id: true, code: true, nameAr: true, branchId: true } }
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: 20
    }),
    prisma.budgetAllocation.findMany({
      where: allocationWhere,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: 200
    }),
    prisma.forecastSnapshot.findMany({
      where: forecastWhere,
      orderBy: [{ snapshotDate: 'desc' }, { id: 'desc' }],
      take: 12
    }),
    prisma.varianceEntry.findMany({
      where: varianceWhere,
      orderBy: [{ detectedAt: 'desc' }, { id: 'desc' }],
      take: 100
    })
  ]);

  const publishedVersions = versions.filter((row) => row.status === 'PUBLISHED');
  const draftVersions = versions.filter((row) => row.status === 'DRAFT');
  const pendingScenarios = scenarios.filter((row) => row.approvalStatus === 'PENDING');
  const openVariances = variances.filter((row) => row.status !== 'RESOLVED');
  const criticalVariances = openVariances.filter((row) => row.severity === 'CRITICAL' || row.severity === 'HIGH');
  const currentPlannedTotal = publishedVersions.reduce((sum: number, row) => sum + toNumber(row.plannedTotal), 0);
  const currentActualTotal = publishedVersions.reduce((sum: number, row) => sum + toNumber(row.actualTotal), 0);
  const latestForecast = forecasts[0] ?? null;
  const staleForecast =
    latestForecast && new Date(latestForecast.snapshotDate).getTime() < Date.now() - 30 * 24 * 60 * 60 * 1000;

  const allocationByPeriod = Array.from({ length: 12 }, (_, index) => ({
    label: `P${index + 1}`,
    value: round(toNumber(allocations.filter((row) => row.period === index + 1).reduce((sum: number, row) => sum + toNumber(row.plannedAmount), 0)))
  }));

  const varianceSeveritySeries = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((severity) => ({
    label: severity,
    value: openVariances.filter((row) => row.severity === severity).length
  }));

  const versionSeries = publishedVersions.length
    ? publishedVersions.slice(0, 6).map((row) => ({
        label: row.label,
        value: round(toNumber(row.plannedTotal) - toNumber(row.actualTotal))
      }))
    : [{ label: 'لا توجد نسخة منشورة', value: 0 }];

  const alerts: DashboardAlertItem[] = [];
  if (!publishedVersions.length) {
    alerts.push({
      key: 'budgeting-no-published-version',
      title: 'لا توجد نسخة منشورة',
      message: 'لا توجد نسخة موازنة منشورة حاليًا، ولن تظهر أرقام التخطيط الرسمية حتى يتم النشر.',
      severity: 'warning',
      route: '#/systems/budgeting/scenarios'
    });
  }
  if (criticalVariances.length) {
    alerts.push({
      key: 'budgeting-critical-variance',
      title: 'انحرافات حرجة مفتوحة',
      message: `يوجد ${criticalVariances.length} انحرافًا عالي الخطورة يحتاج متابعة فورية.`,
      severity: 'danger',
      route: '#/systems/budgeting/variance'
    });
  }
  if (staleForecast) {
    alerts.push({
      key: 'budgeting-stale-forecast',
      title: 'آخر توقع قديم',
      message: 'آخر snapshot للتوقعات أقدم من 30 يومًا ويحتاج تحديثًا.',
      severity: 'warning',
      route: '#/systems/budgeting/forecast'
    });
  }

  return {
    summary: [
      { key: 'budget-scenarios', label: 'السيناريوهات', value: scenarios.length, route: '#/systems/budgeting/scenarios' },
      { key: 'budget-published', label: 'نسخ منشورة', value: publishedVersions.length, tone: publishedVersions.length ? 'positive' : 'warning', route: '#/systems/budgeting/scenarios' },
      { key: 'budget-allocations', label: 'التخصيصات', value: allocations.length, route: '#/systems/budgeting/scenarios' },
      { key: 'budget-forecasts', label: 'لقطات التوقع', value: forecasts.length, route: '#/systems/budgeting/forecast' },
      { key: 'budget-open-variance', label: 'انحرافات مفتوحة', value: openVariances.length, tone: openVariances.length ? 'warning' : 'positive', route: '#/systems/budgeting/variance' },
      { key: 'budget-current-plan', label: 'إجمالي المخطط الحالي', value: round(currentPlannedTotal), route: '#/systems/budgeting/forecast' }
    ],
    queues: [
      { key: 'budgeting-scenarios-pending', label: 'سيناريوهات بانتظار الاعتماد', count: pendingScenarios.length, tone: pendingScenarios.length ? 'warning' : 'positive', route: '#/systems/budgeting/scenarios' },
      { key: 'budgeting-versions-draft', label: 'نسخ مسودة', count: draftVersions.length, route: '#/systems/budgeting/scenarios' },
      { key: 'budgeting-critical-variances', label: 'انحرافات حرجة', count: criticalVariances.length, tone: criticalVariances.length ? 'danger' : 'positive', route: '#/systems/budgeting/variance' },
      { key: 'budgeting-forecast-review', label: 'مراجعة لقطات التوقع', count: forecasts.filter((row) => row.status === 'SNAPSHOT').length, route: '#/systems/budgeting/forecast' }
    ],
    activity: [
      ...scenarios.map((row) => ({
        key: `budget-scenario-${row.id}`,
        title: `سيناريو ${row.code}`,
        subtitle: row.nameAr,
        date: row.updatedAt.toISOString(),
        status: row.status,
        route: '#/systems/budgeting/scenarios'
      })),
      ...versions.slice(0, 5).map((row) => ({
        key: `budget-version-${row.id}`,
        title: `نسخة ${row.label}`,
        subtitle: row.scenario?.nameAr ?? row.scenario?.code ?? 'Budget scenario',
        date: row.updatedAt.toISOString(),
        status: row.status,
        route: '#/systems/budgeting/scenarios'
      })),
      ...forecasts.slice(0, 5).map((row) => ({
        key: `budget-forecast-${row.id}`,
        title: row.label,
        subtitle: `Forecast ${round(toNumber(row.forecastTotal))}`,
        date: row.snapshotDate.toISOString(),
        status: row.status,
        route: '#/systems/budgeting/forecast'
      }))
    ]
      .sort((left, right) => String(right.date ?? '').localeCompare(String(left.date ?? '')))
      .slice(0, 12),
    alerts: alerts.length ? alerts : buildEmptyAlerts(),
    charts: [
      {
        key: 'budgeting-plan-vs-actual',
        title: 'المخطط مقابل الفعلي',
        kind: 'bar',
        series: [
          { label: 'Planned', value: round(currentPlannedTotal) },
          { label: 'Actual', value: round(currentActualTotal) }
        ]
      },
      {
        key: 'budgeting-allocation-trend',
        title: 'اتجاه التخصيص الشهري',
        kind: 'line',
        series: allocationByPeriod
      },
      {
        key: 'budgeting-variance-split',
        title: 'توزيع شدة الانحراف',
        kind: 'donut',
        series: varianceSeveritySeries.some((row) => row.value > 0) ? varianceSeveritySeries : [{ label: 'لا توجد بيانات', value: 1 }]
      },
      {
        key: 'budgeting-version-gap',
        title: 'فجوة المخطط والفعلي للنسخ المنشورة',
        kind: 'bar',
        series: versionSeries
      }
    ]
  };
}

async function buildQualityBundle(filters: DashboardFilters): Promise<SystemDashboardBundle> {
  const scopedWhere: any = {};
  if (filters.branchId) scopedWhere.branchId = filters.branchId;
  if (filters.projectId) scopedWhere.projectId = filters.projectId;
  const dateRange = { gte: filters.dateFrom, lte: filters.dateTo };
  const soon = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const [inspectionCount, pendingInspections, approvedInspections, openNcr, openIncidents, criticalIncidents, pendingPermits, expiringPermits, recentInspections, recentNcr, recentIncidents, recentPermits, inspectionRows, incidentRows] =
    await Promise.all([
      prisma.inspection.count({ where: scopedWhere }),
      prisma.inspection.count({ where: { ...scopedWhere, approvalStatus: 'PENDING' } }),
      prisma.inspection.count({ where: { ...scopedWhere, approvalStatus: 'APPROVED' } }),
      prisma.ncrReport.count({ where: { ...scopedWhere, status: 'OPEN' } }),
      prisma.safetyIncident.count({ where: { ...scopedWhere, status: 'OPEN' } }),
      prisma.safetyIncident.count({ where: { ...scopedWhere, status: 'OPEN', severity: { in: ['HIGH', 'CRITICAL'] } } }),
      prisma.permitToWork.count({ where: { ...scopedWhere, approvalStatus: 'PENDING' } }),
      prisma.permitToWork.count({ where: { ...scopedWhere, validTo: { gte: new Date(), lte: soon }, status: { not: 'EXPIRED' } } }),
      prisma.inspection.findMany({ where: { ...scopedWhere, inspectionDate: dateRange }, take: 5, orderBy: [{ inspectionDate: 'desc' }, { id: 'desc' }] }),
      prisma.ncrReport.findMany({ where: { ...scopedWhere, reportDate: dateRange }, take: 4, orderBy: [{ reportDate: 'desc' }, { id: 'desc' }] }),
      prisma.safetyIncident.findMany({ where: { ...scopedWhere, incidentDate: dateRange }, take: 4, orderBy: [{ incidentDate: 'desc' }, { id: 'desc' }] }),
      prisma.permitToWork.findMany({ where: { ...scopedWhere, validTo: dateRange }, take: 4, orderBy: [{ validTo: 'asc' }, { id: 'desc' }] }),
      prisma.inspection.findMany({ where: { ...scopedWhere, inspectionDate: dateRange }, select: { inspectionDate: true, result: true } }),
      prisma.safetyIncident.findMany({ where: { ...scopedWhere, incidentDate: dateRange }, select: { incidentDate: true, severity: true } })
    ]);

  const inspectionResultSeries = Array.from(
    inspectionRows.reduce((map, row) => {
      const label = String(row.result ?? 'PENDING');
      map.set(label, (map.get(label) ?? 0) + 1);
      return map;
    }, new Map<string, number>())
  ).map(([label, value]) => ({ label, value }));

  const incidentSeveritySeries = Array.from(
    incidentRows.reduce((map, row) => {
      const label = String(row.severity ?? 'MEDIUM');
      map.set(label, (map.get(label) ?? 0) + 1);
      return map;
    }, new Map<string, number>())
  ).map(([label, value]) => ({ label, value }));

  const monthlyVolume = mapAmountByMonth([
    ...inspectionRows.map((row) => ({ date: row.inspectionDate, amount: 1 })),
    ...recentNcr.map((row) => ({ date: row.reportDate, amount: 1 })),
    ...recentIncidents.map((row) => ({ date: row.incidentDate, amount: 1 }))
  ]);

  const alerts: DashboardAlertItem[] = [];
  if (criticalIncidents > 0) {
    alerts.push({
      key: 'quality-critical-incidents',
      title: 'حوادث سلامة حرجة مفتوحة',
      message: `يوجد ${criticalIncidents} حادثًا عالي الخطورة يحتاج تدخلًا فوريًا.`,
      severity: 'danger',
      route: '#/systems/quality/incidents'
    });
  }
  if (openNcr > 0) {
    alerts.push({
      key: 'quality-open-ncr',
      title: 'تقارير عدم مطابقة مفتوحة',
      message: `${openNcr} تقريرًا ما زال مفتوحًا ويتطلب إغلاقًا أو إجراءً تصحيحيًا.`,
      severity: 'warning',
      route: '#/systems/quality/ncr'
    });
  }
  if (expiringPermits > 0) {
    alerts.push({
      key: 'quality-expiring-permits',
      title: 'تصاريح قاربت على الانتهاء',
      message: `${expiringPermits} تصريح عمل ينتهي خلال 7 أيام.`,
      severity: 'warning',
      route: '#/systems/quality/inspections'
    });
  }

  return {
    summary: [
      { key: 'quality-inspections', label: 'إجمالي الفحوصات', value: inspectionCount, route: '#/systems/quality/inspections' },
      { key: 'quality-approved', label: 'فحوصات معتمدة', value: approvedInspections, tone: approvedInspections ? 'positive' : 'info', route: '#/systems/quality/inspections' },
      { key: 'quality-open-ncr', label: 'NCR مفتوحة', value: openNcr, tone: openNcr ? 'warning' : 'positive', route: '#/systems/quality/ncr' },
      { key: 'quality-open-incidents', label: 'حوادث مفتوحة', value: openIncidents, tone: openIncidents ? 'warning' : 'positive', route: '#/systems/quality/incidents' },
      { key: 'quality-pending-permits', label: 'تصاريح تنتظر الاعتماد', value: pendingPermits, tone: pendingPermits ? 'warning' : 'positive', route: '#/systems/quality/inspections' },
      { key: 'quality-expiring-permits', label: 'تصاريح تنتهي قريبًا', value: expiringPermits, tone: expiringPermits ? 'warning' : 'positive', route: '#/systems/quality/inspections' }
    ],
    queues: [
      { key: 'quality-queue-inspections', label: 'فحوصات بانتظار الاعتماد', count: pendingInspections, tone: pendingInspections ? 'warning' : 'positive', route: '#/systems/quality/inspections' },
      { key: 'quality-queue-ncr', label: 'حالات عدم مطابقة مفتوحة', count: openNcr, tone: openNcr ? 'warning' : 'positive', route: '#/systems/quality/ncr' },
      { key: 'quality-queue-incidents', label: 'حوادث سلامة مفتوحة', count: openIncidents, tone: criticalIncidents ? 'danger' : 'neutral', route: '#/systems/quality/incidents' },
      { key: 'quality-queue-permits', label: 'تصاريح قيد الاعتماد', count: pendingPermits, route: '#/systems/quality/inspections' }
    ],
    activity: [
      ...recentInspections.map((row) => ({
        key: `inspection-${row.id}`,
        title: `فحص ${row.number}`,
        subtitle: row.title,
        date: row.inspectionDate.toISOString(),
        status: row.approvalStatus,
        route: '#/systems/quality/inspections'
      })),
      ...recentNcr.map((row) => ({
        key: `ncr-${row.id}`,
        title: `NCR ${row.number}`,
        subtitle: row.title,
        date: row.reportDate.toISOString(),
        status: row.status,
        route: '#/systems/quality/ncr'
      })),
      ...recentIncidents.map((row) => ({
        key: `incident-${row.id}`,
        title: `حادث ${row.number}`,
        subtitle: row.title,
        date: row.incidentDate.toISOString(),
        status: row.status,
        route: '#/systems/quality/incidents'
      })),
      ...recentPermits.map((row) => ({
        key: `permit-${row.id}`,
        title: `تصريح ${row.number}`,
        subtitle: row.title,
        date: row.validTo.toISOString(),
        status: row.approvalStatus,
        route: '#/systems/quality/inspections'
      }))
    ]
      .sort((left, right) => String(right.date ?? '').localeCompare(String(left.date ?? '')))
      .slice(0, 12),
    alerts: alerts.length ? alerts : buildEmptyAlerts(),
    charts: [
      { key: 'quality-results', title: 'نتائج الفحوصات', kind: 'donut', series: inspectionResultSeries.length ? inspectionResultSeries : [{ label: 'لا توجد بيانات', value: 1 }] },
      { key: 'quality-incident-severity', title: 'شدة الحوادث', kind: 'bar', series: incidentSeveritySeries.length ? incidentSeveritySeries : [{ label: 'لا توجد بيانات', value: 0 }] },
      { key: 'quality-volume', title: 'حجم النشاط الشهري', kind: 'line', series: monthlyVolume.length ? monthlyVolume : [{ label: monthKey(new Date()), value: 0 }] }
    ]
  };
}

async function buildMaintenanceBundle(filters: DashboardFilters): Promise<SystemDashboardBundle> {
  const scopedWhere: any = {};
  if (filters.branchId) scopedWhere.branchId = filters.branchId;
  if (filters.projectId) scopedWhere.projectId = filters.projectId;
  const dateRange = { gte: filters.dateFrom, lte: filters.dateTo };
  const soon = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const now = new Date();

  const [activePlans, preventiveDue, openOrders, pendingOrders, overdueOrders, executionsCount, reservedSpare, repeatFailures, criticalFailures, recentPlans, recentOrders, recentExecutions, recentFailures, executionRows, failureRows, orderRows] =
    await Promise.all([
      prisma.maintenancePlan.count({ where: { ...scopedWhere, status: 'ACTIVE' } }),
      prisma.maintenancePlan.count({ where: { ...scopedWhere, status: 'ACTIVE', nextDueDate: { gte: now, lte: soon } } }),
      prisma.maintenanceOrder.count({ where: { ...scopedWhere, status: { notIn: ['COMPLETED', 'CANCELLED'] } } }),
      prisma.maintenanceOrder.count({ where: { ...scopedWhere, approvalStatus: 'PENDING' } }),
      prisma.maintenanceOrder.count({ where: { ...scopedWhere, status: { notIn: ['COMPLETED', 'CANCELLED'] }, dueDate: { lt: now } } }),
      prisma.maintenanceExecution.count({ where: { ...scopedWhere, executionDate: dateRange } }),
      prisma.spareReservation.count({ where: { ...(filters.branchId ? { branchId: filters.branchId } : {}), status: 'RESERVED' } }),
      prisma.failureAnalysis.count({ where: { ...scopedWhere, repeatCount: { gt: 0 }, status: 'OPEN' } }),
      prisma.failureAnalysis.count({ where: { ...scopedWhere, status: 'OPEN', severity: { in: ['HIGH', 'CRITICAL'] } } }),
      prisma.maintenancePlan.findMany({ where: scopedWhere, take: 4, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }] }),
      prisma.maintenanceOrder.findMany({ where: { ...scopedWhere, dueDate: dateRange }, take: 5, orderBy: [{ dueDate: 'asc' }, { id: 'desc' }] }),
      prisma.maintenanceExecution.findMany({ where: { ...scopedWhere, executionDate: dateRange }, take: 5, orderBy: [{ executionDate: 'desc' }, { id: 'desc' }] }),
      prisma.failureAnalysis.findMany({ where: { ...scopedWhere, incidentDate: dateRange }, take: 5, orderBy: [{ incidentDate: 'desc' }, { id: 'desc' }] }),
      prisma.maintenanceExecution.findMany({ where: { ...scopedWhere, executionDate: dateRange }, select: { executionDate: true, laborCost: true, spareCost: true } }),
      prisma.failureAnalysis.findMany({ where: { ...scopedWhere, incidentDate: dateRange }, select: { severity: true, mtbfHours: true, incidentDate: true } }),
      prisma.maintenanceOrder.findMany({ where: { ...scopedWhere, dueDate: dateRange }, select: { priority: true, actualCost: true, dueDate: true } })
    ]);

  const operatingCost = round(orderRows.reduce((sum, row) => sum + toNumber(row.actualCost), 0));
  const prioritySeries = Array.from(
    orderRows.reduce((map, row) => {
      const label = String(row.priority ?? 'MEDIUM');
      map.set(label, (map.get(label) ?? 0) + 1);
      return map;
    }, new Map<string, number>())
  ).map(([label, value]) => ({ label, value }));
  const mtbfSeries = mapAmountByMonth(failureRows.map((row) => ({ date: row.incidentDate, amount: toNumber(row.mtbfHours) })));
  const costSeries = mapAmountByMonth(executionRows.map((row) => ({ date: row.executionDate, amount: toNumber(row.laborCost) + toNumber(row.spareCost) })));

  const alerts: DashboardAlertItem[] = [];
  if (overdueOrders > 0) {
    alerts.push({
      key: 'maintenance-overdue-orders',
      title: 'أوامر صيانة متأخرة',
      message: `يوجد ${overdueOrders} أمر صيانة تجاوز تاريخ الاستحقاق.`,
      severity: 'warning',
      route: '#/systems/maintenance/orders'
    });
  }
  if (criticalFailures > 0) {
    alerts.push({
      key: 'maintenance-critical-failures',
      title: 'أعطال حرجة متكررة',
      message: `${criticalFailures} تحليل عطل عالي الشدة ما زال مفتوحًا.`,
      severity: 'danger',
      route: '#/systems/maintenance/failures'
    });
  }
  if (reservedSpare > 0) {
    alerts.push({
      key: 'maintenance-spare-shortage',
      title: 'حجوزات قطع غيار معلقة',
      message: `${reservedSpare} حجز قطعة غيار لم يُصرف بعد من المخزون.`,
      severity: 'warning',
      route: '#/systems/maintenance/orders'
    });
  }

  return {
    summary: [
      { key: 'maintenance-plans', label: 'خطط نشطة', value: activePlans, route: '#/systems/maintenance/plans' },
      { key: 'maintenance-due', label: 'صيانة وقائية مستحقة', value: preventiveDue, tone: preventiveDue ? 'warning' : 'positive', route: '#/systems/maintenance/plans' },
      { key: 'maintenance-orders', label: 'أوامر مفتوحة', value: openOrders, tone: openOrders ? 'warning' : 'positive', route: '#/systems/maintenance/orders' },
      { key: 'maintenance-operating-cost', label: 'تكلفة التشغيل', value: operatingCost, route: '#/systems/maintenance/orders' },
      { key: 'maintenance-repeat-failures', label: 'أعطال متكررة', value: repeatFailures, tone: repeatFailures ? 'warning' : 'positive', route: '#/systems/maintenance/failures' },
      { key: 'maintenance-spare', label: 'حجوزات قطع غيار', value: reservedSpare, tone: reservedSpare ? 'warning' : 'positive', route: '#/systems/maintenance/orders' }
    ],
    queues: [
      { key: 'maintenance-queue-orders', label: 'أوامر بانتظار الاعتماد', count: pendingOrders, tone: pendingOrders ? 'warning' : 'positive', route: '#/systems/maintenance/orders' },
      { key: 'maintenance-queue-overdue', label: 'أوامر متأخرة', count: overdueOrders, tone: overdueOrders ? 'danger' : 'positive', route: '#/systems/maintenance/orders' },
      { key: 'maintenance-queue-executions', label: 'تنفيذات الفترة', count: executionsCount, route: '#/systems/maintenance/orders' },
      { key: 'maintenance-queue-failures', label: 'تحليلات أعطال مفتوحة', count: criticalFailures + repeatFailures, route: '#/systems/maintenance/failures' }
    ],
    activity: [
      ...recentPlans.map((row) => ({
        key: `maintenance-plan-${row.id}`,
        title: `خطة ${row.code}`,
        subtitle: row.title,
        date: row.updatedAt.toISOString(),
        status: row.status,
        route: '#/systems/maintenance/plans'
      })),
      ...recentOrders.map((row) => ({
        key: `maintenance-order-${row.id}`,
        title: `أمر ${row.number}`,
        subtitle: row.title,
        date: (row.dueDate ?? row.updatedAt).toISOString(),
        status: row.status,
        route: '#/systems/maintenance/orders'
      })),
      ...recentExecutions.map((row) => ({
        key: `maintenance-execution-${row.id}`,
        title: `تنفيذ صيانة #${row.id}`,
        subtitle: `تكلفة ${round(toNumber(row.laborCost) + toNumber(row.spareCost))}`,
        date: row.executionDate.toISOString(),
        status: row.status,
        route: '#/systems/maintenance/orders'
      })),
      ...recentFailures.map((row) => ({
        key: `maintenance-failure-${row.id}`,
        title: `عطل ${row.number}`,
        subtitle: row.title,
        date: row.incidentDate.toISOString(),
        status: row.severity,
        route: '#/systems/maintenance/failures'
      }))
    ]
      .sort((left, right) => String(right.date ?? '').localeCompare(String(left.date ?? '')))
      .slice(0, 12),
    alerts: alerts.length ? alerts : buildEmptyAlerts(),
    charts: [
      { key: 'maintenance-priority', title: 'أولويات أوامر الصيانة', kind: 'donut', series: prioritySeries.length ? prioritySeries : [{ label: 'لا توجد بيانات', value: 1 }] },
      { key: 'maintenance-cost-trend', title: 'اتجاه تكلفة التنفيذ', kind: 'line', series: costSeries.length ? costSeries : [{ label: monthKey(new Date()), value: 0 }] },
      { key: 'maintenance-mtbf', title: 'اتجاه MTBF', kind: 'bar', series: mtbfSeries.length ? mtbfSeries : [{ label: monthKey(new Date()), value: 0 }] }
    ]
  };
}

async function buildRiskBundle(filters: DashboardFilters): Promise<SystemDashboardBundle> {
  const scopedWhere: any = {};
  if (filters.branchId) scopedWhere.branchId = filters.branchId;
  if (filters.projectId) scopedWhere.projectId = filters.projectId;
  const dateRange = { gte: filters.dateFrom, lte: filters.dateTo };
  const now = new Date();

  const [openRisks, highRisks, projectLinkedRisks, dueSoonRisks, overdueMitigations, followupsDue, recentRisks, recentAssessments, recentMitigations, recentFollowups, riskRows] =
    await Promise.all([
      prisma.riskRegister.count({ where: { ...scopedWhere, status: 'OPEN' } }),
      prisma.riskRegister.count({ where: { ...scopedWhere, status: 'OPEN', severity: { in: ['HIGH', 'CRITICAL'] } } }),
      prisma.riskRegister.count({ where: { ...scopedWhere, projectId: { not: null } } }),
      prisma.riskRegister.count({ where: { ...scopedWhere, dueDate: { gte: now, lte: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000) } } }),
      prisma.mitigationPlan.count({ where: { dueDate: { lt: now }, status: { notIn: ['CLOSED', 'COMPLETED'] }, risk: { ...(filters.branchId ? { branchId: filters.branchId } : {}), ...(filters.projectId ? { projectId: filters.projectId } : {}) } } }),
      prisma.riskFollowup.count({ where: { nextReviewDate: { lt: now }, risk: { ...(filters.branchId ? { branchId: filters.branchId } : {}), ...(filters.projectId ? { projectId: filters.projectId } : {}) } } }),
      prisma.riskRegister.findMany({ where: scopedWhere, take: 5, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }] }),
      prisma.riskAssessment.findMany({ where: { assessmentDate: dateRange, risk: { ...(filters.branchId ? { branchId: filters.branchId } : {}), ...(filters.projectId ? { projectId: filters.projectId } : {}) } }, take: 4, orderBy: [{ assessmentDate: 'desc' }, { id: 'desc' }] }),
      prisma.mitigationPlan.findMany({ where: { dueDate: dateRange, risk: { ...(filters.branchId ? { branchId: filters.branchId } : {}), ...(filters.projectId ? { projectId: filters.projectId } : {}) } }, take: 4, orderBy: [{ dueDate: 'asc' }, { id: 'desc' }] }),
      prisma.riskFollowup.findMany({ where: { followupDate: dateRange, risk: { ...(filters.branchId ? { branchId: filters.branchId } : {}), ...(filters.projectId ? { projectId: filters.projectId } : {}) } }, take: 4, orderBy: [{ followupDate: 'desc' }, { id: 'desc' }] }),
      prisma.riskRegister.findMany({ where: scopedWhere, select: { severity: true, category: true, exposure: true, createdAt: true } })
    ]);

  const severitySeries = Array.from(
    riskRows.reduce((map, row) => {
      const label = String(row.severity ?? 'LOW');
      map.set(label, (map.get(label) ?? 0) + 1);
      return map;
    }, new Map<string, number>())
  ).map(([label, value]) => ({ label, value }));

  const categorySeries = Array.from(
    riskRows.reduce((map, row) => {
      const label = String(row.category ?? 'GENERAL');
      map.set(label, (map.get(label) ?? 0) + 1);
      return map;
    }, new Map<string, number>())
  ).map(([label, value]) => ({ label, value }));

  const exposureSeries = mapAmountByMonth(riskRows.map((row) => ({ date: row.createdAt, amount: toNumber(row.exposure) })));

  const alerts: DashboardAlertItem[] = [];
  if (highRisks > 0) {
    alerts.push({
      key: 'risk-high-open',
      title: 'مخاطر عالية مفتوحة',
      message: `يوجد ${highRisks} خطرًا عالي الشدة يحتاج قرارًا أو إجراءً.`,
      severity: 'danger',
      route: '#/systems/risk/register'
    });
  }
  if (overdueMitigations > 0) {
    alerts.push({
      key: 'risk-overdue-mitigations',
      title: 'خطط تخفيف متأخرة',
      message: `${overdueMitigations} خطة تخفيف تجاوزت الموعد النهائي.`,
      severity: 'warning',
      route: '#/systems/risk/followup'
    });
  }
  if (followupsDue > 0) {
    alerts.push({
      key: 'risk-followup-due',
      title: 'متابعات مطلوبة',
      message: `${followupsDue} متابعة لمخاطر تحتاج مراجعة الآن.`,
      severity: 'warning',
      route: '#/systems/risk/followup'
    });
  }

  return {
    summary: [
      { key: 'risk-open', label: 'مخاطر مفتوحة', value: openRisks, tone: openRisks ? 'warning' : 'positive', route: '#/systems/risk/register' },
      { key: 'risk-high', label: 'عالية الشدة', value: highRisks, tone: highRisks ? 'danger' : 'positive', route: '#/systems/risk/heatmap' },
      { key: 'risk-project-linked', label: 'مرتبطة بالمشاريع', value: projectLinkedRisks, route: '#/systems/risk/register' },
      { key: 'risk-overdue-mitigation', label: 'تخفيفات متأخرة', value: overdueMitigations, tone: overdueMitigations ? 'warning' : 'positive', route: '#/systems/risk/followup' },
      { key: 'risk-followups', label: 'متابعات مستحقة', value: followupsDue, tone: followupsDue ? 'warning' : 'positive', route: '#/systems/risk/followup' },
      { key: 'risk-due-soon', label: 'مخاطر تستحق قريبًا', value: dueSoonRisks, route: '#/systems/risk/register' }
    ],
    queues: [
      { key: 'risk-queue-open', label: 'سجلات مفتوحة', count: openRisks, tone: openRisks ? 'warning' : 'positive', route: '#/systems/risk/register' },
      { key: 'risk-queue-high', label: 'عالية/حرجة', count: highRisks, tone: highRisks ? 'danger' : 'positive', route: '#/systems/risk/heatmap' },
      { key: 'risk-queue-mitigations', label: 'تخفيفات متأخرة', count: overdueMitigations, tone: overdueMitigations ? 'warning' : 'positive', route: '#/systems/risk/followup' },
      { key: 'risk-queue-followups', label: 'متابعات مطلوبة', count: followupsDue, route: '#/systems/risk/followup' }
    ],
    activity: [
      ...recentRisks.map((row) => ({
        key: `risk-register-${row.id}`,
        title: row.code,
        subtitle: row.title,
        date: row.updatedAt.toISOString(),
        status: row.severity,
        route: '#/systems/risk/register'
      })),
      ...recentAssessments.map((row) => ({
        key: `risk-assessment-${row.id}`,
        title: `Assessment #${row.id}`,
        subtitle: `Severity ${row.severity}`,
        date: row.assessmentDate.toISOString(),
        status: row.severity,
        route: '#/systems/risk/heatmap'
      })),
      ...recentMitigations.map((row) => ({
        key: `risk-mitigation-${row.id}`,
        title: row.title,
        subtitle: row.status,
        date: (row.dueDate ?? row.updatedAt).toISOString(),
        status: row.status,
        route: '#/systems/risk/followup'
      })),
      ...recentFollowups.map((row) => ({
        key: `risk-followup-${row.id}`,
        title: `Follow-up #${row.id}`,
        subtitle: row.status,
        date: row.followupDate.toISOString(),
        status: row.status,
        route: '#/systems/risk/followup'
      }))
    ]
      .sort((left, right) => String(right.date ?? '').localeCompare(String(left.date ?? '')))
      .slice(0, 12),
    alerts: alerts.length ? alerts : buildEmptyAlerts(),
    charts: [
      { key: 'risk-severity', title: 'توزيع الشدة', kind: 'donut', series: severitySeries.length ? severitySeries : [{ label: 'لا توجد بيانات', value: 1 }] },
      { key: 'risk-categories', title: 'توزيع الفئات', kind: 'bar', series: categorySeries.length ? categorySeries : [{ label: 'لا توجد بيانات', value: 0 }] },
      { key: 'risk-exposure-trend', title: 'اتجاه التعرض', kind: 'line', series: exposureSeries.length ? exposureSeries : [{ label: monthKey(new Date()), value: 0 }] }
    ]
  };
}

async function buildSchedulingBundle(filters: DashboardFilters): Promise<SystemDashboardBundle> {
  const scopedWhere: any = {};
  if (filters.branchId) scopedWhere.branchId = filters.branchId;
  if (filters.projectId) scopedWhere.projectId = filters.projectId;
  const dateRange = { gte: filters.dateFrom, lte: filters.dateTo };
  const now = new Date();
  const lookahead = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  const [plansCount, openTasks, criticalTasks, delayedTasks, delayedCriticalTasks, dependenciesCount, snapshotsCount, resourceOverload, recentPlans, recentTasks, recentDependencies, recentSnapshots, taskRows] =
    await Promise.all([
      prisma.schedulePlan.count({ where: scopedWhere }),
      prisma.scheduleTask.count({ where: { ...scopedWhere, status: { notIn: ['DONE', 'COMPLETED', 'CLOSED'] } } }),
      prisma.scheduleTask.count({ where: { ...scopedWhere, isCritical: true } }),
      prisma.scheduleTask.count({ where: { ...scopedWhere, endDate: { lt: now }, progressPercent: { lt: 100 } } }),
      prisma.scheduleTask.count({ where: { ...scopedWhere, isCritical: true, endDate: { lt: now }, progressPercent: { lt: 100 } } }),
      prisma.taskDependency.count({ where: { ...(filters.projectId ? { plan: { is: { projectId: filters.projectId } } } : {}), ...(filters.branchId ? { plan: { is: { branchId: filters.branchId } } } : {}) } }),
      prisma.criticalPathSnapshot.count({ where: { ...(filters.projectId ? { plan: { is: { projectId: filters.projectId } } } : {}), ...(filters.branchId ? { plan: { is: { branchId: filters.branchId } } } : {}) } }),
      prisma.resourceAssignment.count({ where: { plan: { ...(filters.projectId ? { projectId: filters.projectId } : {}), ...(filters.branchId ? { branchId: filters.branchId } : {}) }, allocationPercent: { gt: 100 } } }),
      prisma.schedulePlan.findMany({ where: scopedWhere, take: 4, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }] }),
      prisma.scheduleTask.findMany({ where: { ...scopedWhere, startDate: dateRange }, take: 6, orderBy: [{ startDate: 'asc' }, { id: 'asc' }] }),
      prisma.taskDependency.findMany({ where: { ...(filters.projectId ? { plan: { is: { projectId: filters.projectId } } } : {}), ...(filters.branchId ? { plan: { is: { branchId: filters.branchId } } } : {}) }, take: 4, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }),
      prisma.criticalPathSnapshot.findMany({ where: { ...(filters.projectId ? { plan: { is: { projectId: filters.projectId } } } : {}), ...(filters.branchId ? { plan: { is: { branchId: filters.branchId } } } : {}) }, take: 4, orderBy: [{ snapshotDate: 'desc' }, { id: 'desc' }] }),
      prisma.scheduleTask.findMany({ where: { ...scopedWhere, startDate: dateRange }, select: { progressPercent: true, isCritical: true, endDate: true, startDate: true } })
    ]);

  const progressSeries = [
    { label: '0-25%', value: taskRows.filter((row) => toNumber(row.progressPercent) <= 25).length },
    { label: '26-50%', value: taskRows.filter((row) => toNumber(row.progressPercent) > 25 && toNumber(row.progressPercent) <= 50).length },
    { label: '51-75%', value: taskRows.filter((row) => toNumber(row.progressPercent) > 50 && toNumber(row.progressPercent) <= 75).length },
    { label: '76-100%', value: taskRows.filter((row) => toNumber(row.progressPercent) > 75).length }
  ];

  const criticalSeries = [
    { label: 'Critical', value: taskRows.filter((row) => row.isCritical).length },
    { label: 'Non-Critical', value: taskRows.filter((row) => !row.isCritical).length }
  ];
  const lookaheadSeries = mapAmountByMonth(
    taskRows.filter((row) => row.endDate >= now && row.endDate <= lookahead).map((row) => ({ date: row.endDate, amount: 1 }))
  );

  const alerts: DashboardAlertItem[] = [];
  if (delayedCriticalTasks > 0) {
    alerts.push({
      key: 'scheduling-delayed-critical',
      title: 'تأخير في المسار الحرج',
      message: `يوجد ${delayedCriticalTasks} مهمة حرجة متأخرة عن الجدول.`,
      severity: 'danger',
      route: '#/systems/scheduling/critical-path'
    });
  }
  if (resourceOverload > 0) {
    alerts.push({
      key: 'scheduling-resource-overload',
      title: 'تحميل موارد مرتفع',
      message: `${resourceOverload} تخصيص مورد يتجاوز 100% من الطاقة المخططة.`,
      severity: 'warning',
      route: '#/systems/scheduling/tasks'
    });
  }

  return {
    summary: [
      { key: 'scheduling-plans', label: 'الخطط الزمنية', value: plansCount, route: '#/systems/scheduling/plans' },
      { key: 'scheduling-open-tasks', label: 'المهام المفتوحة', value: openTasks, route: '#/systems/scheduling/tasks' },
      { key: 'scheduling-critical', label: 'مهام حرجة', value: criticalTasks, tone: criticalTasks ? 'warning' : 'positive', route: '#/systems/scheduling/critical-path' },
      { key: 'scheduling-delayed', label: 'مهام متأخرة', value: delayedTasks, tone: delayedTasks ? 'warning' : 'positive', route: '#/systems/scheduling/tasks' },
      { key: 'scheduling-delayed-critical', label: 'حرجة متأخرة', value: delayedCriticalTasks, tone: delayedCriticalTasks ? 'danger' : 'positive', route: '#/systems/scheduling/critical-path' },
      { key: 'scheduling-lookahead', label: 'اعتماديات', value: dependenciesCount, route: '#/systems/scheduling/tasks' }
    ],
    queues: [
      { key: 'scheduling-queue-delayed', label: 'مهام متأخرة', count: delayedTasks, tone: delayedTasks ? 'warning' : 'positive', route: '#/systems/scheduling/tasks' },
      { key: 'scheduling-queue-critical', label: 'تأخير المسار الحرج', count: delayedCriticalTasks, tone: delayedCriticalTasks ? 'danger' : 'positive', route: '#/systems/scheduling/critical-path' },
      { key: 'scheduling-queue-overload', label: 'تحميل موارد زائد', count: resourceOverload, tone: resourceOverload ? 'warning' : 'positive', route: '#/systems/scheduling/tasks' },
      { key: 'scheduling-queue-snapshots', label: 'لقطات المسار الحرج', count: snapshotsCount, route: '#/systems/scheduling/critical-path' }
    ],
    activity: [
      ...recentPlans.map((row) => ({
        key: `schedule-plan-${row.id}`,
        title: row.code,
        subtitle: row.title,
        date: row.updatedAt.toISOString(),
        status: row.status,
        route: '#/systems/scheduling/plans'
      })),
      ...recentTasks.map((row) => ({
        key: `schedule-task-${row.id}`,
        title: row.title,
        subtitle: row.wbsCode ?? 'Task',
        date: row.startDate.toISOString(),
        status: row.isCritical ? 'CRITICAL' : row.status,
        route: '#/systems/scheduling/tasks'
      })),
      ...recentDependencies.map((row) => ({
        key: `schedule-dependency-${row.id}`,
        title: `Dependency ${row.dependencyType}`,
        subtitle: `Lag ${row.lagDays}`,
        date: row.createdAt.toISOString(),
        status: row.dependencyType,
        route: '#/systems/scheduling/tasks'
      })),
      ...recentSnapshots.map((row) => ({
        key: `schedule-snapshot-${row.id}`,
        title: row.title,
        subtitle: `Critical ${row.criticalTasksCount} / Delayed ${row.delayedTasksCount}`,
        date: row.snapshotDate.toISOString(),
        status: row.status,
        route: '#/systems/scheduling/critical-path'
      }))
    ]
      .sort((left, right) => String(right.date ?? '').localeCompare(String(left.date ?? '')))
      .slice(0, 12),
    alerts: alerts.length ? alerts : buildEmptyAlerts(),
    charts: [
      { key: 'scheduling-progress', title: 'توزيع التقدم', kind: 'bar', series: progressSeries },
      { key: 'scheduling-critical-split', title: 'تقسيم المسار الحرج', kind: 'donut', series: criticalSeries },
      { key: 'scheduling-lookahead', title: 'خطة النظر للأمام', kind: 'line', series: lookaheadSeries.length ? lookaheadSeries : [{ label: monthKey(new Date()), value: 0 }] }
    ]
  };
}

async function buildAnalyticsBundle(filters: DashboardFilters): Promise<SystemDashboardBundle> {
  const branchFilter = filters.branchId ? { branchId: filters.branchId } : {};
  const [invoices, customers, items, payments, journals] = await Promise.all([
    prisma.invoice.findMany({ where: { ...branchFilter, date: { gte: filters.dateFrom, lte: filters.dateTo } }, orderBy: { date: 'asc' } }),
    prisma.customer.findMany({ where: branchFilter, orderBy: { currentBalance: 'desc' }, take: 6 }),
    prisma.item.findMany({ orderBy: { inventoryValue: 'desc' }, take: 6 }),
    prisma.payment.count({ where: { ...branchFilter, date: { gte: filters.dateFrom, lte: filters.dateTo } } }),
    prisma.journalEntry.count({ where: { date: { gte: filters.dateFrom, lte: filters.dateTo } } })
  ]);

  const salesInvoices = invoices.filter((row) => row.type === 'SALES');
  const forecastTrend = mapAmountByMonth(salesInvoices.map((row) => ({ date: row.date, amount: toNumber(row.total) })));
  const exposureSeries = customers.map((row) => ({ label: row.nameAr, value: Math.round(toNumber(row.currentBalance)) }));
  const abcSeries = items.map((row) => ({ label: row.nameAr, value: Math.round(toNumber(row.inventoryValue)) }));
  const balancedScoreValue = Math.round(((payments + journals + invoices.length) / Math.max(1, invoices.length + 10)) * 100);

  return {
    summary: [
      { key: 'warehouse-mode', label: 'مصدر التحليل', value: 'OLTP مباشر', tone: 'info', route: '#/reports/custom' },
      { key: 'executive-packs', label: 'لوحات تنفيذية جاهزة', value: 20, route: '#/dashboard' },
      { key: 'scheduled-reports', label: 'تقارير مجدولة', value: 0, route: '#/reports/custom' },
      { key: 'trend-packs', label: 'حزم الاتجاهات', value: forecastTrend.length, route: '#/reports/custom' },
      { key: 'data-points', label: 'نقاط البيانات الحالية', value: invoices.length + payments + journals, route: '#/reports/custom' },
      { key: 'bsc', label: 'مؤشر BSC تقريبي', value: `${Math.min(100, balancedScoreValue)}%`, route: '#/reports/custom' }
    ],
    queues: [
      { key: 'analytics-refresh', label: 'قوائم تحديث التحليلات', count: 1, route: '#/reports/custom' },
      { key: 'executive-pack-queue', label: 'حزم تنفيذية قابلة للتوليد', count: 4, route: '#/dashboard' },
      { key: 'custom-reports', label: 'نماذج تقارير جاهزة', count: 3, route: '#/reports/custom' }
    ],
    activity: [
      {
        key: 'analytics-forecast',
        title: 'تم تجهيز اتجاه المبيعات',
        subtitle: `عدد الفترات المحسوبة ${forecastTrend.length}`,
        date: new Date().toISOString(),
        status: 'READY',
        route: '#/reports/custom'
      },
      ...customers.slice(0, 3).map((row) => ({
        key: `customer-${row.id}`,
        title: row.nameAr,
        subtitle: `رصيد ${Math.round(toNumber(row.currentBalance))}`,
        date: row.updatedAt.toISOString(),
        status: 'ANALYZED',
        route: '#/customers'
      }))
    ],
    alerts: [
      {
        key: 'dw-roadmap',
        title: 'التحليلات في وضع القراءة المباشرة',
        message: 'هذه اللوحة تعمل الآن على بيانات OLTP مباشرة، وسيتم نقلها إلى read models وData Warehouse في الموجات التالية.',
        severity: 'info',
        route: '#/reports/custom'
      }
    ],
    charts: [
      { key: 'sales-forecast', title: 'اتجاه المبيعات', kind: 'line', series: forecastTrend.length ? forecastTrend : [{ label: monthKey(new Date()), value: 0 }] },
      { key: 'customer-exposure', title: 'أعلى العملاء تعرضًا', kind: 'bar', series: exposureSeries.length ? exposureSeries : [{ label: 'لا توجد بيانات', value: 0 }] },
      { key: 'abc-items', title: 'أعلى الأصناف قيمة', kind: 'bar', series: abcSeries.length ? abcSeries : [{ label: 'لا توجد بيانات', value: 0 }] }
    ]
  };
}

async function buildControlCenterBundle(filters: DashboardFilters): Promise<SystemDashboardBundle> {
  const branchFilter = filters.branchId ? { branchId: filters.branchId } : {};
  const [quotesPending, invoicesPending, paymentsPending, contractsPending, purchaseOrdersPending, tendersPending, subcontractIpcsPending, budgetingPendingApprovals, budgetingCriticalVariances, qualityPendingApprovals, qualityCriticalAlerts, maintenancePendingOrders, maintenanceCriticalAlerts, riskCriticalAlerts, riskOverdueMitigations, schedulingCriticalDelays, openTasks, unreadNotifications, failedOutbox, recentOutbox, recentTasks, recentAudits, lowStockItems, overdueInvoices, overBudgetProjects] =
    await Promise.all([
      prisma.salesQuote.count({ where: { ...branchFilter, approvalStatus: 'PENDING' } }),
      prisma.invoice.count({ where: { ...branchFilter, approvalStatus: 'PENDING' } }),
      prisma.payment.count({ where: { ...branchFilter, approvalStatus: 'PENDING' } }),
      prisma.contract.count({ where: { ...branchFilter, approvalStatus: 'PENDING' } }),
      prisma.purchaseOrder.count({ where: { ...branchFilter, approvalStatus: 'PENDING' } }),
      prisma.tender.count({ where: { ...branchFilter, approvalStatus: 'PENDING' } }),
      prisma.subcontractIpc.count({
        where: {
          approvalStatus: 'PENDING',
          ...(filters.branchId ? { subcontract: { is: { branchId: filters.branchId } } } : {})
        }
      }),
      prisma.budgetScenario.count({
        where: {
          approvalStatus: 'PENDING',
          ...(filters.branchId ? { branchId: filters.branchId } : {})
        }
      }),
      prisma.varianceEntry.count({
        where: {
          ...(filters.branchId ? { branchId: filters.branchId } : {}),
          ...(filters.projectId ? { projectId: filters.projectId } : {}),
          status: { not: 'RESOLVED' },
          severity: { in: ['HIGH', 'CRITICAL'] }
        }
      }),
      prisma.inspection.count({
        where: {
          ...(filters.branchId ? { branchId: filters.branchId } : {}),
          ...(filters.projectId ? { projectId: filters.projectId } : {}),
          approvalStatus: 'PENDING'
        }
      }),
      prisma.safetyIncident.count({
        where: {
          ...(filters.branchId ? { branchId: filters.branchId } : {}),
          ...(filters.projectId ? { projectId: filters.projectId } : {}),
          status: 'OPEN',
          severity: { in: ['HIGH', 'CRITICAL'] }
        }
      }),
      prisma.maintenanceOrder.count({
        where: {
          ...(filters.branchId ? { branchId: filters.branchId } : {}),
          ...(filters.projectId ? { projectId: filters.projectId } : {}),
          approvalStatus: 'PENDING'
        }
      }),
      prisma.failureAnalysis.count({
        where: {
          ...(filters.branchId ? { branchId: filters.branchId } : {}),
          ...(filters.projectId ? { projectId: filters.projectId } : {}),
          status: 'OPEN',
          severity: { in: ['HIGH', 'CRITICAL'] }
        }
      }),
      prisma.riskRegister.count({
        where: {
          ...(filters.branchId ? { branchId: filters.branchId } : {}),
          ...(filters.projectId ? { projectId: filters.projectId } : {}),
          status: 'OPEN',
          severity: { in: ['HIGH', 'CRITICAL'] }
        }
      }),
      prisma.mitigationPlan.count({
        where: {
          dueDate: { lt: new Date() },
          status: { notIn: ['CLOSED', 'COMPLETED'] },
          risk: {
            ...(filters.branchId ? { branchId: filters.branchId } : {}),
            ...(filters.projectId ? { projectId: filters.projectId } : {})
          }
        }
      }),
      prisma.scheduleTask.count({
        where: {
          ...(filters.branchId ? { branchId: filters.branchId } : {}),
          ...(filters.projectId ? { projectId: filters.projectId } : {}),
          isCritical: true,
          endDate: { lt: new Date() },
          progressPercent: { lt: 100 }
        }
      }),
      prisma.userTask.count({ where: { status: { notIn: ['DONE', 'CLOSED', 'COMPLETED'] } } }),
      prisma.notification.count({ where: { isRead: false } }),
      prisma.outboxEvent.count({ where: { ...branchFilter, status: 'FAILED' } }),
      prisma.outboxEvent.findMany({ where: branchFilter, take: 6, orderBy: { occurredAt: 'desc' } }),
      prisma.userTask.findMany({ take: 5, orderBy: { updatedAt: 'desc' } }),
      prisma.auditLog.findMany({ take: 5, orderBy: { createdAt: 'desc' } }),
      prisma.item.findMany({ orderBy: { updatedAt: 'desc' } }),
      prisma.invoice.count({
        where: {
          ...branchFilter,
          type: 'SALES',
          dueDate: { lt: new Date() },
          outstanding: { gt: 0 },
          status: { in: ['ISSUED', 'PARTIAL'] }
        }
      }),
      prisma.project.findMany({ where: branchFilter })
    ]);

  const pendingApprovals =
    quotesPending +
    invoicesPending +
    paymentsPending +
    contractsPending +
    purchaseOrdersPending +
    tendersPending +
    subcontractIpcsPending +
    budgetingPendingApprovals +
    qualityPendingApprovals +
    maintenancePendingOrders;
  const lowStockCount = lowStockItems.filter((row) => toNumber(row.onHandQty) < Math.max(toNumber(row.minStock), toNumber(row.reorderPoint))).length;
  const overBudgetCount = overBudgetProjects.filter((row) => toNumber(row.budget) > 0 && toNumber(row.actualCost) > toNumber(row.budget)).length;
  const totalCriticalAlerts =
    failedOutbox +
    lowStockCount +
    overBudgetCount +
    budgetingCriticalVariances +
    qualityCriticalAlerts +
    maintenanceCriticalAlerts +
    riskCriticalAlerts +
    riskOverdueMitigations +
    schedulingCriticalDelays;
  const totalExceptions = overdueInvoices + overBudgetCount + lowStockCount + budgetingCriticalVariances + riskOverdueMitigations + schedulingCriticalDelays;
  const systemHealth = Math.max(0, 100 - failedOutbox * 5 - overdueInvoices * 2 - budgetingCriticalVariances - riskCriticalAlerts - schedulingCriticalDelays);

  const [salesTrendRows, expenseTrendRows, outboxPending, outboxPublished] = await Promise.all([
    prisma.invoice.findMany({
      where: { ...branchFilter, type: 'SALES', status: { in: ['ISSUED', 'PAID', 'PARTIAL'] }, date: { gte: filters.dateFrom, lte: filters.dateTo } },
      orderBy: { date: 'asc' },
      select: { date: true, total: true }
    }),
    prisma.invoice.findMany({
      where: { ...branchFilter, type: 'PURCHASE', status: { in: ['ISSUED', 'PAID', 'PARTIAL'] }, date: { gte: filters.dateFrom, lte: filters.dateTo } },
      orderBy: { date: 'asc' },
      select: { date: true, total: true }
    }),
    prisma.outboxEvent.count({ where: { ...branchFilter, status: 'PENDING' } }),
    prisma.outboxEvent.count({ where: { ...branchFilter, status: 'PUBLISHED' } })
  ]);

  const alerts: DashboardAlertItem[] = [];
  if (failedOutbox > 0) alerts.push({ key: 'outbox-failed', title: 'فشل في مزامنة الأحداث', message: `${failedOutbox} حدث فشل في النشر ويحتاج retry.`, severity: 'danger', route: '#/systems/control-center' });
  if (lowStockCount > 0) alerts.push({ key: 'low-stock', title: 'مواد تحت الحد الأدنى', message: `${lowStockCount} صنفًا يحتاج تدخلًا من المخزون/المشتريات.`, severity: 'warning', route: '#/systems/inventory' });
  if (overBudgetCount > 0) alerts.push({ key: 'project-overrun', title: 'مشاريع تجاوزت الميزانية', message: `${overBudgetCount} مشروعًا تجاوز الحد المخطط.`, severity: 'warning', route: '#/systems/projects' });
  if (budgetingCriticalVariances > 0) {
    alerts.push({
      key: 'budgeting-variance',
      title: 'انحرافات موازنة حرجة',
      message: `يوجد ${budgetingCriticalVariances} انحرافًا عالي الشدة في نظام الموازنات.`,
      severity: 'danger',
      route: '#/systems/budgeting/variance'
    });
  }
  if (qualityCriticalAlerts > 0) {
    alerts.push({
      key: 'quality-critical',
      title: 'تنبيهات جودة وسلامة',
      message: `يوجد ${qualityCriticalAlerts} حادث سلامة عالي الشدة مفتوح.`,
      severity: 'danger',
      route: '#/systems/quality/incidents'
    });
  }
  if (maintenanceCriticalAlerts > 0) {
    alerts.push({
      key: 'maintenance-critical',
      title: 'أعطال صيانة حرجة',
      message: `يوجد ${maintenanceCriticalAlerts} عطل صيانة عالي الخطورة مفتوح.`,
      severity: 'warning',
      route: '#/systems/maintenance/failures'
    });
  }
  if (riskCriticalAlerts + riskOverdueMitigations > 0) {
    alerts.push({
      key: 'risk-critical',
      title: 'مخاطر مؤسسية حرجة',
      message: `يوجد ${riskCriticalAlerts} خطرًا عالي الشدة و${riskOverdueMitigations} خطة تخفيف متأخرة.`,
      severity: 'danger',
      route: '#/systems/risk/heatmap'
    });
  }
  if (schedulingCriticalDelays > 0) {
    alerts.push({
      key: 'scheduling-critical-delay',
      title: 'تأخير على المسار الحرج',
      message: `يوجد ${schedulingCriticalDelays} مهمة حرجة متأخرة عن الجدول.`,
      severity: 'danger',
      route: '#/systems/scheduling/critical-path'
    });
  }

  return {
    summary: [
      { key: 'pending-approvals', label: 'اعتمادات موحدة معلقة', value: pendingApprovals, tone: pendingApprovals ? 'warning' : 'positive', route: '#/approvals' },
      { key: 'live-events', label: 'أحداث حية حديثة', value: recentOutbox.length, route: '#/systems/control-center' },
      { key: 'critical-alerts', label: 'تنبيهات حرجة', value: totalCriticalAlerts, tone: failedOutbox || budgetingCriticalVariances || riskCriticalAlerts || schedulingCriticalDelays ? 'danger' : 'warning', route: '#/systems/control-center' },
      { key: 'exceptions', label: 'مركز الاستثناءات', value: totalExceptions, route: '#/systems/control-center' },
      { key: 'system-health', label: 'صحة المنصة', value: `${systemHealth}%`, tone: systemHealth >= 90 ? 'positive' : 'warning', route: '#/systems/control-center' },
      { key: 'work-queues', label: 'المهام المفتوحة', value: openTasks + unreadNotifications, route: '#/systems/control-center' }
    ],
    queues: [
      { key: 'approval-queue', label: 'اعتمادات بانتظار القرار', count: pendingApprovals, route: '#/approvals' },
      { key: 'budgeting-queue', label: 'اعتمادات الموازنات', count: budgetingPendingApprovals, route: '#/systems/budgeting/scenarios' },
      { key: 'quality-queue', label: 'اعتمادات الجودة', count: qualityPendingApprovals, route: '#/systems/quality/inspections' },
      { key: 'maintenance-queue', label: 'أوامر صيانة معلقة', count: maintenancePendingOrders, route: '#/systems/maintenance/orders' },
      { key: 'tender-queue', label: 'عطاءات بانتظار الاعتماد', count: tendersPending, route: '#/systems/tendering' },
      { key: 'subcontract-queue', label: 'مستخلصات مقاولي باطن', count: subcontractIpcsPending, route: '#/systems/subcontractors' },
      { key: 'task-queue', label: 'مهام تشغيلية مفتوحة', count: openTasks, route: '#/tasks' },
      { key: 'notifications-queue', label: 'تنبيهات غير مقروءة', count: unreadNotifications, route: '#/notifications' }
    ],
    activity: [
      ...recentOutbox.map((row) => ({
        key: `event-${row.id}`,
        title: row.eventType,
        subtitle: `${row.aggregateType}#${row.aggregateId}`,
        date: row.occurredAt.toISOString(),
        status: row.status,
        route: '#/systems/control-center'
      })),
      ...recentTasks.map((row) => ({
        key: `task-${row.id}`,
        title: row.title,
        subtitle: row.priority,
        date: row.updatedAt.toISOString(),
        status: row.status,
        route: '#/tasks'
      })),
      ...recentAudits.map((row) => ({
        key: `audit-${row.id}`,
        title: `${row.action} على ${row.table}`,
        subtitle: `سجل ${row.recordId ?? '-'}`,
        date: row.createdAt.toISOString(),
        status: 'AUDITED',
        route: '#/audit-log'
      }))
    ]
      .sort((left, right) => String(right.date ?? '').localeCompare(String(left.date ?? '')))
      .slice(0, 12),
    alerts: alerts.length ? alerts : buildEmptyAlerts(),
    charts: [
      { key: 'control-sales-trend', title: 'المبيعات', kind: 'line', series: mapAmountByMonth(salesTrendRows.map((row) => ({ date: row.date, amount: toNumber(row.total) }))) },
      { key: 'control-expense-trend', title: 'المصروفات', kind: 'bar', series: mapAmountByMonth(expenseTrendRows.map((row) => ({ date: row.date, amount: toNumber(row.total) }))) },
      { key: 'outbox-status', title: 'حالة ناقل الأحداث', kind: 'donut', series: [{ label: 'Pending', value: outboxPending }, { label: 'Published', value: outboxPublished }, { label: 'Failed', value: failedOutbox }] }
    ]
  };
}

async function buildDashboardBundle(key: SystemDashboardKey, filters: DashboardFilters): Promise<SystemDashboardBundle> {
  switch (key) {
    case 'accounting':
      return buildAccountingBundle(filters);
    case 'crm':
      return buildCrmBundle(filters);
    case 'hr':
      return buildHrBundle(filters);
    case 'printing':
      return buildPrintingBundle(filters);
    case 'control-center':
      return buildControlCenterBundle(filters);
    case 'projects':
      return buildProjectsBundle(filters);
    case 'procurement':
      return buildProcurementBundle(filters);
    case 'inventory':
      return buildInventoryBundle(filters);
    case 'assets':
      return buildAssetsBundle(filters);
    case 'documents':
      return buildDocumentsBundle(filters);
    case 'contracts':
      return buildContractsBundle(filters);
    case 'subcontractors':
      return buildSubcontractorsBundle(filters);
    case 'site-ops':
      return buildSiteOpsBundle(filters);
    case 'quality':
      return buildQualityBundle(filters);
    case 'maintenance':
      return buildMaintenanceBundle(filters);
    case 'tendering':
      return buildTenderingBundle(filters);
    case 'budgeting':
      return buildBudgetingBundle(filters);
    case 'risk':
      return buildRiskBundle(filters);
    case 'scheduling':
      return buildSchedulingBundle(filters);
    case 'analytics':
      return buildAnalyticsBundle(filters);
    default:
      return buildSkeletonBundle(key);
  }
}

export function parseDashboardFilters(query: Record<string, unknown>): DashboardFilters {
  const now = new Date();
  const defaultFrom = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const dateFrom = parseDate(query.dateFrom ?? query.fromDate, defaultFrom);
  const dateTo = parseDate(query.dateTo ?? query.toDate, now);
  return {
    branchId: parsePositiveInt(query.branchId),
    projectId: parsePositiveInt(query.projectId),
    dateFrom: dateFrom <= dateTo ? dateFrom : dateTo,
    dateTo: dateTo >= dateFrom ? dateTo : dateFrom
  };
}

export async function getSystemDashboardSummary(key: SystemDashboardKey, filters: DashboardFilters): Promise<DashboardSummaryItem[]> {
  return (await buildDashboardBundle(key, filters)).summary;
}

export async function getSystemDashboardQueues(key: SystemDashboardKey, filters: DashboardFilters): Promise<DashboardQueueItem[]> {
  return (await buildDashboardBundle(key, filters)).queues;
}

export async function getSystemDashboardActivity(key: SystemDashboardKey, filters: DashboardFilters): Promise<DashboardActivityItem[]> {
  return (await buildDashboardBundle(key, filters)).activity;
}

export async function getSystemDashboardAlerts(key: SystemDashboardKey, filters: DashboardFilters): Promise<DashboardAlertItem[]> {
  return (await buildDashboardBundle(key, filters)).alerts;
}

export async function getSystemDashboardCharts(key: SystemDashboardKey, filters: DashboardFilters): Promise<DashboardChart[]> {
  return (await buildDashboardBundle(key, filters)).charts;
}
