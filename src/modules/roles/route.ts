import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { authenticate } from '../../middleware/auth';
import { requirePermissions } from '../../middleware/rbac';
import { validateBody } from '../../middleware/validate';
import { PERMISSIONS } from '../../constants/permissions';
import { ok } from '../../utils/response';

const schema = z.object({
  name: z.string().min(2),
  nameAr: z.string().min(2),
  description: z.string().optional(),
  permissions: z.record(z.boolean())
});

const router = Router();
router.use(authenticate, requirePermissions(PERMISSIONS.ROLES_READ));

router.get('/', async (_req, res) => {
  const roles = await prisma.role.findMany({ orderBy: { id: 'desc' } });
  ok(res, roles);
});

router.post('/', requirePermissions(PERMISSIONS.ROLES_WRITE), validateBody(schema), async (req, res, next) => {
  try {
    const role = await prisma.role.create({ data: req.body });
    ok(res, role, undefined, 201);
  } catch (error) {
    next(error);
  }
});

router.put('/:id', requirePermissions(PERMISSIONS.ROLES_WRITE), validateBody(schema.partial()), async (req, res, next) => {
  try {
    const role = await prisma.role.update({ where: { id: Number(req.params.id) }, data: req.body });
    ok(res, role);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', requirePermissions(PERMISSIONS.ROLES_WRITE), async (req, res, next) => {
  try {
    await prisma.role.delete({ where: { id: Number(req.params.id) } });
    ok(res, { deleted: true });
  } catch (error) {
    next(error);
  }
});

export default router;
