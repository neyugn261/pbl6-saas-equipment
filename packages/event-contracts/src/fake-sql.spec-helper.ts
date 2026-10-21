import type { SqlExecutor, TransactionalSql } from './sql';

export interface Call {
  query: string;
  values: unknown[];
}

/** Records SQL and answers SELECTs from `rows`; `$transaction` runs inline. */
export class FakeSql implements TransactionalSql, SqlExecutor {
  calls: Call[] = [];
  rows: unknown[] = [];
  executeResult = 1;
  transactions = 0;

  async $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number> {
    this.calls.push({ query, values });
    return this.executeResult;
  }

  async $queryRawUnsafe<T>(query: string, ...values: unknown[]): Promise<T> {
    this.calls.push({ query, values });
    return this.rows as T;
  }

  async $transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T> {
    this.transactions += 1;
    return fn(this);
  }
}
