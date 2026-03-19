import { existsSync } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { Prisma, WorkflowInstanceStatus } from '@prisma/client';
import type { AuthUser } from '../../types/auth';
import { env } from '../../config/env';
import { prisma } from '../../config/database';
import { getSentryCapabilities } from '../../observability/sentry';
import { getMetricsContentType } from '../../observability/metrics';
import { getFileStorageCapabilities } from '../../services/file-storage';
import { Errors } from '../../utils/response';
import { getPrintingQueueCapabilities } from '../printing/queue';
import { getSyncQueueCapabilities } from '../sync/queue';
import { CENTRAL_GROUP_ORDER, CENTRAL_SYSTEMS } from './catalog';

function hasSystemAccess(user: AuthUser | undefined, permissions: string[]) {
  if (!permissions.length) return true;
  if (!user) return false;
  return permissions.some((permission) => Boolean(user.permissions?.[permission]));
}

function toCard(system: (typeof CENTRAL_SYSTEMS)[number], user?: AuthUser) {
  const distDir = path.join(process.cwd(), 'apps', system.appDir, 'dist');

  return {
    ...system,
    accessible: hasSystemAccess(user, system.permissions),
    distAvailable: existsSync(distDir),
    legacyCompatible: system.appDir !== 'control-center'
  };
}

function buildPagination(page: number, limit: number, total: number) {
  return {
    page,
    limit,
    total,
    pages: Math.max(1, Math.ceil(total / limit))
  };
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue;
}

const WORKFLOW_STATUSES = new Set(Object.values(WorkflowInstanceStatus));

function parseWorkflowStatus(value?: string): WorkflowInstanceStatus | undefined {
  if (!value) return undefined;
  const normalized = String(value).toUpperCase();
  return WORKFLOW_STATUSES.has(normalized as WorkflowInstanceStatus)
    ? (normalized as WorkflowInstanceStatus)
    : undefined;
}

export function listCentralApps(user?: AuthUser) {
  return CENTRAL_SYSTEMS.map((system) => toCard(system, user));
}

export function listCentralNavigation(user?: AuthUser) {
  return CENTRAL_GROUP_ORDER.map((group) => ({
    group,
    items: CENTRAL_SYSTEMS.filter((system) => system.group === group)
      .map((system) => toCard(system, user))
      .filter((system) => system.accessible)
  }));
}

export function getCentralHealth() {
  return {
    generatedAt: new Date().toISOString(),
    environment: env.nodeEnv,
    timezone: env.appTimezone,
    baseCurrency: env.baseCurrency,
    storage: getFileStorageCapabilities(),
    queue: {
      sync: getSyncQueueCapabilities(),
      printing: getPrintingQueueCapabilities()
    },
    sentry: getSentryCapabilities(),
    metricsContentType: getMetricsContentType(),
    systems: CENTRAL_SYSTEMS.map((system) => ({
      key: system.key,
      routeBase: system.routeBase,
      appDir: system.appDir,
      status: system.status,
      distAvailable: existsSync(path.join(process.cwd(), 'apps', system.appDir, 'dist'))
    }))
  };
}

export function getCentralPermissions(user?: AuthUser) {
  return {
    userId: user?.id ?? null,
    username: user?.username ?? null,
    roleId: user?.roleId ?? null,
    permissions: user?.permissions ?? {},
    branches: user?.branchIds ?? [],
    projects: user?.projectIds ?? [],
    warehouses: user?.warehouseIds ?? []
  };
}

export function getCentralExceptions(user?: AuthUser) {
  const systems = listCentralApps(user);
  const exceptions = systems
    .filter((system) => system.accessible)
    .flatMap((system) => {
      const items: Array<Record<string, unknown>> = [];

      if (system.status === 'planned') {
        items.push({
          id: randomUUID(),
          code: 'SYSTEM_NOT_IMPLEMENTED',
          severity: 'medium',
          title: 'واجهة غير مكتملة',
          detail: `System ${system.key} is still planned and has no complete execution surface yet.`,
          systemKey: system.key
        });
      }

      if (!system.distAvailable) {
        items.push({
          id: randomUUID(),
          code: 'FRONTEND_DIST_MISSING',
          severity: 'low',
          title: 'ملفات البناء غير متوفرة',
          detail: `Frontend dist is missing for ${system.appDir}. Build the workspace app before serving it from Express.`,
          systemKey: system.key
        });
      }

      return items;
    });

  return exceptions;
}

export function acceptCentralEvent(payload: {
  eventName: string;
  aggregateType: string;
  aggregateId: string;
  payload?: Record<string, unknown>;
}, user?: AuthUser) {
  return {
    ackId: randomUUID(),
    status: 'ACCEPTED',
    receivedAt: new Date().toISOString(),
    actor: user ? { id: user.id, username: user.username } : null,
    ...payload
  };
}

export async function listNotifications(
  userId: number,
  query: Record<string, unknown> = {}
) {
  const page = Math.max(1, Number(query.page ?? 1));
  const limit = Math.min(200, Math.max(1, Number(query.limit ?? 20)));
  const skip = (page - 1) * limit;

  const where: Prisma.NotificationWhereInput = {
    OR: [{ userId }, { userId: null }],
    ...(query.type ? { type: String(query.type) } : {}),
    ...(query.isRead !== undefined
      ? { isRead: String(query.isRead) === 'true' || String(query.isRead) === '1' }
      : {})
  };

  const [rows, total, unread] = await Promise.all([
    prisma.notification.findMany({ where, skip, take: limit, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }),
    prisma.notification.count({ where }),
    prisma.notification.count({
      where: {
        OR: [{ userId }, { userId: null }],
        isRead: false
      }
    })
  ]);

  return {
    rows,
    pagination: buildPagination(page, limit, total),
    unread
  };
}

export async function createNotification(payload: {
  title: string;
  message: string;
  type?: string;
  userId?: number | null;
}, actor?: AuthUser) {
  const userId = payload.userId === undefined ? actor?.id ?? null : payload.userId ?? null;

  return prisma.notification.create({
    data: {
      userId,
      title: payload.title,
      message: payload.message,
      type: payload.type ?? 'INFO'
    }
  });
}

export async function markNotificationRead(id: number, userId: number) {
  const notification = await prisma.notification.findUnique({ where: { id } });
  if (!notification) throw Errors.notFound('الإشعار غير موجود');
  if (notification.userId && notification.userId !== userId) throw Errors.forbidden('لا يمكنك تعديل هذا الإشعار');

  return prisma.notification.update({
    where: { id },
    data: {
      isRead: true,
      readAt: notification.readAt ?? new Date()
    }
  });
}

export async function markAllNotificationsRead(userId: number) {
  const now = new Date();
  const result = await prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true, readAt: now }
  });
  return { updated: result.count };
}

export async function listWorkflowInstances(query: Record<string, unknown> = {}) {
  const page = Math.max(1, Number(query.page ?? 1));
  const limit = Math.min(200, Math.max(1, Number(query.limit ?? 20)));
  const skip = (page - 1) * limit;
  const entityIdRaw = Number(query.entityId);
  const entityId = Number.isFinite(entityIdRaw) && entityIdRaw > 0 ? entityIdRaw : undefined;
  const status = parseWorkflowStatus(query.status ? String(query.status) : undefined);

  const where: Prisma.WorkflowInstanceWhereInput = {
    ...(query.workflowKey ? { workflowKey: String(query.workflowKey) } : {}),
    ...(query.entityType ? { entityType: String(query.entityType) } : {}),
    ...(entityId ? { entityId } : {}),
    ...(status ? { status } : {})
  };

  const [rows, total] = await Promise.all([
    prisma.workflowInstance.findMany({ where, skip, take: limit, orderBy: [{ startedAt: 'desc' }, { id: 'desc' }] }),
    prisma.workflowInstance.count({ where })
  ]);

  return {
    rows,
    pagination: buildPagination(page, limit, total)
  };
}

export async function getWorkflowInstance(id: number) {
  const instance = await prisma.workflowInstance.findUnique({
    where: { id },
    include: { actions: { orderBy: { createdAt: 'desc' } } }
  });
  if (!instance) throw Errors.notFound('طلب الاعتماد غير موجود');
  return instance;
}

export async function createWorkflowInstance(payload: {
  workflowKey: string;
  entityType: string;
  entityId: number;
  status?: WorkflowInstanceStatus | string;
  currentStep?: string | null;
  payload?: Record<string, unknown>;
}, actor?: AuthUser) {
  const status = parseWorkflowStatus(payload.status) ?? WorkflowInstanceStatus.PENDING;

  return prisma.workflowInstance.create({
    data: {
      workflowKey: payload.workflowKey,
      entityType: payload.entityType,
      entityId: payload.entityId,
      status,
      currentStep: payload.currentStep ?? null,
      payload: toJsonValue(payload.payload ?? {}),
      startedBy: actor?.id ?? null
    }
  });
}

export async function addWorkflowAction(
  instanceId: number,
  payload: {
    actionKey: string;
    actionStatus?: string;
    notes?: string | null;
    payload?: Record<string, unknown>;
  },
  actor?: AuthUser
) {
  const instance = await prisma.workflowInstance.findUnique({ where: { id: instanceId } });
  if (!instance) throw Errors.notFound('طلب الاعتماد غير موجود');

  const actionStatus = payload.actionStatus ?? 'PENDING';
  const action = await prisma.workflowAction.create({
    data: {
      workflowInstanceId: instanceId,
      actionKey: payload.actionKey,
      actionStatus,
      notes: payload.notes ?? null,
      payload: toJsonValue(payload.payload ?? {}),
      actorId: actor?.id ?? null
    }
  });

  const normalized = String(actionStatus).toUpperCase();
  if (['APPROVED', 'REJECTED', 'COMPLETED', 'CANCELLED'].includes(normalized)) {
    const resolvedStatus = parseWorkflowStatus(normalized);
    if (!resolvedStatus) return action;

    await prisma.workflowInstance.update({
      where: { id: instanceId },
      data: {
        status: resolvedStatus,
        completedAt: new Date()
      }
    });
  }

  return action;
}

export async function createCentralApprovalRequest(payload: {
  workflowKey: string;
  title: string;
  entityType: string;
  entityId: number;
  payload?: Record<string, unknown>;
}, user?: AuthUser) {
  const instance = await createWorkflowInstance(
    {
      workflowKey: payload.workflowKey,
      entityType: payload.entityType,
      entityId: payload.entityId,
      status: WorkflowInstanceStatus.PENDING,
      currentStep: payload.title,
      payload: payload.payload ?? {}
    },
    user
  );

  return {
    requestId: instance.id ?? randomUUID(),
    status: instance.status,
    createdAt: instance.startedAt.toISOString(),
    actor: user ? { id: user.id, username: user.username } : null,
    ...payload
  };
}
