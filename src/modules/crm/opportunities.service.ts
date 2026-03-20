import { prisma } from '../../config/database';
import { enqueueOutboxEvent } from '../../platform/events/outbox';
import { parseDateOrThrow } from '../../utils/date';
import { buildSequentialNumberFromLatest } from '../../utils/id-generator';
import { Errors } from '../../utils/response';

async function generateContractNumber(tx: any): Promise<string> {
  const year = new Date().getUTCFullYear();
  const latest = await tx.contract.findFirst({
    where: {
      number: {
        startsWith: `CONT-${year}-`
      }
    },
    select: { number: true },
    orderBy: { number: 'desc' }
  });
  return buildSequentialNumberFromLatest('CONT', latest?.number, year);
}

async function generateProjectCode(tx: any): Promise<string> {
  const year = new Date().getUTCFullYear();
  const latest = await tx.project.findFirst({
    where: {
      code: {
        startsWith: `PRJ-${year}-`
      }
    },
    select: { code: true },
    orderBy: { code: 'desc' }
  });
  return buildSequentialNumberFromLatest('PRJ', latest?.code, year);
}

function normalizeAmount(value: unknown): number {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount) || amount < 0) {
    throw Errors.validation('قيمة العقد غير صالحة');
  }
  return amount;
}

export async function awardOpportunity(opportunityId: number, data: any, userId: number) {
  return prisma.$transaction((tx) => awardOpportunityWithTransaction(tx, opportunityId, data, userId));
}

export async function awardOpportunityWithTransaction(tx: any, opportunityId: number, data: any, userId: number) {
  const opportunity = await tx.opportunity.findUnique({ where: { id: opportunityId } });
  if (!opportunity) throw Errors.notFound('الفرصة التجارية غير موجودة');

  const normalizedStage = String(opportunity.stage ?? '').toUpperCase();
  const normalizedStatus = String(opportunity.status ?? '').toUpperCase();
  if (['WON', 'AWARDED', 'CONTRACTED'].includes(normalizedStage) || normalizedStatus === 'WON') {
    throw Errors.business('تمت ترسية هذه الفرصة سابقًا');
  }

  const customer = opportunity.customerId
    ? await tx.customer.findUnique({
        where: { id: opportunity.customerId },
        select: { id: true, branchId: true, nameAr: true }
      })
    : null;

  const branchId = Number(data.branchId ?? customer?.branchId ?? 0) || null;
  const startDate = parseDateOrThrow(data.startDate ?? new Date().toISOString(), 'startDate');
  const endDate = data.endDate ? parseDateOrThrow(data.endDate, 'endDate') : null;
  const contractValue = normalizeAmount(data.contractValue ?? opportunity.value);
  const contractNumber = data.contractNumber ?? (await generateContractNumber(tx));

  const contract = await tx.contract.create({
    data: {
      number: contractNumber,
      branchId,
      title: data.contractTitle ?? opportunity.title,
      partyType: customer ? 'CUSTOMER' : 'GENERAL',
      partyId: customer?.id ?? opportunity.customerId ?? null,
      type: data.contractType ?? 'CLIENT',
      startDate,
      endDate,
      value: contractValue,
      status: 'APPROVED',
      approvalStatus: 'APPROVED',
      postingStatus: 'NOT_APPLICABLE',
      terms: data.terms
    }
  });

  let project: any = null;
  if (data.createProject !== false) {
    project = await tx.project.create({
      data: {
        code: data.projectCode ?? (await generateProjectCode(tx)),
        nameAr: data.projectNameAr ?? opportunity.title,
        nameEn: data.projectNameEn,
        branchId,
        contractId: contract.id,
        type: data.projectType ?? 'EXECUTION',
        status: 'Active',
        startDate,
        endDate,
        budget: contractValue,
        actualCost: 0,
        managerId: data.managerId ?? opportunity.ownerId ?? null,
        description: data.projectDescription ?? opportunity.notes
      }
    });
  }

  const updatedOpportunity = await tx.opportunity.update({
    where: { id: opportunityId },
    data: {
      stage: 'WON',
      status: 'WON',
      probability: 100
    }
  });

  await enqueueOutboxEvent(tx, {
    eventType: 'crm.opportunity.awarded',
    aggregateType: 'Opportunity',
    aggregateId: String(updatedOpportunity.id),
    actorId: userId,
    branchId,
    correlationId: `opportunity:${updatedOpportunity.id}:awarded`,
    payload: {
      opportunityId: updatedOpportunity.id,
      contractId: contract.id,
      projectId: project?.id ?? null,
      customerId: updatedOpportunity.customerId,
      value: updatedOpportunity.value
    }
  });

  await enqueueOutboxEvent(tx, {
    eventType: 'contracts.contract.activated',
    aggregateType: 'Contract',
    aggregateId: String(contract.id),
    actorId: userId,
    branchId,
    correlationId: `contract:${contract.id}:activated`,
    payload: {
      contractId: contract.id,
      number: contract.number,
      projectId: project?.id ?? null,
      partyId: contract.partyId,
      value: contract.value
    }
  });

  if (project) {
    await enqueueOutboxEvent(tx, {
      eventType: 'projects.project.created',
      aggregateType: 'Project',
      aggregateId: String(project.id),
      actorId: userId,
      branchId,
      correlationId: `project:${project.id}:created`,
      payload: {
        projectId: project.id,
        code: project.code,
        contractId: contract.id,
        budget: project.budget,
        customerId: updatedOpportunity.customerId
      }
    });
  }

  return {
    opportunity: updatedOpportunity,
    contract,
    project
  };
}
