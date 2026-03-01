import { Router } from 'express';
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
    prisma.auditLog.findMany({
      where,
      include: { user: true },
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' }
    }),
    prisma.auditLog.count({ where })
  ]);

  ok(res, rows, {
    page,
    limit,
    total,
    pages: Math.max(1, Math.ceil(total / limit))
  });
});

export default router;
