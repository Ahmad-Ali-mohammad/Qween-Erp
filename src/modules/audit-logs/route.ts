import { Router } from 'express';
import { qw } from '../../utils/where';
import { prisma } from '../../config/database';
import { authenticate } from '../../middleware/auth';
import { requirePermissions } from '../../middleware/rbac';
import { PERMISSIONS } from '../../constants/permissions';
import { ok } from '../../utils/response';

const router = Router();
router.use(authenticate, requirePermissions(PERMISSIONS.AUDIT_READ));

router.get('/', async (req, res) => {
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 50);
  const skip = (page - 1) * limit;
  const table = req.query.table ? String(req.query.table) : undefined;

  const where = table ? { table } : {};

  const [rows, total] = await Promise.all([
    prisma.orm.public.AuditLog.where((r) => qw(r, where)).include('user').orderBy((r) => r.createdAt.desc()).offset(skip).limit(limit).all(),
    prisma.orm.public.AuditLog.where((r) => qw(r, where)).aggregate((a) => ({ n: a.count() })).then((r0) => r0.n)
  ]);

  ok(res, rows, {
    page,
    limit,
    total,
    pages: Math.max(1, Math.ceil(total / limit))
  });
});

export default router;
