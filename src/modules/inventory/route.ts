import { Router, type Request } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { PERMISSIONS } from '../../constants/permissions';
import { authenticate } from '../../middleware/auth';
import { audit } from '../../middleware/audit';
import { requirePermissions } from '../../middleware/rbac';
import { validateBody } from '../../middleware/validate';
import type { AuthRequest } from '../../types/auth';
import { Errors, ok } from '../../utils/response';
import {
  approveStockCount,
  consumeStockReservation,
  createInventoryMovement,
  createStockReservation,
  deleteInventoryMovement,
  getStockReservation,
  listStockReservations,
  releaseStockReservation,
  updateInventoryMovement
} from './service';
import { createStockTransfer, listStockTransfers } from './transfer-service';

const router = Router();

const movementSchema = z
  .object({
    date: z.string().optional(),
    type: z.string().trim().min(1),
    reference: z.string().trim().max(80).optional(),
    itemId: z.coerce.number().int().positive(),
    branchId: z.coerce.number().int().positive().optional(),
    projectId: z.coerce.number().int().positive().optional(),
    warehouseId: z.coerce.number().int().positive(),
    locationId: z.coerce.number().int().positive().optional(),
    quantity: z.coerce.number().refine((value) => Math.abs(value) > 0.000001, 'quantity يجب ألا يساوي صفر'),
    unitCost: z.coerce.number().nonnegative().optional(),
    totalCost: z.coerce.number().optional(),
    notes: z.string().trim().optional()
  })
  .strict();

const idParamSchema = z.object({ id: z.coerce.number().int().positive() }).strict();
const stockCountCreateSchema = z
  .object({
    number: z.string().trim().min(1),
    date: z.string().optional(),
    branchId: z.coerce.number().int().positive().optional(),
    warehouseId: z.coerce.number().int().positive(),
    status: z.string().trim().min(1).optional(),
    notes: z.string().trim().optional()
  })
  .strict();

const reservationCreateSchema = z
  .object({
    reference: z.string().trim().max(120).optional(),
    sourceType: z.string().trim().max(50).optional(),
    sourceId: z.coerce.number().int().positive().optional(),
    itemId: z.coerce.number().int().positive(),
    warehouseId: z.coerce.number().int().positive(),
    locationId: z.coerce.number().int().positive().optional(),
    branchId: z.coerce.number().int().positive().optional(),
    projectId: z.coerce.number().int().positive().optional(),
    quantity: z.coerce.number().positive(),
    status: z.string().trim().min(1).optional(),
    reservedAt: z.string().optional(),
    notes: z.string().trim().optional()
  })
  .strict();

const reservationStatusSchema = z
  .object({
    releasedAt: z.string().optional(),
    notes: z.string().trim().optional()
  })
  .strict();

function parsePagination(query: Request['query']) {
  const page = Math.max(1, Number(query.page ?? 1));
  const limit = Math.min(200, Math.max(1, Number(query.limit ?? 20)));
  return { page, limit, skip: (page - 1) * limit };
}

function parseId(params: Request['params']) {
  return idParamSchema.parse(params).id;
}

router.use(authenticate);

router.get('/items', requirePermissions(PERMISSIONS.INVENTORY_READ), async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const [rows, total] = await Promise.all([
      prisma.item.findMany({
        skip,
        take: limit,
        orderBy: { id: 'desc' },
        include: {
          category: { select: { nameAr: true } },
          unit: { select: { code: true, nameAr: true } }
        }
      }),
      prisma.item.count()
    ]);
    ok(res, rows, { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) });
  } catch (error) {
    next(error);
  }
});

router.get('/stock-reservations', requirePermissions(PERMISSIONS.INVENTORY_READ), async (req, res, next) => {
  try {
    ok(res, await listStockReservations(req.query));
  } catch (error) {
    next(error);
  }
});

router.get('/stock-reservations/:id', requirePermissions(PERMISSIONS.INVENTORY_READ), async (req, res, next) => {
  try {
    const id = parseId(req.params);
    ok(res, await getStockReservation(id));
  } catch (error) {
    next(error);
  }
});

router.post(
  '/stock-reservations',
  requirePermissions(PERMISSIONS.INVENTORY_WRITE),
  validateBody(reservationCreateSchema),
  audit('stock_reservations'),
  async (req, res, next) => {
    try {
      ok(res, await createStockReservation(req.body), undefined, 201);
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/stock-reservations/:id/release',
  requirePermissions(PERMISSIONS.INVENTORY_WRITE),
  validateBody(reservationStatusSchema),
  audit('stock_reservations'),
  async (req, res, next) => {
    try {
      const id = parseId(req.params);
      ok(res, await releaseStockReservation(id, req.body));
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/stock-reservations/:id/consume',
  requirePermissions(PERMISSIONS.INVENTORY_WRITE),
  validateBody(reservationStatusSchema),
  audit('stock_reservations'),
  async (req, res, next) => {
    try {
      const id = parseId(req.params);
      ok(res, await consumeStockReservation(id, req.body));
    } catch (error) {
      next(error);
    }
  }
);

router.get('/stock-counts', requirePermissions(PERMISSIONS.INVENTORY_READ), async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const [rows, total] = await Promise.all([
      prisma.stockCount.findMany({ skip, take: limit, orderBy: { id: 'desc' } }),
      prisma.stockCount.count()
    ]);
    ok(res, rows, { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) });
  } catch (error) {
    next(error);
  }
});

router.get('/stock-counts/:id', requirePermissions(PERMISSIONS.INVENTORY_READ), async (req, res, next) => {
  try {
    const id = parseId(req.params);
    const [header, lines] = await Promise.all([
      prisma.stockCount.findUnique({ where: { id } }),
      prisma.stockCountLine.findMany({ where: { stockCountId: id }, orderBy: { id: 'asc' } })
    ]);
    ok(res, { ...header, lines });
  } catch (error) {
    next(error);
  }
});

router.post('/stock-counts/:id/approve', requirePermissions(PERMISSIONS.INVENTORY_WRITE), audit('stock_counts'), async (req: AuthRequest, res, next) => {
  try {
    const id = parseId(req.params);
    const userId = Number(req.user?.id ?? 0);
    if (!userId) {
      throw Errors.unauthorized();
    }
    ok(res, await approveStockCount(id, userId));
  } catch (error) {
    next(error);
  }
});

router.post(
  '/stock-counts',
  requirePermissions(PERMISSIONS.INVENTORY_WRITE),
  validateBody(stockCountCreateSchema),
  audit('stock_counts'),
  async (req, res, next) => {
    try {
      const payload = req.body ?? {};
      const date = payload.date ? new Date(String(payload.date)) : undefined;
      const created = await prisma.stockCount.create({
        data: {
          number: String(payload.number).trim(),
          date,
          branchId: payload.branchId ?? undefined,
          warehouseId: Number(payload.warehouseId),
          status: payload.status ?? 'DRAFT',
          notes: payload.notes ?? undefined
        }
      });
      ok(res, created, undefined, 201);
    } catch (error) {
      next(error);
    }
  }
);

router.get('/stock-movements', requirePermissions(PERMISSIONS.INVENTORY_READ), async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const [rows, total] = await Promise.all([
      prisma.stockMovement.findMany({ skip, take: limit, orderBy: { id: 'desc' } }),
      prisma.stockMovement.count()
    ]);
    ok(res, rows, { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) });
  } catch (error) {
    next(error);
  }
});

router.post('/stock-movements', requirePermissions(PERMISSIONS.INVENTORY_WRITE), validateBody(movementSchema), audit('stock_movements'), async (req, res, next) => {
  try {
    ok(res, await createInventoryMovement(req.body), undefined, 201);
  } catch (error) {
    next(error);
  }
});

router.put('/stock-movements/:id', requirePermissions(PERMISSIONS.INVENTORY_WRITE), validateBody(movementSchema.partial()), audit('stock_movements'), async (req, res, next) => {
  try {
    ok(res, await updateInventoryMovement(Number(req.params.id), req.body));
  } catch (error) {
    next(error);
  }
});

router.delete('/stock-movements/:id', requirePermissions(PERMISSIONS.INVENTORY_WRITE), audit('stock_movements'), async (req, res, next) => {
  try {
    ok(res, await deleteInventoryMovement(Number(req.params.id)));
  } catch (error) {
    next(error);
  }
});

const transferSchema = z
  .object({
    date: z.string().optional(),
    reference: z.string().trim().max(80).optional(),
    itemId: z.coerce.number().int().positive(),
    sourceWarehouseId: z.coerce.number().int().positive(),
    sourceLocationId: z.coerce.number().int().positive().optional(),
    targetWarehouseId: z.coerce.number().int().positive(),
    targetLocationId: z.coerce.number().int().positive().optional(),
    quantity: z.coerce.number().positive(),
    unitCost: z.coerce.number().nonnegative().optional(),
    notes: z.string().trim().optional(),
    branchId: z.coerce.number().int().positive().optional(),
    projectId: z.coerce.number().int().positive().optional()
  })
  .strict();

router.get('/stock-transfers', requirePermissions(PERMISSIONS.INVENTORY_READ), async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page ?? 1));
    const limit = Math.min(200, Math.max(1, Number(req.query.limit ?? 20)));
    ok(res, await listStockTransfers(page, limit));
  } catch (error) {
    next(error);
  }
});

router.post('/stock-transfers', requirePermissions(PERMISSIONS.INVENTORY_WRITE), validateBody(transferSchema), audit('stock_transfers'), async (req: any, res, next) => {
  try {
    ok(res, await createStockTransfer(req.body, Number(req.user.id)), undefined, 201);
  } catch (error) {
    next(error);
  }
});

export default router;
