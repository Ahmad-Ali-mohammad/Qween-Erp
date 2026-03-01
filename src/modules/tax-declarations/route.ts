import { Router } from 'express';
import { prisma } from '../../config/database';
import { authenticate } from '../../middleware/auth';
import { requirePermissions } from '../../middleware/rbac';
import { PERMISSIONS } from '../../constants/permissions';
import { ok } from '../../utils/response';
import { payDeclaration, submitDeclaration } from './service';

const router = Router();
router.use(authenticate, requirePermissions(PERMISSIONS.TAX_READ));

router.get('/', async (_req, res) => {
  const rows = await prisma.taxDeclaration.findMany({ orderBy: { id: 'desc' } });
  ok(res, rows);
});

router.get('/:id', async (req, res) => {
  const row = await prisma.taxDeclaration.findUnique({ where: { id: Number(req.params.id) } });
  ok(res, row);
});

router.post('/', requirePermissions(PERMISSIONS.TAX_WRITE), async (req, res) => {
  const row = await prisma.taxDeclaration.create({
    data: {
      ...req.body,
      periodStart: new Date(req.body.periodStart),
      periodEnd: new Date(req.body.periodEnd),
      filedDate: req.body.filedDate ? new Date(req.body.filedDate) : null,
      paidDate: req.body.paidDate ? new Date(req.body.paidDate) : null
    }
  });
  ok(res, row, undefined, 201);
});

router.put('/:id', requirePermissions(PERMISSIONS.TAX_WRITE), async (req, res) => {
  const data = { ...req.body } as any;
  if (data.periodStart) data.periodStart = new Date(data.periodStart);
  if (data.periodEnd) data.periodEnd = new Date(data.periodEnd);
  if (data.filedDate) data.filedDate = new Date(data.filedDate);
  if (data.paidDate) data.paidDate = new Date(data.paidDate);

  const row = await prisma.taxDeclaration.update({ where: { id: Number(req.params.id) }, data });
  ok(res, row);
});

router.delete('/:id', requirePermissions(PERMISSIONS.TAX_WRITE), async (req, res) => {
  await prisma.taxDeclaration.delete({ where: { id: Number(req.params.id) } });
  ok(res, { deleted: true });
});

router.post('/:id/submit', requirePermissions(PERMISSIONS.TAX_WRITE), async (req: any, res) => {
  const result = await submitDeclaration({
    declarationId: Number(req.params.id),
    userId: Number(req.user.id),
    filedDate: req.body?.filedDate,
    filedReference: req.body?.filedReference
  });
  ok(res, { ...result.declaration, duplicate: result.duplicate });
});

router.post('/:id/pay', requirePermissions(PERMISSIONS.TAX_WRITE), async (req: any, res) => {
  const result = await payDeclaration({
    declarationId: Number(req.params.id),
    userId: Number(req.user.id),
    paidDate: req.body?.paidDate,
    paidReference: req.body?.paidReference,
    cashAccountId: req.body?.cashAccountId
  });
  ok(res, {
    ...result.declaration,
    duplicate: result.duplicate,
    journalEntryId: result.journalEntryId,
    journalEntryNumber: result.journalEntryNumber
  });
});

export default router;
