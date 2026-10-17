/**
 * The part of a generated Prisma client (or its transaction client) that the
 * outbox and inbox need. Every service's own PrismaService satisfies it, so
 * this package does not depend on any service's generated client.
 */
export interface SqlExecutor {
  $executeRawUnsafe(query: string, ...values: unknown[]): PromiseLike<number>;
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): PromiseLike<T>;
}

export interface TransactionOptions {
  maxWait?: number;
  timeout?: number;
}

/** A client that can open an interactive transaction (Prisma `$transaction(fn)`). */
export interface TransactionalSql<Tx extends SqlExecutor = SqlExecutor> {
  $transaction<T>(fn: (tx: Tx) => Promise<T>, options?: TransactionOptions): Promise<T>;
}
