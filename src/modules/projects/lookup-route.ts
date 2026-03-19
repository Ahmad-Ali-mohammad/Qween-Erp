import { Router } from 'express';
import { prisma } from '../../config/database';
import { PERMISSIONS } from '../../constants/permissions';
import { authenticate } from '../../middleware/auth';
import { requirePermissions } from '../../middleware/rbac';
import { ok } from '../../utils/response';

const router = Router();

router.use(authenticate);

router.get('/', requirePermissions(PERMISSIONS.PROJECTS_READ), async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page ?? 1));
    const limit = Math.min(200, Math.max(1, Number(req.query.limit ?? 50)));
    const skip = (page - 1) * limit;

    const [rows, total] = await Promise.all([
      prisma.project.findMany({ skip, take: limit, orderBy: { id: 'desc' } }),
      prisma.project.count()
    ]);

    ok(res, rows, {
      page,
      limit,
      total,
      pages: Math.max(1, Math.ceil(total / limit))
    });
  } catch (error) {
    next(error);
  }
});

export default router;
