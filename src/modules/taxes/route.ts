import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { authenticate } from '../../middleware/auth';
import { requirePermissions } from '../../middleware/rbac';
import { validateBody } from '../../middleware/validate';
import { PERMISSIONS } from '../../constants/permissions';
import { audit } from '../../middleware/audit';
import { ok } from '../../utils/response';

const codeSchema = z.object({
  code: z.string().min(1),
  nameAr: z.string().min(2),
  nameEn: z.string().optional(),
  type: z.enum(['VAT', 'WHT']),
  rate: z.number().nonnegative(),
  isRecoverable: z.boolean().optional(),
  glPayableId: z.number().int().optional(),
  glRecoverableId: z.number().int().optional(),
  isActive: z.boolean().optional()
});

const declarationSchema = z.object({
  periodStart: z.string(),
  periodEnd: z.string(),
  type: z.enum(['VAT', 'WHT']).optional(),
  totalSales: z.number().optional(),
  totalPurchases: z.number().optional(),
  outputTax: z.number().optional(),
  inputTax: z.number().optional(),
  netPayable: z.number().optional(),
  filedDate: z.string().optional(),
  filedReference: z.string().optional(),
  paidDate: z.string().optional(),
  paidReference: z.string().optional(),
  status: z.enum(['DRAFT', 'FILED', 'PAID', 'CANCELLED']).optional(),
  notes: z.string().optional()
});

const router = Router();
router.use(authenticate);

router.get('/codes', requirePermissions(PERMISSIONS.TAX_READ), async (_req, res) => {
  const rows = await prisma.taxCode.findMany({ orderBy: { id: 'desc' } });
  ok(res, rows);
});

router.post('/codes', requirePermissions(PERMISSIONS.TAX_WRITE), validateBody(codeSchema), audit('tax_codes'), async (req, res) => {
  const row = await prisma.taxCode.create({ data: req.body });
  ok(res, row, undefined, 201);
});

router.put('/codes/:id', requirePermissions(PERMISSIONS.TAX_WRITE), validateBody(codeSchema.partial()), audit('tax_codes'), async (req, res) => {
  const row = await prisma.taxCode.update({ where: { id: Number(req.params.id) }, data: req.body });
  ok(res, row);
});

router.delete('/codes/:id', requirePermissions(PERMISSIONS.TAX_WRITE), audit('tax_codes'), async (req, res) => {
  await prisma.taxCode.delete({ where: { id: Number(req.params.id) } });
  ok(res, { deleted: true });
});

router.get('/declarations', requirePermissions(PERMISSIONS.TAX_READ), async (_req, res) => {
  const rows = await prisma.taxDeclaration.findMany({ orderBy: { id: 'desc' } });
  ok(res, rows);
});

router.post('/declarations', requirePermissions(PERMISSIONS.TAX_WRITE), validateBody(declarationSchema), audit('tax_declarations'), async (req, res) => {
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

router.put('/declarations/:id', requirePermissions(PERMISSIONS.TAX_WRITE), validateBody(declarationSchema.partial()), audit('tax_declarations'), async (req, res) => {
  const data = { ...req.body } as any;
  if (data.periodStart) data.periodStart = new Date(data.periodStart);
  if (data.periodEnd) data.periodEnd = new Date(data.periodEnd);
  if (data.filedDate) data.filedDate = new Date(data.filedDate);
  if (data.paidDate) data.paidDate = new Date(data.paidDate);
  const row = await prisma.taxDeclaration.update({ where: { id: Number(req.params.id) }, data });
  ok(res, row);
});

router.delete('/declarations/:id', requirePermissions(PERMISSIONS.TAX_WRITE), audit('tax_declarations'), async (req, res) => {
  await prisma.taxDeclaration.delete({ where: { id: Number(req.params.id) } });
  ok(res, { deleted: true });
});

export default router;
