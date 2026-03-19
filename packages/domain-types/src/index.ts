export type Locale = 'ar' | 'en';

export type SystemStatus = 'implemented' | 'foundation' | 'planned';

export type SystemGroup = 'core' | 'operations' | 'support' | 'advanced';

export type SystemDefinition = {
  key: string;
  titleAr: string;
  titleEn: string;
  descriptionAr: string;
  descriptionEn: string;
  routeBase: string;
  appDir: string;
  apiBase: string;
  group: SystemGroup;
  status: SystemStatus;
  permissions: string[];
  tags: string[];
};

export type CentralException = {
  id: string;
  code: string;
  severity: 'low' | 'medium' | 'high';
  title: string;
  detail: string;
  systemKey?: string;
};

export type CentralEventInput = {
  eventName: string;
  aggregateType: string;
  aggregateId: string;
  payload?: Record<string, unknown>;
};

export type ApprovalRequestInput = {
  workflowKey: string;
  title: string;
  entityType: string;
  entityId: string;
  payload?: Record<string, unknown>;
};

export type AppSessionUser = {
  id: number;
  username: string;
  fullName: string;
  roleId?: number;
  permissions?: Record<string, boolean>;
  defaultBranchId?: number | null;
  branchIds?: number[];
  projectIds?: number[];
  warehouseIds?: number[];
};

export type AppSession = {
  token: string;
  refreshToken?: string | null;
  user: AppSessionUser | null;
};
