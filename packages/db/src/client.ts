import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.ts';

export type Db = PrismaClient;

// Connects lazily on the first query. The short connect timeout keeps /health from hanging
// on an unreachable Postgres (FND-03).
export function createDb(databaseUrl: string): Db {
  const adapter = new PrismaPg({ connectionString: databaseUrl, connectionTimeoutMillis: 2_000 });
  return new PrismaClient({ adapter });
}
