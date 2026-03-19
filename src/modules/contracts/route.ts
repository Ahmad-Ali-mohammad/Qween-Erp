import { Router } from 'express';
import { z } from 'zod';
import { PERMISSIONS } from '../../constants/permissions';
import { audit } from '../../middleware/audit';
import { authenticate } from '../../middleware/auth';
import { requirePermissions } from '../../middleware/rbac';
import { validateBody } from '../../middleware/validate';
import { ok } from '../../utils/response';
import * as service from '../crm/service';

const router = Router();

const contractSchema = z
  .object({
    number: z.string().trim().max(60).optional(),
    branchId: z.coerce.number().int().positive().optional(),
    title: z.string().trim().min(1).max(200),
    partyType: z.string().trim().min(1).max(50),
    partyId: z.coerce.number().int().positive().optional(),
    type: z.string().trim().max(50).optional(),
    startDate: z.string(),
    endDate: z.string().optional(),
    value: z.coerce.number().nonnegative().optional(),
    status: z.string().trim().max(50).optional(),
    terms: z.string().trim().optional()
  })
  .strict();

const contractConvertSchema = z
  .object({
    branchId: z.coerce.number().int().positive().optional(),
    code: z.string().trim().max(60).optional(),
    nameAr: z.string().trim().max(200).optional(),
    nameEn: z.string().trim().max(200).optional(),
    type: z.string().trim().max(50).optional(),
    status: z.string().trim().max(50).optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    budget: z.coerce.number().nonnegative().optional(),
    description: z.string().trim().optional()
  })
  .strict();

const opportunityConvertSchema = z
  .object({
    branchId: z.coerce.number().int().positive().optional(),
    title: z.string().trim().max(200).optional(),
    type: z.string().trim().max(50).optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    value: z.coerce.number().nonnegative().optional(),
    status: z.string().trim().max(50).optional(),
    terms: z.string().trim().optional()
  })
  .strict();

const milestoneSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    dueDate: z.string().optional(),
    amount: z.coerce.number().nonnegative().optional(),
    status: z.string().trim().max(50).optional(),
    notes: z.string().trim().optional()
  })
  .strict();

const amendmentSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    amendmentDate: z.string().optional(),
    valueChange: z.coerce.number().optional(),
    status: z.string().trim().max(50).optional(),
    notes: z.string().trim().optional(),
    createdBy: z.coerce.number().int().positive().optional()
  })
  .strict();

const alertSchema = z
  .object({
    alertType: z.string().trim().min(1).max(80),
    dueDate: z.string().optional(),
    message: z.string().trim().optional(),
    status: z.string().trim().max(50).optional()
  })
  .strict();

const alertResolveSchema = z
  .object({
    resolvedAt: z.string().optional(),
    status: z.string().trim().max(50).optional()
  })
  .strict();

router.use(authenticate);

router.get('/', requirePermissions(PERMISSIONS.CONTRACTS_READ), async (req, res, next) => {
  try {
    const data = await service.listContracts(req.query);
    ok(res, data.rows, data.pagination);
  } catch (error) {
    next(error);
  }
});

router.post('/', requirePermissions(PERMISSIONS.CONTRACTS_WRITE), validateBody(contractSchema), audit('contracts'), async (req, res, next) => {
  try {
    ok(res, await service.createContract(req.body), undefined, 201);
  } catch (error) {
    next(error);
  }
});

router.get('/:id', requirePermissions(PERMISSIONS.CONTRACTS_READ), async (req, res, next) => {
  try {
    ok(res, await service.getContract(Number(req.params.id)));
  } catch (error) {
    next(error);
  }
});

router.put('/:id', requirePermissions(PERMISSIONS.CONTRACTS_WRITE), validateBody(contractSchema.partial()), audit('contracts'), async (req, res, next) => {
  try {
    ok(res, await service.updateContract(Number(req.params.id), req.body));
  } catch (error) {
    next(error);
  }
});

router.post('/:id/approve', requirePermissions(PERMISSIONS.CONTRACTS_WRITE), audit('contracts'), async (req, res, next) => {
  try {
    ok(res, await service.approveContract(Number(req.params.id)));
  } catch (error) {
    next(error);
  }
});

router.get('/:id/milestones', requirePermissions(PERMISSIONS.CONTRACTS_READ), async (req, res, next) => {
  try {
    ok(res, await service.listContractMilestones(Number(req.params.id)));
  } catch (error) {
    next(error);
  }
});

router.post('/:id/milestones', requirePermissions(PERMISSIONS.CONTRACTS_WRITE), validateBody(milestoneSchema), audit('contract_milestones'), async (req, res, next) => {
  try {
    ok(res, await service.createContractMilestone(Number(req.params.id), req.body), undefined, 201);
  } catch (error) {
    next(error);
  }
});

router.get('/:id/amendments', requirePermissions(PERMISSIONS.CONTRACTS_READ), async (req, res, next) => {
  try {
    ok(res, await service.listContractAmendments(Number(req.params.id)));
  } catch (error) {
    next(error);
  }
});

router.post('/:id/amendments', requirePermissions(PERMISSIONS.CONTRACTS_WRITE), validateBody(amendmentSchema), audit('contract_amendments'), async (req, res, next) => {
  try {
    ok(res, await service.createContractAmendment(Number(req.params.id), req.body), undefined, 201);
  } catch (error) {
    next(error);
  }
});

router.get('/:id/alerts', requirePermissions(PERMISSIONS.CONTRACTS_READ), async (req, res, next) => {
  try {
    ok(res, await service.listContractAlerts(Number(req.params.id)));
  } catch (error) {
    next(error);
  }
});

router.post('/:id/alerts', requirePermissions(PERMISSIONS.CONTRACTS_WRITE), validateBody(alertSchema), audit('contract_alerts'), async (req, res, next) => {
  try {
    ok(res, await service.createContractAlert(Number(req.params.id), req.body), undefined, 201);
  } catch (error) {
    next(error);
  }
});

router.post('/alerts/:id/resolve', requirePermissions(PERMISSIONS.CONTRACTS_WRITE), validateBody(alertResolveSchema), audit('contract_alerts'), async (req, res, next) => {
  try {
    ok(res, await service.resolveContractAlert(Number(req.params.id), req.body));
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', requirePermissions(PERMISSIONS.CONTRACTS_WRITE), audit('contracts'), async (req, res, next) => {
  try {
    ok(res, await service.deleteContract(Number(req.params.id)));
  } catch (error) {
    next(error);
  }
});

router.post('/:id/convert-to-project', requirePermissions(PERMISSIONS.CONTRACTS_WRITE, PERMISSIONS.PROJECTS_WRITE), validateBody(contractConvertSchema), audit('projects'), async (req, res, next) => {
  try {
    ok(res, await service.convertContractToProject(Number(req.params.id), req.body));
  } catch (error) {
    next(error);
  }
});

router.post('/opportunities/:id/convert-to-contract', requirePermissions(PERMISSIONS.CRM_WRITE, PERMISSIONS.CONTRACTS_WRITE), validateBody(opportunityConvertSchema), audit('contracts'), async (req, res, next) => {
  try {
    ok(res, await service.convertOpportunityToContract(Number(req.params.id), req.body));
  } catch (error) {
    next(error);
  }
});

export default router;
