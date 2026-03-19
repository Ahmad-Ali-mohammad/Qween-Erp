import { prisma } from '../../config/database';
import { Errors } from '../../utils/response';

export async function getFinancialKPIs() {
  const [totalRevenue, totalExpenses, outstandingReceivables, outstandingPayables] = await Promise.all([
    prisma.invoice.aggregate({
      where: { type: 'SALES', status: { not: 'CANCELLED' } },
      _sum: { total: true }
    }),
    prisma.invoice.aggregate({
      where: { type: 'PURCHASE', status: { not: 'CANCELLED' } },
      _sum: { total: true }
    }),
    prisma.customer.aggregate({ _sum: { currentBalance: true } }),
    prisma.supplier.aggregate({ _sum: { currentBalance: true } })
  ]);

  const revenue = Number(totalRevenue._sum.total ?? 0);
  const expenses = Number(totalExpenses._sum.total ?? 0);
  const receivables = Number(outstandingReceivables._sum.currentBalance ?? 0);
  const payables = Number(outstandingPayables._sum.currentBalance ?? 0);

  return {
    revenue,
    expenses,
    grossProfit: revenue - expenses,
    grossMargin: revenue > 0 ? ((revenue - expenses) / revenue) * 100 : 0,
    outstandingReceivables: receivables,
    outstandingPayables: payables,
    netWorkingCapital: receivables - payables
  };
}

export async function getInventoryKPIs() {
  const [totalItems, totalValue, lowStockItems, movementsThisMonth] = await Promise.all([
    prisma.item.count(),
    prisma.stockBalance.aggregate({ _sum: { value: true } }),
    prisma.stockBalance.count({ where: { quantity: { lte: 10 } } }),
    prisma.stockMovement.count({
      where: { createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } }
    })
  ]);

  return {
    totalItems,
    totalInventoryValue: Number(totalValue._sum.value ?? 0),
    lowStockItems,
    movementsThisMonth,
    averageInventoryPerItem: totalItems > 0 ? Number(totalValue._sum.value ?? 0) / totalItems : 0
  };
}

export async function getProjectKPIs() {
  const [activeProjects, totalBudget, totalExpenses, completedProjects] = await Promise.all([
    prisma.project.count({ where: { status: 'ACTIVE' } }),
    prisma.project.aggregate({ _sum: { budget: true } }),
    prisma.projectExpense.aggregate({ _sum: { amount: true } }),
    prisma.project.count({ where: { status: 'COMPLETED' } })
  ]);

  const budget = Number(totalBudget._sum.budget ?? 0);
  const expenses = Number(totalExpenses._sum.amount ?? 0);

  return {
    activeProjects,
    completedProjects,
    totalBudget: budget,
    totalExpenses: expenses,
    budgetUtilization: budget > 0 ? (expenses / budget) * 100 : 0,
    averageProjectValue: (activeProjects + completedProjects) > 0 ? budget / (activeProjects + completedProjects) : 0
  };
}

export async function getSalesTrend(periods = 12) {
  // Calculate date range for the requested periods
  const endDate = new Date();
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - periods);

  // Use raw query for date truncation and aggregation
  // This is more efficient than loading all records into memory
  const monthlyData = await prisma.$queryRaw<Array<{ month: string; total: bigint }>>`
    SELECT 
      DATE_TRUNC('month', date) as month,
      SUM(total) as total
    FROM invoices
    WHERE type = 'SALES' 
      AND status != 'CANCELLED'
      AND date >= ${startDate}
      AND date <= ${endDate}
    GROUP BY DATE_TRUNC('month', date)
    ORDER BY month ASC
  `;

  const trend = monthlyData.map(row => ({
    period: new Date(row.month).toISOString().slice(0, 7), // YYYY-MM format
    amount: Number(row.total)
  }));

  const values = trend.map(t => t.amount);
  const avg = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;

  return {
    trend,
    average: avg,
    growth: values.length >= 2
      ? ((values[values.length - 1] - values[0]) / (values[0] || 1)) * 100
      : 0
  };
}

export async function getTopCustomers(limit = 10) {
  // Use raw query to aggregate revenue by customer from invoices
  // This is more accurate than using currentBalance (which may include unpaid amounts)
  const customerRevenue = await prisma.$queryRaw<Array<{
    customer_id: number;
    code: string;
    name_ar: string;
    total_revenue: bigint
  }>>`
    SELECT 
      c.id as customer_id,
      c.code,
      c.name_ar,
      SUM(i.total) as total_revenue
    FROM customers c
    JOIN invoices i ON i.customer_id = c.id
    WHERE i.type = 'SALES' 
      AND i.status != 'CANCELLED'
    GROUP BY c.id, c.code, c.name_ar
    ORDER BY total_revenue DESC
    LIMIT ${limit}
  `;

  const total = customerRevenue.reduce((sum, c) => sum + Number(c.total_revenue), 0);

  return {
    totalRevenue: total,
    customers: customerRevenue.map(c => ({
      id: c.customer_id,
      code: c.code,
      nameAr: c.name_ar,
      revenue: Number(c.total_revenue),
      contribution: total > 0 ? (Number(c.total_revenue) / total) * 100 : 0
    }))
  };
}

export async function createReportSnapshot(reportType: string, parameters: any, userId: number) {
  const snapshot = await prisma.reportSnapshot.create({
    data: {
      reportType,
      parameters,
      status: 'QUEUED',
      createdBy: userId
    }
  });

  return {
    success: true,
    message: 'تم إنشاء التقرير بنجاح',
    data: snapshot
  };
}

export async function listReportSnapshots(page = 1, limit = 20) {
  const skip = (page - 1) * limit;

  const [rows, total] = await Promise.all([
    prisma.reportSnapshot.findMany({
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' }
    }),
    prisma.reportSnapshot.count()
  ]);

  return {
    rows,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) }
  };
}

export async function generateDashboardSummary() {
  const [financial, inventory, projects, salesTrend] = await Promise.all([
    getFinancialKPIs(),
    getInventoryKPIs(),
    getProjectKPIs(),
    getSalesTrend(6)
  ]);

  return {
    generatedAt: new Date().toISOString(),
    financial,
    inventory,
    projects,
    salesTrend,
    alerts: generateAlerts(financial, inventory, projects)
  };
}

function generateAlerts(financial: any, inventory: any, projects: any) {
  const alerts = [];

  if (financial.grossMargin < 20) {
    alerts.push({ type: 'WARNING', message: 'هامش الربح منخفض (< 20%)', metric: 'grossMargin' });
  }

  if (inventory.lowStockItems > 10) {
    alerts.push({ type: 'WARNING', message: `(${inventory.lowStockItems}) أصناف بمخزون منخفض`, metric: 'lowStock' });
  }

  if (projects.budgetUtilization > 90) {
    alerts.push({ type: 'DANGER', message: 'استهلاك الميزانية تجاوز 90%', metric: 'budget' });
  }

  if (financial.outstandingReceivables > financial.revenue * 0.3) {
    alerts.push({ type: 'WARNING', message: 'الذمم المدينة مرتفعة', metric: 'receivables' });
  }

  return alerts;
}
