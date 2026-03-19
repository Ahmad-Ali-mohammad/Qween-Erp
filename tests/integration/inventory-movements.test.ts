import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/config/database';
import { ensureAdminUser, loginAdmin, uniqueCode } from './helpers';

describe('Inventory movement balance updates', () => {
  beforeAll(async () => {
    await ensureAdminUser();
  });

  it('updates stock balance and item totals for create/update/delete movement flows', async () => {
    const token = await loginAdmin();

    const warehouse = await prisma.warehouse.create({
      data: {
        code: uniqueCode('WH-MOV'),
        nameAr: 'مستودع حركة'
      }
    });

    const item = await prisma.item.create({
      data: {
        code: uniqueCode('ITM-MOV'),
        nameAr: 'صنف حركة',
        onHandQty: 0,
        inventoryValue: 0
      }
    });

    const createRes = await request(app)
      .post('/api/inventory-transactions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'ADJUSTMENT',
        reference: uniqueCode('MOV'),
        itemId: item.id,
        warehouseId: warehouse.id,
        quantity: 5,
        unitCost: 10,
        totalCost: 50
      });
    expect(createRes.status).toBe(201);
    const movementId = Number(createRes.body.data.id);

    let balance = await prisma.stockBalance.findFirst({
      where: { itemId: item.id, warehouseId: warehouse.id, locationId: null }
    });
    let refreshedItem = await prisma.item.findUnique({ where: { id: item.id } });
    expect(Number(balance!.quantity)).toBeCloseTo(5, 2);
    expect(Number(balance!.value)).toBeCloseTo(50, 2);
    expect(Number(refreshedItem!.onHandQty)).toBeCloseTo(5, 2);
    expect(Number(refreshedItem!.inventoryValue)).toBeCloseTo(50, 2);

    const updateRes = await request(app)
      .put(`/api/stock-movements/${movementId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        quantity: 3,
        unitCost: 10,
        totalCost: 30
      });
    expect(updateRes.status).toBe(200);

    balance = await prisma.stockBalance.findFirst({
      where: { itemId: item.id, warehouseId: warehouse.id, locationId: null }
    });
    refreshedItem = await prisma.item.findUnique({ where: { id: item.id } });
    expect(Number(balance!.quantity)).toBeCloseTo(3, 2);
    expect(Number(balance!.value)).toBeCloseTo(30, 2);
    expect(Number(refreshedItem!.onHandQty)).toBeCloseTo(3, 2);
    expect(Number(refreshedItem!.inventoryValue)).toBeCloseTo(30, 2);

    const deleteRes = await request(app)
      .delete(`/api/stock-movements/${movementId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(deleteRes.status).toBe(200);

    balance = await prisma.stockBalance.findFirst({
      where: { itemId: item.id, warehouseId: warehouse.id, locationId: null }
    });
    refreshedItem = await prisma.item.findUnique({ where: { id: item.id } });
    expect(Number(balance!.quantity)).toBeCloseTo(0, 2);
    expect(Number(balance!.value)).toBeCloseTo(0, 2);
    expect(Number(refreshedItem!.onHandQty)).toBeCloseTo(0, 2);
    expect(Number(refreshedItem!.inventoryValue)).toBeCloseTo(0, 2);

    await prisma.stockBalance.deleteMany({ where: { itemId: item.id, warehouseId: warehouse.id } });
    await prisma.item.delete({ where: { id: item.id } });
    await prisma.warehouse.delete({ where: { id: warehouse.id } });
  });
});
