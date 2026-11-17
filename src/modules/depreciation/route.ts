import { Router } from 'express';
import { prisma } from '../../config/database';
import { authenticate } from '../../middleware/auth';
import { requirePermissions } from '../../middleware/rbac';
import { PERMISSIONS } from '../../constants/permissions';
import { ok } from '../../utils/response';
import { runDepreciation } from './service';

const router = Router();
router.use(authenticate, requirePermissions(PERMISSIONS.ASSETS_READ));

router.get('/', async (_req, res) => {
  const rows = await prisma.orm.public.DepreciationSchedule.include('asset').orderBy([(r) => r.fiscalYear.desc(), (r) => r.period.desc()]).all();
  ok(res, rows);
});

router.post('/run', requirePermissions(PERMISSIONS.ASSETS_WRITE), async (req, res) => {
  const data = await runDepreciation({
    fiscalYear: Number(req.body.fiscalYear),
    period: Number(req.body.period),
    userId: Number((req as any).user.id),
    description: req.body.description
  });
  ok(res, data);
});

export default router;
