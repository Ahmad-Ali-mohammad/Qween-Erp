import { randomUUID } from 'crypto';
import { existsSync } from 'fs';
import path from 'path';
import { env } from '../../config/env';
import { getMetricsContentType } from '../../observability/metrics';
import { getSentryCapabilities } from '../../observability/sentry';
import { getFileStorageCapabilities } from '../../services/file-storage';
import type { AuthUser } from '../../types/auth';
import { CENTRAL_GROUP_ORDER, CENTRAL_SYSTEMS } from './catalog';
import { getPrintingQueueCapabilities } from '../printing/queue';
import { getSyncQueueCapabilities } from '../sync/queue';

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
    sentry: getSentryCapabilities(),
    metricsContentType: getMetricsContentType(),
    queue: {
      sync: getSyncQueueCapabilities(),
      printing: getPrintingQueueCapabilities()
    },
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
  return systems
    .filter((system) => system.accessible && !system.distAvailable)
    .map((system) => ({
      id: randomUUID(),
      code: 'FRONTEND_DIST_MISSING',
      severity: 'low',
      title: 'Frontend dist is missing',
      detail: `Build app ${system.appDir} before serving ${system.routeBase}`,
      systemKey: system.key
    }));
}

export function acceptCentralEvent(
  payload: {
    eventName: string;
    aggregateType: string;
    aggregateId: string;
    payload?: Record<string, unknown>;
  },
  user?: AuthUser
) {
  return {
    ackId: randomUUID(),
    status: 'ACCEPTED',
    receivedAt: new Date().toISOString(),
    actor: user ? { id: user.id, username: user.username } : null,
    ...payload
  };
}

export function createCentralApprovalRequest(
  payload: {
    workflowKey: string;
    title: string;
    entityType: string;
    entityId: string;
    payload?: Record<string, unknown>;
  },
  user?: AuthUser
) {
  return {
    requestId: randomUUID(),
    status: 'PENDING',
    createdAt: new Date().toISOString(),
    actor: user ? { id: user.id, username: user.username } : null,
    ...payload
  };
}

