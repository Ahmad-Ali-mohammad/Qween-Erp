import { Router } from 'express';
import { qw } from '../../utils/where';
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
import { buildSystemDashboardRouter } from '../system-dashboards/route';

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
router.use('/dashboard', buildSystemDashboardRouter('assets'));

router.get('/categories', requirePermissions(PERMISSIONS.ASSETS_READ), async (_req, res) => {
  const rows = await prisma.orm.public.AssetCategory.orderBy((r) => r.id.desc()).all();
  ok(res, rows);
});

router.post('/categories', requirePermissions(PERMISSIONS.ASSETS_WRITE), validateBody(categorySchema), audit('asset_categories'), async (req, res) => {
  const row = await prisma.orm.public.AssetCategory.create(req.body);
  ok(res, row, undefined, 201);
});

router.put('/categories/:id', requirePermissions(PERMISSIONS.ASSETS_WRITE), validateBody(categorySchema.partial()), audit('asset_categories'), async (req, res) => {
  const row = await prisma.orm.public.AssetCategory.where((r) => qw(r, { id: Number(req.params.id) })).update(req.body).then((r0) => r0!);
  ok(res, row);
});

router.get('/', requirePermissions(PERMISSIONS.ASSETS_READ), async (_req, res) => {
  const rows = await prisma.orm.public.FixedAsset.include('category').orderBy((r) => r.id.desc()).all();
  ok(res, rows);
});

router.post('/', requirePermissions(PERMISSIONS.ASSETS_WRITE), validateBody(assetSchema), audit('fixed_assets'), async (req, res) => {
  const category = await prisma.orm.public.AssetCategory.first((r) => qw(r, { id: req.body.categoryId }));
  if (!category) throw Errors.notFound('فئة الأصل غير موجودة');

  const row = await prisma.orm.public.FixedAsset.create({
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
    });

  ok(res, row, undefined, 201);
});

router.get('/:id', requirePermissions(PERMISSIONS.ASSETS_READ), async (req, res) => {
  const row = await prisma.orm.public.FixedAsset.include('category').include('depreciationSchedule', (inc) => inc.orderBy([(r) => r.fiscalYear.desc(), (r) => r.period.desc()])).first((r) => qw(r, { id: Number(req.params.id) }));
  ok(res, row);
});

router.put('/:id', requirePermissions(PERMISSIONS.ASSETS_WRITE), validateBody(assetSchema.partial()), audit('fixed_assets'), async (req, res) => {
  const data = { ...req.body } as any;
  if (data.purchaseDate) data.purchaseDate = new Date(data.purchaseDate);
  const row = await prisma.orm.public.FixedAsset.where((r) => qw(r, { id: Number(req.params.id) })).update(data).then((r0) => r0!);
  ok(res, row);
});

router.delete('/:id', requirePermissions(PERMISSIONS.ASSETS_WRITE), audit('fixed_assets'), async (req, res) => {
  const id = Number(req.params.id);
  const schedules = await prisma.orm.public.DepreciationSchedule.where((r) => qw(r, { assetId: id })).aggregate((a) => ({ n: a.count() })).then((r0) => r0.n);
  if (schedules > 0) {
    const row = await prisma.orm.public.FixedAsset.where((r) => qw(r, { id })).update({ status: 'SCRAPPED', isDepreciating: false }).then((r0) => r0!);
    ok(res, { archived: true, asset: row });
    return;
  }
  await prisma.orm.public.FixedAsset.where((r) => qw(r, { id })).delete().then((r0) => r0!);
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
