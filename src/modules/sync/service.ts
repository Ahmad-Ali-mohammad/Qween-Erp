import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { Errors } from '../../utils/response';
import type { SyncBatchInput, SyncOperationInput, SyncResource } from './dto';

type Delegate = {
  create: (args: Record<string, unknown>) => Promise<any>;
  update: (args: Record<string, unknown>) => Promise<any>;
  delete: (args: Record<string, unknown>) => Promise<any>;
  findUnique: (args: Record<string, unknown>) => Promise<any>;
};

type ResourceConfig = {
  model: string;
  uniqueFields: string[];
};

const READ_ONLY_FIELDS = new Set(['id', 'createdAt', 'updatedAt']);

const RESOURCE_MAP: Record<SyncResource, ResourceConfig> = {
  projects: { model: 'project', uniqueFields: ['id', 'code'] },
  projectTasks: { model: 'projectTask', uniqueFields: ['id'] },
  projectExpenses: { model: 'projectExpense', uniqueFields: ['id'] },
  purchaseOrders: { model: 'purchaseOrder', uniqueFields: ['id', 'number'] },
  purchaseReceipts: { model: 'purchaseReceipt', uniqueFields: ['id', 'number'] },
  items: { model: 'item', uniqueFields: ['id', 'code'] },
  warehouses: { model: 'warehouse', uniqueFields: ['id', 'code'] },
  stockMovements: { model: 'stockMovement', uniqueFields: ['id'] },
  accounts: { model: 'account', uniqueFields: ['id', 'code'] },
  taxCodes: { model: 'taxCode', uniqueFields: ['id', 'code'] },
  currencies: { model: 'currency', uniqueFields: ['id', 'code'] },
  exchangeRates: { model: 'exchangeRate', uniqueFields: ['id'] }
};

function getPrismaModel(model: string) {
  const modelName = `${model.charAt(0).toUpperCase()}${model.slice(1)}`;
  return Prisma.dmmf.datamodel.models.find((entry) => entry.name === modelName) || null;
}

function getDelegate(tx: unknown, model: string): Delegate {
  return (tx as Record<string, Delegate>)[model];
}

function sanitizeData(model: string, data: Record<string, unknown> | undefined) {
  const payload = data ?? {};
  const prismaModel = getPrismaModel(model);
  if (!prismaModel) return {};

  const allowedFields = new Set(
    prismaModel.fields
      .filter((field) => field.kind === 'scalar' && !READ_ONLY_FIELDS.has(field.name))
      .map((field) => field.name)
  );

  return Object.fromEntries(Object.entries(payload).filter(([key]) => allowedFields.has(key)));
}

function buildWhere(config: ResourceConfig, operation: SyncOperationInput) {
  const match = operation.match ?? {};
  const uniqueField = config.uniqueFields.find((field) => Object.prototype.hasOwnProperty.call(match, field));
  if (uniqueField) {
    return { [uniqueField]: match[uniqueField] };
  }

  if (operation.recordId !== undefined) {
    const primaryKey = config.uniqueFields.includes('id') ? 'id' : config.uniqueFields[0];
    return { [primaryKey]: operation.recordId };
  }

  return null;
}

function getTimestamp(row: Record<string, unknown> | null) {
  const raw = row?.updatedAt ?? row?.createdAt;
  if (!raw) return null;
  return raw instanceof Date ? raw : new Date(String(raw));
}

async function logConflict(
  tx: Record<string, any>,
  operation: SyncOperationInput,
  existing: Record<string, unknown>,
  userId: number,
  batchId?: string
) {
  await tx.auditLog.create({
    data: {
      userId,
      table: 'sync_conflicts',
      recordId: typeof existing.id === 'number' ? existing.id : null,
      action: 'SYNC_CONFLICT',
      oldValue: existing,
      newValue: {
        batchId,
        resource: operation.resource,
        action: operation.action,
        deviceId: operation.deviceId ?? null,
        clientUpdatedAt: operation.clientUpdatedAt ?? null,
        data: operation.data ?? null
      }
    }
  });
}

export async function applySyncBatch(input: SyncBatchInput, userId: number) {
  return prisma.$transaction(async (tx) => {
    const results: Array<Record<string, unknown>> = [];
    const conflicts: Array<Record<string, unknown>> = [];

    for (let index = 0; index < input.operations.length; index += 1) {
      const operation = input.operations[index];
      const config = RESOURCE_MAP[operation.resource];
      const delegate = getDelegate(tx, config.model);
      const where = buildWhere(config, operation);
      const payload = sanitizeData(config.model, operation.data);
      const existing = where ? ((await delegate.findUnique({ where })) as Record<string, unknown> | null) : null;

      if ((operation.action === 'create' || operation.action === 'update') && Object.keys(payload).length === 0) {
        throw Errors.validation(`لا توجد حقول قابلة للمزامنة للعملية رقم ${index + 1}`);
      }

      const clientUpdatedAt = operation.clientUpdatedAt ? new Date(operation.clientUpdatedAt) : null;
      const serverUpdatedAt = getTimestamp(existing);
      const conflict = Boolean(existing && clientUpdatedAt && serverUpdatedAt && clientUpdatedAt < serverUpdatedAt);

      if (conflict && existing) {
        await logConflict(tx as Record<string, any>, operation, existing, userId, input.batchId);
        conflicts.push({
          index,
          resource: operation.resource,
          recordId: existing.id ?? operation.recordId ?? null,
          strategy: 'LAST_WRITE_WINS',
          clientUpdatedAt,
          serverUpdatedAt
        });
      }

      if (operation.action === 'delete') {
        if (existing && where) {
          await delegate.delete({ where });
          results.push({
            index,
            resource: operation.resource,
            status: 'deleted',
            recordId: existing.id ?? operation.recordId ?? null
          });
        } else {
          results.push({
            index,
            resource: operation.resource,
            status: 'skipped',
            reason: 'NOT_FOUND'
          });
        }
        continue;
      }

      if (existing && where) {
        const row = await delegate.update({ where, data: payload });
        results.push({
          index,
          resource: operation.resource,
          status: 'updated',
          recordId: row.id ?? operation.recordId ?? null
        });
        continue;
      }

      const row = await delegate.create({ data: payload });
      results.push({
        index,
        resource: operation.resource,
        status: 'created',
        recordId: row.id ?? null
      });
    }

    return {
      batchId: input.batchId ?? null,
      receivedAt: new Date().toISOString(),
      strategy: 'LAST_WRITE_WINS',
      summary: {
        total: input.operations.length,
        created: results.filter((entry) => entry.status === 'created').length,
        updated: results.filter((entry) => entry.status === 'updated').length,
        deleted: results.filter((entry) => entry.status === 'deleted').length,
        skipped: results.filter((entry) => entry.status === 'skipped').length,
        conflicts: conflicts.length
      },
      conflicts,
      results
    };
  });
}
