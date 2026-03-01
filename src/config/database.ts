import { PrismaClient } from '@prisma/client';
import { logger } from './logger';

export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['error']
});

async function verifyConnection(): Promise<void> {
  await prisma.$queryRawUnsafe('SELECT 1');
}

export async function connectWithRetry(maxRetries = 5): Promise<void> {
  for (let i = 1; i <= maxRetries; i += 1) {
    try {
      await prisma.$connect();
      await verifyConnection();
      logger.info('Database connected');
      return;
    } catch (error) {
      logger.error(`Database connection attempt ${i} failed`, { error });
      try {
        await prisma.$disconnect();
      } catch {
        // ignore disconnect errors between retries
      }
      if (i === maxRetries) throw error;
      await new Promise((resolve) => setTimeout(resolve, i * 1000));
    }
  }
}

export async function disconnectDb(): Promise<void> {
  await prisma.$disconnect();
}
