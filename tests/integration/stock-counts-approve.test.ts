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

describe('Stock counts approval', () => {
  beforeAll(async () => {
    await ensureAdminUser();
  });

  it('approves stock count, creates movements, updates balances, and posts balanced journal', async () => {
    const token = await loginAdmin();
    const txDate = new Date();
    await ensureOpenPeriodFor(txDate);

    await prisma.systemSettings.upsert({
      where: { id: 1 },
      update: { postingAccounts: {} },
      create: { id: 1, postingAccounts: {} }
    });

    const warehouse = await prisma.warehouse.create({
      data: {
        code: uniqueCode('WH'),
        nameAr: 'مستودع اختبار الجرد'
      }
    });

    const item = await prisma.item.create({
      data: {
        code: uniqueCode('ITM'),
        nameAr: 'صنف اختبار الجرد',
        onHandQty: 5,
        inventoryValue: 50
      }
    });

    const stockCount = await prisma.stockCount.create({
      data: {
        number: uniqueCode('SC'),
        date: txDate,
        warehouseId: warehouse.id,
        status: 'DRAFT'
      }
    });

    await prisma.stockCountLine.create({
      data: {
        stockCountId: stockCount.id,
        itemId: item.id,
        theoreticalQty: 5,
        actualQty: 8,
        unitCost: 10
      }
    });

    const res = await request(app)
      .post(`/api/stock-counts/${stockCount.id}/approve`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('APPROVED');

    const movements = await prisma.stockMovement.findMany({ where: { reference: stockCount.number } });
    expect(movements.length).toBeGreaterThan(0);
    expect(Number(movements[0].quantity)).toBe(3);

    const balance = await prisma.stockBalance.findFirst({
      where: { itemId: item.id, warehouseId: warehouse.id, locationId: null }
    });
    expect(balance).toBeTruthy();
    expect(Number(balance!.quantity)).toBe(3);
    expect(Number(balance!.value)).toBe(30);

    const entry = await prisma.journalEntry.findFirst({
      where: { reference: stockCount.number, status: 'POSTED' },
      orderBy: { id: 'desc' },
      include: { lines: true }
    });
    expect(entry).toBeTruthy();
    const debit = entry!.lines.reduce((s, l) => s + Number(l.debit), 0);
    const credit = entry!.lines.reduce((s, l) => s + Number(l.credit), 0);
    expect(Math.abs(debit - credit)).toBeLessThan(0.000001);
  });
});
