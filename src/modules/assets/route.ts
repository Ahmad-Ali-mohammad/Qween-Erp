import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { authenticate } from '../../middleware/auth';
import { requirePermissions } from '../../middleware/rbac';
import { validateBody } from '../../middleware/validate';
import { PERMISSIONS } from '../../constants/permissions';
import { audit } from '../../middleware/audit';
import { ok, Errors } from '../../utils/response';
import { runDepreciation } from '../depreciation/service';
import { disposeAsset } from './disposal-service';

const categorySchema = z.object({
  code: z.string().min(1),
  nameAr: z.string().min(2),
  nameEn: z.string().optional(),
  depreciationMethod: z.string().optional(),
  usefulLifeMonths: z.number().int().positive(),
  salvagePercent: z.number().nonnegative().optional(),
  glAssetId: z.number().int().optional(),
  glAccumulatedId: z.number().int().optional(),
  glExpenseId: z.number().int().optional(),
  isActive: z.boolean().optional()
});

const assetSchema = z.object({
  code: z.string().min(1),
  nameAr: z.string().min(2),
  nameEn: z.string().optional(),
  categoryId: z.number().int(),
  purchaseDate: z.string().optional(),
  purchaseCost: z.number().positive(),
  supplierId: z.number().int().optional(),
  usefulLifeMonths: z.number().int().optional(),
  depreciationMethod: z.string().optional(),
  salvageValue: z.number().nonnegative().optional(),
  location: z.string().optional(),
  departmentId: z.number().int().optional(),
  notes: z.string().optional()
});

const depreciationRunSchema = z.object({
  fiscalYear: z.number().int(),
  period: z.number().int().min(1).max(12)
});

const disposeSchema = z.object({
  salePrice: z.number().nonnegative().optional(),
  reason: z.string().optional(),
  disposedAt: z.string().optional(),
  proceedsAccountId: z.number().int().optional()
});

const router = Router();
router.use(authenticate);

router.get('/categories', requirePermissions(PERMISSIONS.ASSETS_READ), async (_req, res) => {
  const rows = await prisma.assetCategory.findMany({ orderBy: { id: 'desc' } });
  ok(res, rows);
});

router.post('/categories', requirePermissions(PERMISSIONS.ASSETS_WRITE), validateBody(categorySchema), audit('asset_categories'), async (req, res) => {
  const row = await prisma.assetCategory.create({ data: req.body });
  ok(res, row, undefined, 201);
});

router.put('/categories/:id', requirePermissions(PERMISSIONS.ASSETS_WRITE), validateBody(categorySchema.partial()), audit('asset_categories'), async (req, res) => {
  const row = await prisma.assetCategory.update({ where: { id: Number(req.params.id) }, data: req.body });
  ok(res, row);
});

router.get('/', requirePermissions(PERMISSIONS.ASSETS_READ), async (_req, res) => {
  const rows = await prisma.fixedAsset.findMany({ include: { category: true }, orderBy: { id: 'desc' } });
  ok(res, rows);
});

router.post('/', requirePermissions(PERMISSIONS.ASSETS_WRITE), validateBody(assetSchema), audit('fixed_assets'), async (req, res) => {
  const category = await prisma.assetCategory.findUnique({ where: { id: req.body.categoryId } });
  if (!category) throw Errors.notFound('فئة الأصل غير موجودة');

  const row = await prisma.fixedAsset.create({
    data: {
      ...req.body,
      purchaseDate: req.body.purchaseDate ? new Date(req.body.purchaseDate) : new Date(),
      usefulLifeMonths: req.body.usefulLifeMonths ?? category.usefulLifeMonths,
      depreciationMethod: req.body.depreciationMethod ?? category.depreciationMethod,
      salvageValue: req.body.salvageValue ?? 0,
      depreciationStart: req.body.purchaseDate ? new Date(req.body.purchaseDate) : new Date(),
      accumulatedDepreciation: 0,
      netBookValue: req.body.purchaseCost,
      status: 'ACTIVE',
      isDepreciating: true
    }
  });

  ok(res, row, undefined, 201);
});

router.get('/:id', requirePermissions(PERMISSIONS.ASSETS_READ), async (req, res) => {
  const row = await prisma.fixedAsset.findUnique({
    where: { id: Number(req.params.id) },
    include: { category: true, depreciationSchedule: { orderBy: [{ fiscalYear: 'desc' }, { period: 'desc' }] } }
  });
  ok(res, row);
});

router.put('/:id', requirePermissions(PERMISSIONS.ASSETS_WRITE), validateBody(assetSchema.partial()), audit('fixed_assets'), async (req, res) => {
  const data = { ...req.body } as any;
  if (data.purchaseDate) data.purchaseDate = new Date(data.purchaseDate);
  const row = await prisma.fixedAsset.update({ where: { id: Number(req.params.id) }, data });
  ok(res, row);
});

router.delete('/:id', requirePermissions(PERMISSIONS.ASSETS_WRITE), audit('fixed_assets'), async (req, res) => {
  const id = Number(req.params.id);
  const schedules = await prisma.depreciationSchedule.count({ where: { assetId: id } });
  if (schedules > 0) {
    const row = await prisma.fixedAsset.update({ where: { id }, data: { status: 'SCRAPPED', isDepreciating: false } });
    ok(res, { archived: true, asset: row });
    return;
  }
  await prisma.fixedAsset.delete({ where: { id } });
  ok(res, { deleted: true });
});

router.post('/:id/dispose', requirePermissions(PERMISSIONS.ASSETS_WRITE), validateBody(disposeSchema), audit('fixed_assets'), async (req, res) => {
  const id = Number(req.params.id);
  const data = await disposeAsset({
    assetId: id,
    userId: Number((req as any).user.id),
    salePrice: req.body.salePrice,
    reason: req.body.reason,
    disposedAt: req.body.disposedAt,
    proceedsAccountId: req.body.proceedsAccountId
  });
  ok(res, data);
});

router.post('/depreciation/run', requirePermissions(PERMISSIONS.ASSETS_WRITE), validateBody(depreciationRunSchema), audit('depreciation_schedule'), async (req, res) => {
  const data = await runDepreciation({
    fiscalYear: Number(req.body.fiscalYear),
    period: Number(req.body.period),
    userId: Number((req as any).user.id),
    description: req.body.description
  });
  ok(res, data);
});

export default router;
