import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface WorkOrderCounts {
  createdCount: bigint;
  createdByStatus: Record<string, number>;
  completedCount: bigint;
}
@Injectable()
export class ReportsRepository {
  constructor(private readonly db: PrismaService) {}

  async summary(tenantId: string, from: string, to: string) {
    // One SQL statement = one MVCC snapshot for all three independent counts.
    // Parameterized canonical UTC strings retain the DB's microsecond precision.
    const [row] = await this.db.$queryRaw<WorkOrderCounts[]>`
      WITH created AS (
        SELECT status FROM work_orders
        WHERE tenant_id = ${tenantId}::uuid
          AND created_at >= ${from}::timestamptz AND created_at < ${to}::timestamptz
      ), status_counts AS (
        SELECT status, count(*) AS total FROM created GROUP BY status
      )
      SELECT
        (SELECT count(*) FROM created) AS "createdCount",
        COALESCE((SELECT jsonb_object_agg(status, total) FROM status_counts), '{}'::jsonb) AS "createdByStatus",
        (SELECT count(*) FROM work_orders
          WHERE tenant_id = ${tenantId}::uuid AND status = 'COMPLETED'
            AND completed_at >= ${from}::timestamptz AND completed_at < ${to}::timestamptz
        ) AS "completedCount"
    `;
    return row;
  }
}
