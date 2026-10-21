import { PrismaPg } from '@prisma/adapter-pg';
import type { HealthCheck } from './health';

/**
 * Prisma driver adapter for PostgreSQL with the session time zone pinned to UTC.
 *
 * The pg adapter reads TIMESTAMPTZ as wall-clock time of the session time zone
 * but labels it UTC, so on a server whose time zone is not UTC (e.g.
 * Asia/Ho_Chi_Minh) every timestamp is shifted and expiry checks break.
 */
export function createPrismaAdapter(connectionString: string): PrismaPg {
  return new PrismaPg({ connectionString, options: '-c timezone=UTC' });
}

/** Minimal surface of any generated Prisma client used by the health check. */
export interface RawQueryClient {
  $queryRawUnsafe(query: string, ...values: unknown[]): PromiseLike<unknown>;
}

/** `GET /health` check that runs `SELECT 1`. */
export function prismaHealthCheck(
  prisma: RawQueryClient,
  name = 'database',
): HealthCheck {
  return {
    name,
    check: async () => {
      await prisma.$queryRawUnsafe('SELECT 1');
    },
  };
}
