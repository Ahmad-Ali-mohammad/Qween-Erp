import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { env } from '../../config/env';
import { authenticate } from '../../middleware/auth';
import { requirePermissions } from '../../middleware/rbac';
import { validateBody } from '../../middleware/validate';
import { PERMISSIONS } from '../../constants/permissions';
import { ok, Errors } from '../../utils/response';

const createSchema = z.object({
  username: z.string().min(3),
  email: z.string().email(),
  fullName: z.string().min(1),
  password: z.string().min(6),
  roleId: z.number().int().positive(),
  defaultBranchId: z.number().int().positive().nullable().optional(),
  phone: z.string().optional(),
  position: z.string().optional()
});

const updateSchema = createSchema.partial();

const router = Router();
router.use(authenticate, requirePermissions(PERMISSIONS.USERS_READ));

router.get('/', async (_req, res) => {
  const users = await prisma.user.findMany({
    include: {
      role: true,
      defaultBranch: { select: { id: true, code: true, nameAr: true, nameEn: true } }
    },
    orderBy: { id: 'desc' }
  });
  ok(res, users);
});

router.post('/', requirePermissions(PERMISSIONS.USERS_WRITE), validateBody(createSchema), async (req, res, next) => {
  try {
    const exists = await prisma.user.findFirst({ where: { OR: [{ username: req.body.username }, { email: req.body.email }] } });
    if (exists) throw Errors.conflict('اسم المستخدم أو البريد موجود بالفعل');

    const password = await bcrypt.hash(req.body.password, env.bcryptRounds);
    const user = await prisma.user.create({
      data: {
        ...req.body,
        password
      }
    });

    ok(res, user, undefined, 201);
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: Number(req.params.id) },
      include: {
        role: true,
        defaultBranch: { select: { id: true, code: true, nameAr: true, nameEn: true } },
        branchAccesses: true,
        projectAccesses: true,
        warehouseAccesses: true
      }
    });
    if (!user) throw Errors.notFound('المستخدم غير موجود');
    ok(res, user);
  } catch (error) {
    next(error);
  }
});

router.get('/:id/branches', async (req, res, next) => {
  try {
    const userId = Number(req.params.id);
    const rows = await prisma.userBranchAccess.findMany({
      where: { userId },
      include: { branch: true },
      orderBy: { id: 'desc' }
    });
    ok(res, rows);
  } catch (error) {
    next(error);
  }
});

router.get('/:id/warehouses', async (req, res, next) => {
  try {
    const userId = Number(req.params.id);
    const rows = await prisma.userWarehouseAccess.findMany({
      where: { userId },
      include: { warehouse: true },
      orderBy: { id: 'desc' }
    });
    ok(res, rows);
  } catch (error) {
    next(error);
  }
});

router.put('/:id', requirePermissions(PERMISSIONS.USERS_WRITE), validateBody(updateSchema), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const data = { ...req.body } as any;
    if (data.password) data.password = await bcrypt.hash(data.password, env.bcryptRounds);
    const user = await prisma.user.update({ where: { id }, data });
    ok(res, user);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', requirePermissions(PERMISSIONS.USERS_WRITE), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    await prisma.user.delete({ where: { id } });
    ok(res, { id, deleted: true });
  } catch (error) {
    next(error);
  }
});

export default router;
