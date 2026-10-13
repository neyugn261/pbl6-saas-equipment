import { PrismaPg } from '@prisma/adapter-pg';

/**
 * The pg driver adapter reads TIMESTAMPTZ as wall-clock time of the session
 * time zone but labels it UTC, so on a server whose time zone is not UTC
 * (e.g. Asia/Ho_Chi_Minh) every timestamp is shifted and expiry checks break.
 * Pinning the session to UTC keeps JavaScript Dates and SQL now() consistent.
 */
export function createPrismaAdapter(connectionString: string): PrismaPg {
  return new PrismaPg({ connectionString, options: '-c timezone=UTC' });
}
