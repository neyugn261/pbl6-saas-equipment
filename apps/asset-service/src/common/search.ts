/** Prisma contains uses SQL LIKE, where %, _ and backslash are special. */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}
