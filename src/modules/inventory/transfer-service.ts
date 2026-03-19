import { prisma } from '../../config/database';
import { Errors } from '../../utils/response';

export type StockTransferInput = {
  date?: string;
  reference?: string;
  itemId: number;
  sourceWarehouseId: number;
  sourceLocationId?: number;
  targetWarehouseId: number;
  targetLocationId?: number;
  quantity: number;
  unitCost?: number;
  notes?: string;
  branchId?: number;
  projectId?: number;
};

function parseDateOrThrow(value: string, fieldName: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw Errors.validation(`${fieldName} غير صالح`);
  }
  return date;
}

export async function createStockTransfer(input: StockTransferInput, userId: number) {
  const date = input.date ? parseDateOrThrow(input.date, 'date') : new Date();
  const quantity = Number(input.quantity);

  if (quantity <= 0) {
    throw Errors.validation('الكمية يجب أن تكون أكبر من صفر');
  }

  if (input.sourceWarehouseId === input.targetWarehouseId) {
    throw Errors.validation('المستودع المصدر والوجهة يجب أن يكونان مختلفين');
  }

  const [item, sourceWarehouse, targetWarehouse] = await Promise.all([
    prisma.item.findUnique({ where: { id: input.itemId } }),
    prisma.warehouse.findUnique({ where: { id: input.sourceWarehouseId } }),
    prisma.warehouse.findUnique({ where: { id: input.targetWarehouseId } })
  ]);

  if (!item) throw Errors.notFound('الصنف غير موجود');
  if (!sourceWarehouse) throw Errors.notFound('المستودع المصدر غير موجود');
  if (!targetWarehouse) throw Errors.notFound('المستودع الوجهة غير موجود');

  const result = await prisma.$transaction(async (tx) => {
    // Move balance check inside transaction to prevent race condition
    const sourceBalance = await tx.stockBalance.findUnique({
      where: {
        itemId_warehouseId_locationId: {
          itemId: input.itemId,
          warehouseId: input.sourceWarehouseId,
          locationId: (input.sourceLocationId ?? null) as any
        }
      }
    });

    const availableQty = Number(sourceBalance?.quantity ?? 0);
    if (availableQty < quantity) {
      throw Errors.business(`الرصيد المتاح (${availableQty}) غير كافٍ للتحويل (${quantity})`);
    }

    const reference = input.reference || `TR-${Date.now()}`;

    const sourceMovement = await tx.stockMovement.create({
      data: {
        date,
        type: 'TRANSFER_OUT',
        reference: `${reference}-OUT`,
        itemId: input.itemId,
        warehouseId: input.sourceWarehouseId,
        locationId: input.sourceLocationId ?? null,
        branchId: input.branchId ?? null,
        projectId: input.projectId ?? null,
        quantity: -quantity,
        unitCost: input.unitCost ?? 0,
        totalCost: (input.unitCost ?? 0) * quantity,
        notes: input.notes
      }
    });

    const targetMovement = await tx.stockMovement.create({
      data: {
        date,
        type: 'TRANSFER_IN',
        reference: `${reference}-IN`,
        itemId: input.itemId,
        warehouseId: input.targetWarehouseId,
        locationId: input.targetLocationId ?? null,
        branchId: input.branchId ?? null,
        projectId: input.projectId ?? null,
        quantity,
        unitCost: input.unitCost ?? 0,
        totalCost: (input.unitCost ?? 0) * quantity,
        notes: input.notes
      }
    });

    await updateStockBalance(tx, input.itemId, input.sourceWarehouseId, input.sourceLocationId ?? null);
    await updateStockBalance(tx, input.itemId, input.targetWarehouseId, input.targetLocationId ?? null);

    await tx.auditLog.create({
      data: {
        userId,
        table: 'stock_transfers',
        recordId: sourceMovement.id,
        action: 'CREATE',
        newValue: { sourceMovement, targetMovement }
      }
    });

    return { sourceMovement, targetMovement };
  });

  return {
    success: true,
    message: 'تم إنشاء التحويل بنجاح',
    data: result
  };
}

async function updateStockBalance(
  tx: any,
  itemId: number,
  warehouseId: number,
  locationId: number | null
) {
  const movements = await tx.stockMovement.findMany({
    where: { itemId, warehouseId, locationId }
  });

  const totalQty = movements.reduce((sum: number, m: any) => sum + Number(m.quantity), 0);
  const totalCost = movements.reduce((sum: number, m: any) => sum + Number(m.totalCost), 0);
  const avgCost = totalQty > 0 ? totalCost / totalQty : 0;

  await tx.stockBalance.upsert({
    where: {
      itemId_warehouseId_locationId: { itemId, warehouseId, locationId }
    },
    update: {
      quantity: totalQty,
      value: totalCost,
      avgCost
    },
    create: {
      itemId,
      warehouseId,
      locationId,
      quantity: totalQty,
      value: totalCost,
      avgCost
    }
  });
}

export async function listStockTransfers(page = 1, limit = 20) {
  const skip = (page - 1) * limit;

  const movements = await prisma.stockMovement.findMany({
    where: { type: { in: ['TRANSFER_IN', 'TRANSFER_OUT'] } },
    skip,
    take: limit,
    orderBy: { id: 'desc' }
  });

  const total = await prisma.stockMovement.count({
    where: { type: { in: ['TRANSFER_IN', 'TRANSFER_OUT'] } }
  });

  return {
    rows: movements,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) }
  };
}
