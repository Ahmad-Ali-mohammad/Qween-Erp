import { Router } from 'express';
import { qw } from '../../utils/where';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { authenticate } from '../../middleware/auth';
import { requirePermissions } from '../../middleware/rbac';
import { validateBody } from '../../middleware/validate';
import { PERMISSIONS } from '../../constants/permissions';
import { audit } from '../../middleware/audit';
import { ok, Errors } from '../../utils/response';

const customerSchema = z.object({
  code: z.string().min(1),
  nameAr: z.string().min(2),
  nameEn: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  mobile: z.string().optional(),
  city: z.string().optional(),
  address: z.string().optional(),
  paymentTerms: z.number().int().optional(),
  creditLimit: z.number().nonnegative().optional(),
  vatNumber: z.string().optional(),
  taxNumber: z.string().optional()
});

const supplierSchema = customerSchema.extend({
  bankName: z.string().optional(),
  bankAccount: z.string().optional(),
  iban: z.string().optional()
});

const contactBaseSchema = z.object({
  customerId: z.number().int().optional(),
  supplierId: z.number().int().optional(),
  name: z.string().min(2),
  position: z.string().optional(),
  phone: z.string().optional(),
  mobile: z.string().optional(),
  email: z.string().email().optional(),
  isPrimary: z.boolean().optional()
});

const contactSchema = contactBaseSchema.refine((data) => Boolean(data.customerId) !== Boolean(data.supplierId), {
  message: 'يجب تحديد عميل أو مورد (واحد فقط)'
});

const contactUpdateSchema = contactBaseSchema.partial().refine((data) => {
  if (!data.customerId && !data.supplierId) return true;
  return Boolean(data.customerId) !== Boolean(data.supplierId);
}, {
  message: 'يجب تحديد عميل أو مورد (واحد فقط)'
});

const router = Router();
router.use(authenticate, requirePermissions(PERMISSIONS.PARTIES_READ));

router.get('/customers', async (_req, res) => {
  const rows = await prisma.orm.public.Customer.orderBy((r) => r.id.desc()).all();
  ok(res, rows);
});

router.post('/customers', requirePermissions(PERMISSIONS.PARTIES_WRITE), validateBody(customerSchema), audit('customers'), async (req, res) => {
  const row = await prisma.orm.public.Customer.create(req.body);
  ok(res, row, undefined, 201);
});

router.get('/customers/:id', async (req, res) => {
  const row = await prisma.orm.public.Customer.include('contacts').first((r) => qw(r, { id: Number(req.params.id) }));
  if (!row) throw Errors.notFound('العميل غير موجود');
  ok(res, row);
});

router.put('/customers/:id', requirePermissions(PERMISSIONS.PARTIES_WRITE), validateBody(customerSchema.partial()), audit('customers'), async (req, res) => {
  const row = await prisma.orm.public.Customer.where((r) => qw(r, { id: Number(req.params.id) })).update(req.body).then((r0) => r0!);
  ok(res, row);
});

router.delete('/customers/:id', requirePermissions(PERMISSIONS.PARTIES_WRITE), audit('customers'), async (req, res) => {
  await prisma.orm.public.Customer.where((r) => qw(r, { id: Number(req.params.id) })).delete().then((r0) => r0!);
  ok(res, { deleted: true });
});

router.get('/suppliers', async (_req, res) => {
  const rows = await prisma.orm.public.Supplier.orderBy((r) => r.id.desc()).all();
  ok(res, rows);
});

router.post('/suppliers', requirePermissions(PERMISSIONS.PARTIES_WRITE), validateBody(supplierSchema), audit('suppliers'), async (req, res) => {
  const row = await prisma.orm.public.Supplier.create(req.body);
  ok(res, row, undefined, 201);
});

router.get('/suppliers/:id', async (req, res) => {
  const row = await prisma.orm.public.Supplier.include('contacts').first((r) => qw(r, { id: Number(req.params.id) }));
  if (!row) throw Errors.notFound('المورد غير موجود');
  ok(res, row);
});

router.put('/suppliers/:id', requirePermissions(PERMISSIONS.PARTIES_WRITE), validateBody(supplierSchema.partial()), audit('suppliers'), async (req, res) => {
  const row = await prisma.orm.public.Supplier.where((r) => qw(r, { id: Number(req.params.id) })).update(req.body).then((r0) => r0!);
  ok(res, row);
});

router.delete('/suppliers/:id', requirePermissions(PERMISSIONS.PARTIES_WRITE), audit('suppliers'), async (req, res) => {
  await prisma.orm.public.Supplier.where((r) => qw(r, { id: Number(req.params.id) })).delete().then((r0) => r0!);
  ok(res, { deleted: true });
});

router.get('/contacts', async (_req, res) => {
  const rows = await prisma.orm.public.Contact.include('customer').include('supplier').orderBy((r) => r.id.desc()).all();
  ok(res, rows);
});

router.post('/contacts', requirePermissions(PERMISSIONS.PARTIES_WRITE), validateBody(contactSchema), audit('contacts'), async (req, res) => {
  const row = await prisma.orm.public.Contact.create(req.body);
  ok(res, row, undefined, 201);
});

router.put('/contacts/:id', requirePermissions(PERMISSIONS.PARTIES_WRITE), validateBody(contactUpdateSchema), audit('contacts'), async (req, res) => {
  const row = await prisma.orm.public.Contact.where((r) => qw(r, { id: Number(req.params.id) })).update(req.body).then((r0) => r0!);
  ok(res, row);
});

router.delete('/contacts/:id', requirePermissions(PERMISSIONS.PARTIES_WRITE), audit('contacts'), async (req, res) => {
  await prisma.orm.public.Contact.where((r) => qw(r, { id: Number(req.params.id) })).delete().then((r0) => r0!);
  ok(res, { deleted: true });
});

export default router;
