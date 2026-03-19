import { getSystemByKey } from '@erp-qween/app-config';
import { setApiBase } from '@erp-qween/api-client';

export const systemKey = 'site-ops' as const;

const system = getSystemByKey(systemKey);
if (system) {
  setApiBase(system.apiBase);
}

