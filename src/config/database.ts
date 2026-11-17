import service from '../service.mjs';
import type { Contract } from '../prisma/contract.js';
import type { PostgresTransactionContext } from '@prisma/orm-postgres/runtime';
import { logger } from './logger';

const { db } = service.load();

export const prisma = db.client;

/** The transaction context passed to `prisma.transaction(...)` callbacks. */
export type Tx = PostgresTransactionContext<Contract>;
/** Anything that can execute ORM queries: the plain client or a transaction context. */
export type Executor = Tx | typeof prisma;

async function verifyConnection(): Promise<void> {
  await prisma.execute(prisma.raw.sql`SELECT 1`.affectedCount().build());
}

export async function connectWithRetry(maxRetries = 5): Promise<void> {
  for (let i = 1; i <= maxRetries; i += 1) {
    try {
      await verifyConnection();
      logger.info('Database connected');
      return;
    } catch (error) {
      logger.error(`Database connection attempt ${i} failed`, { error });
      if (i === maxRetries) throw error;
      await new Promise((resolve) => setTimeout(resolve, i * 1000));
    }
  }
}

export async function disconnectDb(): Promise<void> {
  await prisma.close();
}
