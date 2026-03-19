import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { PERMISSIONS } from '../../constants/permissions';
import { audit } from '../../middleware/audit';
import { authenticate } from '../../middleware/auth';
import { requirePermissions } from '../../middleware/rbac';
import { validateBody } from '../../middleware/validate';
import { AuthRequest } from '../../types/auth';
import { assertBranchScopeAccess, assertProjectScopeAccess, getScopeIds } from '../../utils/access-scope';
import { Errors, ok } from '../../utils/response';
import * as service from './service';

const router = Router();

const subcontractorSchema = z
  .object({
    code: z.string().trim().min(1).max(50).optional(),
    nameAr: z.string().trim().min(1).max(200),
    nameEn: z.string().trim().max(200).optional(),
    phone: z.string().trim().max(50).optional(),
    email: z.string().trim().email().max(200).optional(),
    specialty: z.string().trim().max(120).optional(),
    licenseNumber: z.string().trim().max(120).optional(),
    rating: z.coerce.number().min(0).max(5).optional(),
    status: z.string().trim().max(40).optional(),
    notes: z.string().trim().optional()
  })
  .strict();

const contractSchema = z
  .object({
    branchId: z.coerce.number().int().positive().optional(),
    projectId: z.coerce.number().int().positive().optional(),
    title: z.string().trim().min(1).max(200),
    scopeOfWork: z.string().trim().optional(),
    startDate: z.string(),
    endDate: z.string().optional(),
    amount: z.coerce.number().nonnegative().optional(),
    retentionRate: z.coerce.number().min(0).max(100).optional(),
    status: z.string().trim().max(40).optional(),
    terms: z.string().trim().optional()
  })
  .strict();

const workOrderSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().optional(),
    issueDate: z.string().optional(),
    amount: z.coerce.number().nonnegative().optional(),
    status: z.string().trim().max(40).optional()
  })
  .strict();

const changeOrderSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().optional(),
    amount: z.coerce.number().nonnegative(),
    requestedDate: z.string().optional(),
    status: z.string().trim().max(40).optional()
  })
  .strict();

const certificateSchema = z
  .object({
    periodFrom: z.string().optional(),
    periodTo: z.string().optional(),
    certificateDate: z.string().optional(),
    progressPercent: z.coerce.number().min(0).max(100).optional(),
    grossAmount: z.coerce.number().positive(),
    retentionAmount: z.coerce.number().nonnegative().optional(),
    notes: z.string().trim().optional()
  })
  .strict();

const paymentSchema = z
  .object({
    contractId: z.coerce.number().int().positive().optional(),
    certificateId: z.coerce.number().int().positive().optional(),
    paymentDate: z.string().optional(),
    amount: z.coerce.number().positive(),
    method: z.string().trim().max(80).optional(),
    reference: z.string().trim().max(120).optional(),
    notes: z.string().trim().optional()
  })
  .strict();

function parseId(raw: unknown, label = 'id') {
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw Errors.validation(`${label} غير صالح`);
  return value;
}

async function assertContractAccess(req: AuthRequest, id: number, mode: 'read' | 'write' = 'read') {
  const row = await prisma.subcontractContract.findUnique({
    where: { id },
    select: { id: true, branchId: true, projectId: true }
  });
  if (!row) throw Errors.notFound('عقد مقاول الباطن غير موجود');
  if (row.branchId) assertBranchScopeAccess(req, row.branchId, mode);
  if (row.projectId) assertProjectScopeAccess(req, row.projectId, mode);
  return row;
}

async function assertCertificateAccess(req: AuthRequest, id: number, mode: 'read' | 'write' = 'read') {
  const row = await prisma.subcontractCertificate.findUnique({
    where: { id },
    select: { id: true, branchId: true, projectId: true, contractId: true }
  });
  if (!row) throw Errors.notFound('المستخلص غير موجود');
  if (row.branchId) assertBranchScopeAccess(req, row.branchId, mode);
  if (row.projectId) assertProjectScopeAccess(req, row.projectId, mode);
  return row;
}

async function assertPaymentAccess(req: AuthRequest, id: number, mode: 'read' | 'write' = 'read') {
  const row = await prisma.subcontractPayment.findUnique({
    where: { id },
    select: { id: true, branchId: true, projectId: true }
  });
  if (!row) throw Errors.notFound('دفعة مقاول الباطن غير موجودة');
  if (row.branchId) assertBranchScopeAccess(req, row.branchId, mode);
  if (row.projectId) assertProjectScopeAccess(req, row.projectId, mode);
  return row;
}

router.use(authenticate);

router.get('/', requirePermissions(PERMISSIONS.SUBCONTRACT_READ), async (req, res, next) => {
  try {
    const data = await service.listSubcontractors(req.query);
    ok(res, data.rows, data.pagination);
  } catch (error) {
    next(error);
  }
});

router.post('/', requirePermissions(PERMISSIONS.SUBCONTRACT_WRITE), validateBody(subcontractorSchema), audit('subcontractors'), async (req, res, next) => {
  try {
    ok(res, await service.createSubcontractor(req.body), undefined, 201);
  } catch (error) {
    next(error);
  }
});

router.get('/reports/performance', requirePermissions(PERMISSIONS.SUBCONTRACT_READ), async (req: AuthRequest, res, next) => {
  try {
    if (req.query.branchId) assertBranchScopeAccess(req, Number(req.query.branchId));
    if (req.query.projectId) assertProjectScopeAccess(req, Number(req.query.projectId));
    ok(
      res,
      await service.getPerformanceReport(req.query, {
        branchIds: getScopeIds(req, 'branch'),
        projectIds: getScopeIds(req, 'project')
      })
    );
  } catch (error) {
    next(error);
  }
});

router.get('/contracts', requirePermissions(PERMISSIONS.SUBCONTRACT_READ), async (req: AuthRequest, res, next) => {
  try {
    if (req.query.branchId) assertBranchScopeAccess(req, Number(req.query.branchId));
    if (req.query.projectId) assertProjectScopeAccess(req, Number(req.query.projectId));
    const data = await service.listContracts(req.query, {
      branchIds: getScopeIds(req, 'branch'),
      projectIds: getScopeIds(req, 'project')
    });
    ok(res, data.rows, data.pagination);
  } catch (error) {
    next(error);
  }
});

router.get('/certificates', requirePermissions(PERMISSIONS.SUBCONTRACT_READ), async (req: AuthRequest, res, next) => {
  try {
    if (req.query.branchId) assertBranchScopeAccess(req, Number(req.query.branchId));
    if (req.query.projectId) assertProjectScopeAccess(req, Number(req.query.projectId));
    const data = await service.listCertificates(req.query, {
      branchIds: getScopeIds(req, 'branch'),
      projectIds: getScopeIds(req, 'project')
    });
    ok(res, data.rows, data.pagination);
  } catch (error) {
    next(error);
  }
});

router.get('/payments', requirePermissions(PERMISSIONS.SUBCONTRACT_READ), async (req: AuthRequest, res, next) => {
  try {
    if (req.query.branchId) assertBranchScopeAccess(req, Number(req.query.branchId));
    if (req.query.projectId) assertProjectScopeAccess(req, Number(req.query.projectId));
    const data = await service.listPayments(req.query, {
      branchIds: getScopeIds(req, 'branch'),
      projectIds: getScopeIds(req, 'project')
    });
    ok(res, data.rows, data.pagination);
  } catch (error) {
    next(error);
  }
});

router.get('/:id', requirePermissions(PERMISSIONS.SUBCONTRACT_READ), async (req, res, next) => {
  try {
    ok(res, await service.getSubcontractor(parseId(req.params.id)));
  } catch (error) {
    next(error);
  }
});

router.put('/:id', requirePermissions(PERMISSIONS.SUBCONTRACT_WRITE), validateBody(subcontractorSchema.partial()), audit('subcontractors'), async (req, res, next) => {
  try {
    ok(res, await service.updateSubcontractor(parseId(req.params.id), req.body));
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', requirePermissions(PERMISSIONS.SUBCONTRACT_WRITE), audit('subcontractors'), async (req, res, next) => {
  try {
    ok(res, await service.deleteSubcontractor(parseId(req.params.id)));
  } catch (error) {
    next(error);
  }
});

router.post('/:id/contracts', requirePermissions(PERMISSIONS.SUBCONTRACT_WRITE), validateBody(contractSchema), audit('subcontract_contracts'), async (req: AuthRequest, res, next) => {
  try {
    if (req.body.branchId) assertBranchScopeAccess(req, req.body.branchId, 'write');
    if (req.body.projectId) assertProjectScopeAccess(req, req.body.projectId, 'write');
    ok(
      res,
      await service.createContract({ ...req.body, subcontractorId: parseId(req.params.id, 'subcontractorId') }),
      undefined,
      201
    );
  } catch (error) {
    next(error);
  }
});

router.get('/contracts/:id', requirePermissions(PERMISSIONS.SUBCONTRACT_READ), async (req: AuthRequest, res, next) => {
  try {
    await assertContractAccess(req, parseId(req.params.id));
    ok(res, await service.getContract(parseId(req.params.id)));
  } catch (error) {
    next(error);
  }
});

router.put('/contracts/:id', requirePermissions(PERMISSIONS.SUBCONTRACT_WRITE), validateBody(contractSchema.partial()), audit('subcontract_contracts'), async (req: AuthRequest, res, next) => {
  try {
    await assertContractAccess(req, parseId(req.params.id), 'write');
    if (req.body.branchId) assertBranchScopeAccess(req, req.body.branchId, 'write');
    if (req.body.projectId) assertProjectScopeAccess(req, req.body.projectId, 'write');
    ok(res, await service.updateContract(parseId(req.params.id), req.body));
  } catch (error) {
    next(error);
  }
});

router.delete('/contracts/:id', requirePermissions(PERMISSIONS.SUBCONTRACT_WRITE), audit('subcontract_contracts'), async (req: AuthRequest, res, next) => {
  try {
    await assertContractAccess(req, parseId(req.params.id), 'write');
    ok(res, await service.deleteContract(parseId(req.params.id)));
  } catch (error) {
    next(error);
  }
});

router.post('/contracts/:id/work-orders', requirePermissions(PERMISSIONS.SUBCONTRACT_WRITE), validateBody(workOrderSchema), audit('subcontract_work_orders'), async (req: AuthRequest, res, next) => {
  try {
    await assertContractAccess(req, parseId(req.params.id), 'write');
    ok(res, await service.createWorkOrder(parseId(req.params.id), req.body), undefined, 201);
  } catch (error) {
    next(error);
  }
});

router.get('/contracts/:id/work-orders', requirePermissions(PERMISSIONS.SUBCONTRACT_READ), async (req: AuthRequest, res, next) => {
  try {
    await assertContractAccess(req, parseId(req.params.id));
    const contract = await service.getContract(parseId(req.params.id));
    ok(res, contract.workOrders);
  } catch (error) {
    next(error);
  }
});

router.post('/contracts/:id/change-orders', requirePermissions(PERMISSIONS.SUBCONTRACT_WRITE), validateBody(changeOrderSchema), audit('subcontract_change_orders'), async (req: AuthRequest, res, next) => {
  try {
    await assertContractAccess(req, parseId(req.params.id), 'write');
    ok(res, await service.createChangeOrder(parseId(req.params.id), req.body), undefined, 201);
  } catch (error) {
    next(error);
  }
});

router.get('/contracts/:id/change-orders', requirePermissions(PERMISSIONS.SUBCONTRACT_READ), async (req: AuthRequest, res, next) => {
  try {
    await assertContractAccess(req, parseId(req.params.id));
    const contract = await service.getContract(parseId(req.params.id));
    ok(res, contract.changeOrders);
  } catch (error) {
    next(error);
  }
});

router.post('/change-orders/:id/approve', requirePermissions(PERMISSIONS.SUBCONTRACT_WRITE), audit('subcontract_change_orders'), async (req: AuthRequest, res, next) => {
  try {
    const current = await prisma.subcontractChangeOrder.findUnique({
      where: { id: parseId(req.params.id) },
      select: { contractId: true, branchId: true, projectId: true }
    });
    if (!current) throw Errors.notFound('أمر التغيير غير موجود');
    if (current.branchId) assertBranchScopeAccess(req, current.branchId, 'write');
    if (current.projectId) assertProjectScopeAccess(req, current.projectId, 'write');
    ok(res, await service.approveChangeOrder(parseId(req.params.id)));
  } catch (error) {
    next(error);
  }
});

router.post('/contracts/:id/certificates', requirePermissions(PERMISSIONS.SUBCONTRACT_WRITE), validateBody(certificateSchema), audit('subcontract_certificates'), async (req: AuthRequest, res, next) => {
  try {
    await assertContractAccess(req, parseId(req.params.id), 'write');
    ok(res, await service.createCertificate(parseId(req.params.id), req.body), undefined, 201);
  } catch (error) {
    next(error);
  }
});

router.get('/contracts/:id/certificates', requirePermissions(PERMISSIONS.SUBCONTRACT_READ), async (req: AuthRequest, res, next) => {
  try {
    await assertContractAccess(req, parseId(req.params.id));
    const contract = await service.getContract(parseId(req.params.id));
    ok(res, contract.certificates);
  } catch (error) {
    next(error);
  }
});

router.get('/certificates/:id', requirePermissions(PERMISSIONS.SUBCONTRACT_READ), async (req: AuthRequest, res, next) => {
  try {
    await assertCertificateAccess(req, parseId(req.params.id));
    ok(res, await service.getCertificate(parseId(req.params.id)));
  } catch (error) {
    next(error);
  }
});

router.put('/certificates/:id', requirePermissions(PERMISSIONS.SUBCONTRACT_WRITE), validateBody(certificateSchema.partial()), audit('subcontract_certificates'), async (req: AuthRequest, res, next) => {
  try {
    await assertCertificateAccess(req, parseId(req.params.id), 'write');
    ok(res, await service.updateCertificate(parseId(req.params.id), req.body));
  } catch (error) {
    next(error);
  }
});

router.post('/certificates/:id/approve', requirePermissions(PERMISSIONS.SUBCONTRACT_WRITE), audit('subcontract_certificates'), async (req: AuthRequest, res, next) => {
  try {
    await assertCertificateAccess(req, parseId(req.params.id), 'write');
    ok(res, await service.approveCertificate(parseId(req.params.id)));
  } catch (error) {
    next(error);
  }
});

router.delete('/certificates/:id', requirePermissions(PERMISSIONS.SUBCONTRACT_WRITE), audit('subcontract_certificates'), async (req: AuthRequest, res, next) => {
  try {
    await assertCertificateAccess(req, parseId(req.params.id), 'write');
    ok(res, await service.deleteCertificate(parseId(req.params.id)));
  } catch (error) {
    next(error);
  }
});

router.post('/payments', requirePermissions(PERMISSIONS.SUBCONTRACT_WRITE), validateBody(paymentSchema), audit('subcontract_payments'), async (req: AuthRequest, res, next) => {
  try {
    if (req.body.contractId) await assertContractAccess(req, req.body.contractId, 'write');
    if (req.body.certificateId) await assertCertificateAccess(req, req.body.certificateId, 'write');
    ok(res, await service.createPayment(req.body), undefined, 201);
  } catch (error) {
    next(error);
  }
});

router.get('/payments/:id', requirePermissions(PERMISSIONS.SUBCONTRACT_READ), async (req: AuthRequest, res, next) => {
  try {
    await assertPaymentAccess(req, parseId(req.params.id));
    ok(res, await service.getPayment(parseId(req.params.id)));
  } catch (error) {
    next(error);
  }
});

export default router;
