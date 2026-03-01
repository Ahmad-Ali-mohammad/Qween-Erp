import { Router } from 'express';
import { prisma } from '../../config/database';
import { authenticate } from '../../middleware/auth';
import { requirePermissions } from '../../middleware/rbac';
import { PERMISSIONS } from '../../constants/permissions';
import { ok } from '../../utils/response';

const router = Router();
router.use(authenticate, requirePermissions(PERMISSIONS.TAX_READ));

router.get('/', async (_req, res) => {
  const rows = await prisma.taxCode.findMany({ orderBy: { id: 'desc' } });
  ok(res, rows);
});

router.get('/:id', async (req, res) => {
  const row = await prisma.taxCode.findUnique({ where: { id: Number(req.params.id) } });
  ok(res, row);
});

router.post('/', requirePermissions(PERMISSIONS.TAX_WRITE), async (req, res) => {
  const row = await prisma.taxCode.create({ data: req.body });
  ok(res, row, undefined, 201);
});

router.put('/:id', requirePermissions(PERMISSIONS.TAX_WRITE), async (req, res) => {
  const row = await prisma.taxCode.update({ where: { id: Number(req.params.id) }, data: req.body });
  ok(res, row);
});

router.delete('/:id', requirePermissions(PERMISSIONS.TAX_WRITE), async (req, res) => {
  await prisma.taxCode.delete({ where: { id: Number(req.params.id) } });
  ok(res, { deleted: true });
});

export default router;
