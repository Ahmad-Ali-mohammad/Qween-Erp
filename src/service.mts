import node from '@prisma/composer/node';
import { compute } from '@prisma/composer-prisma-cloud';
import { postgres, dataContract } from '@prisma/composer-prisma-cloud/orm';
import { type } from 'arktype';
import { secretString } from '@prisma/composer/arktype';
import type { Contract } from './prisma/contract.js';
import erpQweenContractJson from './prisma/contract.json' with { type: 'json' };

export default compute({
  name: 'erp-qween',
  deps: { db: postgres(dataContract<Contract>(erpQweenContractJson)) },
  input: type({ jwtSecret: secretString() }),
  build: node({ module: import.meta.url, dir: '../dist', entry: 'server.js', dependencies: 'external' }),
});
