import { AuthRequest, AuthUser } from '../types/auth';
import { Errors } from './response';

type ScopeKind = 'branch' | 'project' | 'warehouse';
type AccessMode = 'read' | 'write';

type ScopeConfig = {
  readKey: keyof AuthUser;
  writeKey: keyof AuthUser;
  label: string;
};

const scopeConfig: Record<ScopeKind, ScopeConfig> = {
  branch: { readKey: 'branchIds', writeKey: 'branchWriteIds', label: 'الفرع' },
  project: { readKey: 'projectIds', writeKey: 'projectWriteIds', label: 'المشروع' },
  warehouse: { readKey: 'warehouseIds', writeKey: 'warehouseWriteIds', label: 'المستودع' }
};

function getAuthUser(target?: AuthRequest | AuthUser | null): AuthUser | undefined {
  if (!target) return undefined;
  if (Object.prototype.hasOwnProperty.call(target, 'user')) {
    return (target as AuthRequest).user;
  }
  return target as AuthUser;
}

function normalizeIds(ids?: number[]) {
  return Array.isArray(ids) ? ids.filter((value) => Number.isInteger(value) && value > 0) : [];
}

export function getScopeIds(target: AuthRequest | AuthUser | null | undefined, scope: ScopeKind, mode: AccessMode = 'read') {
  const user = getAuthUser(target);
  if (!user) return [];

  const config = scopeConfig[scope];
  const readIds = normalizeIds(user[config.readKey] as number[] | undefined);
  const writeIds = normalizeIds(user[config.writeKey] as number[] | undefined);
  return mode === 'write' ? writeIds : readIds;
}

export function isScopeRestricted(target: AuthRequest | AuthUser | null | undefined, scope: ScopeKind, mode: AccessMode = 'read') {
  const user = getAuthUser(target);
  if (!user) return false;

  const config = scopeConfig[scope];
  const readIds = normalizeIds(user[config.readKey] as number[] | undefined);
  const writeIds = normalizeIds(user[config.writeKey] as number[] | undefined);

  return mode === 'write' ? readIds.length > 0 || writeIds.length > 0 : readIds.length > 0;
}

export function assertUnrestrictedScope(
  target: AuthRequest | AuthUser | null | undefined,
  scope: ScopeKind,
  mode: AccessMode = 'write',
  message?: string
) {
  if (isScopeRestricted(target, scope, mode)) {
    throw Errors.forbidden(message ?? `ليس لديك صلاحية عامة على ${scopeConfig[scope].label}`);
  }
}

export function assertScopeAccess(
  target: AuthRequest | AuthUser | null | undefined,
  scope: ScopeKind,
  id: number | null | undefined,
  mode: AccessMode = 'read',
  message?: string
) {
  if (!id) return;
  const allowedIds = getScopeIds(target, scope, mode);
  if (!isScopeRestricted(target, scope, mode)) return;
  if (!allowedIds.includes(Number(id))) {
    throw Errors.forbidden(message ?? `ليس لديك صلاحية على ${scopeConfig[scope].label} المطلوب`);
  }
}

export function assertBranchScopeAccess(
  target: AuthRequest | AuthUser | null | undefined,
  id: number | null | undefined,
  mode: AccessMode = 'read',
  message?: string
) {
  return assertScopeAccess(target, 'branch', id, mode, message);
}

export function assertProjectScopeAccess(
  target: AuthRequest | AuthUser | null | undefined,
  id: number | null | undefined,
  mode: AccessMode = 'read',
  message?: string
) {
  return assertScopeAccess(target, 'project', id, mode, message);
}

export function assertWarehouseScopeAccess(
  target: AuthRequest | AuthUser | null | undefined,
  id: number | null | undefined,
  mode: AccessMode = 'read',
  message?: string
) {
  return assertScopeAccess(target, 'warehouse', id, mode, message);
}

export function scopedWhere(
  target: AuthRequest | AuthUser | null | undefined,
  scope: ScopeKind,
  field: string,
  requestedId?: number | null,
  mode: AccessMode = 'read'
) {
  if (requestedId) {
    assertScopeAccess(target, scope, requestedId, mode);
    return { [field]: requestedId };
  }

  const allowedIds = getScopeIds(target, scope, mode);
  if (!isScopeRestricted(target, scope, mode)) return {};
  if (!allowedIds.length) {
    return {
      [field]: {
        in: [-1]
      }
    };
  }

  return {
    [field]: {
      in: allowedIds
    }
  };
}
