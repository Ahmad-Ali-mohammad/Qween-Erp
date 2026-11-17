import { Router } from 'express';
import { qw } from '../../utils/where';
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
  const roles = await prisma.orm.public.Role.orderBy((r) => r.id.desc()).all();
  ok(res, roles);
});

router.post('/', requirePermissions(PERMISSIONS.ROLES_WRITE), validateBody(schema), async (req, res, next) => {
  try {
    const role = await prisma.orm.public.Role.create(req.body);
    ok(res, role, undefined, 201);
  } catch (error) {
    next(error);
  }
});

router.put('/:id', requirePermissions(PERMISSIONS.ROLES_WRITE), validateBody(schema.partial()), async (req, res, next) => {
  try {
    const role = await prisma.orm.public.Role.where((r) => qw(r, { id: Number(req.params.id) })).update(req.body).then((r0) => r0!);
    ok(res, role);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', requirePermissions(PERMISSIONS.ROLES_WRITE), async (req, res, next) => {
  try {
    await prisma.orm.public.Role.where((r) => qw(r, { id: Number(req.params.id) })).delete().then((r0) => r0!);
    ok(res, { deleted: true });
  } catch (error) {
    next(error);
  }
});

export default router;
