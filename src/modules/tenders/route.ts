import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { PERMISSIONS } from '../../constants/permissions';
import { audit } from '../../middleware/audit';
import { authenticate } from '../../middleware/auth';
import { requirePermissions } from '../../middleware/rbac';
import { validateBody } from '../../middleware/validate';
import { ok } from '../../utils/response';
import * as crmService from '../crm/service';

const router = Router();

const tenderSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    customerId: z.coerce.number().int().positive().optional(),
    expectedCloseDate: z.string().optional(),
    value: z.coerce.number().nonnegative().optional(),
    probability: z.coerce.number().int().min(0).max(100).optional(),
    notes: z.string().trim().optional(),
    stage: z.string().trim().max(50).optional(),
    status: z.string().trim().max(50).optional()
  })
  .strict();

const resultSchema = z
  .object({
    result: z.enum(['WON', 'LOST']),
    reason: z.string().trim().max(500).optional(),
    convertToContract: z.boolean().optional(),
    contract: z
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
      .optional()
  })
  .strict();

router.use(authenticate);

router.get('/', requirePermissions(PERMISSIONS.CRM_READ), async (req, res, next) => {
  try {
    const data = await crmService.listOpportunities(req.query);
    ok(res, data.rows, data.pagination);
  } catch (error) {
    next(error);
  }
});

router.post('/', requirePermissions(PERMISSIONS.CRM_WRITE), validateBody(tenderSchema), audit('opportunities'), async (req, res, next) => {
  try {
    ok(
      res,
      await crmService.createOpportunity({
        ...req.body,
        stage: req.body.stage ?? 'BID',
        status: req.body.status ?? 'OPEN'
      }),
      undefined,
      201
    );
  } catch (error) {
    next(error);
  }
});

router.get('/:id(\\d+)', requirePermissions(PERMISSIONS.CRM_READ), async (req, res, next) => {
  try {
    ok(res, await crmService.getOpportunity(Number(req.params.id)));
  } catch (error) {
    next(error);
  }
});

router.put('/:id(\\d+)', requirePermissions(PERMISSIONS.CRM_WRITE), validateBody(tenderSchema.partial()), audit('opportunities'), async (req, res, next) => {
  try {
    ok(res, await crmService.updateOpportunity(Number(req.params.id), req.body));
  } catch (error) {
    next(error);
  }
});

router.delete('/:id(\\d+)', requirePermissions(PERMISSIONS.CRM_WRITE), audit('opportunities'), async (req, res, next) => {
  try {
    ok(res, await crmService.deleteOpportunity(Number(req.params.id)));
  } catch (error) {
    next(error);
  }
});

router.post('/:id(\\d+)/submit', requirePermissions(PERMISSIONS.CRM_WRITE), audit('opportunities'), async (req, res, next) => {
  try {
    ok(
      res,
      await crmService.updateOpportunity(Number(req.params.id), {
        stage: 'BID_SUBMITTED',
        status: 'OPEN'
      })
    );
  } catch (error) {
    next(error);
  }
});

router.post('/:id(\\d+)/result', requirePermissions(PERMISSIONS.CRM_WRITE, PERMISSIONS.CONTRACTS_WRITE), validateBody(resultSchema), audit('opportunities'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const result = req.body.result as 'WON' | 'LOST';
    const reason = req.body.reason?.trim();

    let contract: unknown = null;
    if (result === 'WON' && req.body.convertToContract !== false) {
      contract = await crmService.convertOpportunityToContract(id, req.body.contract ?? {});
    } else {
      await crmService.updateOpportunity(id, {
        stage: result === 'WON' ? 'CONVERTED' : 'LOST',
        status: result === 'WON' ? 'WON' : 'LOST',
        notes: reason
      });
    }

    ok(res, {
      tenderId: id,
      result,
      reason: reason ?? null,
      contract
    });
  } catch (error) {
    next(error);
  }
});

router.get('/reports/win-rate', requirePermissions(PERMISSIONS.CRM_READ), async (_req, res, next) => {
  try {
    const [total, won, lost] = await Promise.all([
      prisma.opportunity.count(),
      prisma.opportunity.count({ where: { status: 'WON' } }),
      prisma.opportunity.count({ where: { status: 'LOST' } })
    ]);

    ok(res, {
      total,
      won,
      lost,
      winRate: total > 0 ? Math.round((won / total) * 10000) / 100 : 0
    });
  } catch (error) {
    next(error);
  }
});

export default router;
