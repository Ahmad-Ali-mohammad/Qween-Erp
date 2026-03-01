import { Request } from 'express';

export interface AuthUser {
  id: number;
  username: string;
  roleId: number;
  permissions: Record<string, boolean>;
}

export interface AuthRequest extends Request {
  user?: AuthUser;
}
