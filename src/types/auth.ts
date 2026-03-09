import { Request } from 'express';

export interface AuthUser {
  id: number;
  username: string;
  roleId: number;
  permissions: Record<string, boolean>;
  defaultBranchId?: number | null;
  branchIds?: number[];
  branchWriteIds?: number[];
  projectIds?: number[];
  projectWriteIds?: number[];
  warehouseIds?: number[];
  warehouseWriteIds?: number[];
}

export interface AuthRequest extends Request {
  user?: AuthUser;
}
