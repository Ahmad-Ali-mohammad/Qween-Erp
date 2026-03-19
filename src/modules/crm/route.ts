import { Router } from 'express';
import { z } from 'zod';
import { PERMISSIONS } from '../../constants/permissions';
import { audit } from '../../middleware/audit';
import { authenticate } from '../../middleware/auth';
import { requirePermissions } from '../../middleware/rbac';
import { validateBody } from '../../middleware/validate';
import customersRoutes from '../customers/route';
import { ok } from '../../utils/response';
import * as service from './service';

const router = Router();

const opportunitySchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    customerId: z.coerce.number().int().positive().optional(),
    stage: z.string().trim().max(50).optional(),
    probability: z.coerce.number().int().min(0).max(100).optional(),
    expectedCloseDate: z.string().optional(),
    value: z.coerce.number().nonnegative().optional(),
    ownerId: z.coerce.number().int().positive().optional(),
    notes: z.string().trim().optional(),
    status: z.string().trim().max(50).optional()
  })
  .strict();

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

router.use(authenticate);
router.use('/customers', customersRoutes);

router.get('/opportunities', requirePermissions(PERMISSIONS.CRM_READ), async (req, res, next) => {
  try {
    const data = await service.listOpportunities(req.query);
    ok(res, data.rows, data.pagination);
  } catch (error) {
    next(error);
  }
});

router.post('/opportunities', requirePermissions(PERMISSIONS.CRM_WRITE), validateBody(opportunitySchema), audit('opportunities'), async (req, res, next) => {
  try {
    ok(res, await service.createOpportunity(req.body), undefined, 201);
  } catch (error) {
    next(error);
  }
});

router.get('/opportunities/:id', requirePermissions(PERMISSIONS.CRM_READ), async (req, res, next) => {
  try {
    ok(res, await service.getOpportunity(Number(req.params.id)));
  } catch (error) {
    next(error);
  }
});

router.put('/opportunities/:id', requirePermissions(PERMISSIONS.CRM_WRITE), validateBody(opportunitySchema.partial()), audit('opportunities'), async (req, res, next) => {
  try {
    ok(res, await service.updateOpportunity(Number(req.params.id), req.body));
  } catch (error) {
    next(error);
  }
});

router.delete('/opportunities/:id', requirePermissions(PERMISSIONS.CRM_WRITE), audit('opportunities'), async (req, res, next) => {
  try {
    ok(res, await service.deleteOpportunity(Number(req.params.id)));
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

router.get('/contracts', requirePermissions(PERMISSIONS.CONTRACTS_READ), async (req, res, next) => {
  try {
    const data = await service.listContracts(req.query);
    ok(res, data.rows, data.pagination);
  } catch (error) {
    next(error);
  }
});

router.post('/contracts', requirePermissions(PERMISSIONS.CONTRACTS_WRITE), validateBody(contractSchema), audit('contracts'), async (req, res, next) => {
  try {
    ok(res, await service.createContract(req.body), undefined, 201);
  } catch (error) {
    next(error);
  }
});

router.get('/contracts/:id', requirePermissions(PERMISSIONS.CONTRACTS_READ), async (req, res, next) => {
  try {
    ok(res, await service.getContract(Number(req.params.id)));
  } catch (error) {
    next(error);
  }
});

router.put('/contracts/:id', requirePermissions(PERMISSIONS.CONTRACTS_WRITE), validateBody(contractSchema.partial()), audit('contracts'), async (req, res, next) => {
  try {
    ok(res, await service.updateContract(Number(req.params.id), req.body));
  } catch (error) {
    next(error);
  }
});

router.delete('/contracts/:id', requirePermissions(PERMISSIONS.CONTRACTS_WRITE), audit('contracts'), async (req, res, next) => {
  try {
    ok(res, await service.deleteContract(Number(req.params.id)));
  } catch (error) {
    next(error);
  }
});

router.post('/contracts/:id/convert-to-project', requirePermissions(PERMISSIONS.CONTRACTS_WRITE, PERMISSIONS.PROJECTS_WRITE), validateBody(contractConvertSchema), audit('projects'), async (req, res, next) => {
  try {
    ok(res, await service.convertContractToProject(Number(req.params.id), req.body));
  } catch (error) {
    next(error);
  }
});

export default router;
