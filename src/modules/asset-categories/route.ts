import { Router } from 'express';
import { qw } from '../../utils/where';
import { prisma } from '../../config/database';
import { authenticate } from '../../middleware/auth';
import { requirePermissions } from '../../middleware/rbac';
import { PERMISSIONS } from '../../constants/permissions';
import { ok } from '../../utils/response';

const router = Router();
router.use(authenticate, requirePermissions(PERMISSIONS.ASSETS_READ));

router.get('/', async (_req, res) => {
  const rows = await prisma.orm.public.AssetCategory.orderBy((r) => r.id.desc()).all();
  ok(res, rows);
});

router.get('/:id', async (req, res) => {
  const row = await prisma.orm.public.AssetCategory.first((r) => qw(r, { id: Number(req.params.id) }));
  ok(res, row);
});

router.post('/', requirePermissions(PERMISSIONS.ASSETS_WRITE), async (req, res) => {
  const row = await prisma.orm.public.AssetCategory.create(req.body);
  ok(res, row, undefined, 201);
});

router.put('/:id', requirePermissions(PERMISSIONS.ASSETS_WRITE), async (req, res) => {
  const row = await prisma.orm.public.AssetCategory.where((r) => qw(r, { id: Number(req.params.id) })).update(req.body).then((r0) => r0!);
  ok(res, row);
});

router.delete('/:id', requirePermissions(PERMISSIONS.ASSETS_WRITE), async (req, res) => {
  await prisma.orm.public.AssetCategory.where((r) => qw(r, { id: Number(req.params.id) })).delete().then((r0) => r0!);
  ok(res, { deleted: true });
});

export default router;
