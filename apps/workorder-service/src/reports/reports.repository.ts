import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface WorkOrderCounts {
  createdCount: bigint;
  createdByStatus: Record<string, number>;
  completedCount: bigint;
}

export interface RawTechnicianKpiRow {
  technicianId: string;
  employeeCode: string;
  userId: string;
  branchId: string;
  status: string;
  completedCount: bigint | number;
  resolvedRepairCount: bigint | number;
  eligibleRepairCount: bigint | number;
  onTimeCount: bigint | number;
  scheduledCount: bigint | number;
}

@Injectable()
export class ReportsRepository {
  constructor(private readonly db: PrismaService) {}

  async summary(
    tenantId: string,
    from: string,
    to: string,
    branchId: string | null = null,
  ) {
    // One SQL statement = one MVCC snapshot for all three independent counts.
    // Parameterized canonical UTC strings retain the DB's microsecond precision.
    const [row] = await this.db.$queryRaw<WorkOrderCounts[]>`
      WITH created AS (
        SELECT status FROM work_orders
        WHERE tenant_id = ${tenantId}::uuid AND (${branchId}::uuid IS NULL OR branch_id = ${branchId}::uuid)
          AND created_at >= ${from}::timestamptz AND created_at < ${to}::timestamptz
      ), status_counts AS (
        SELECT status, count(*) AS total FROM created GROUP BY status
      )
      SELECT
        (SELECT count(*) FROM created) AS "createdCount",
        COALESCE((SELECT jsonb_object_agg(status, total) FROM status_counts), '{}'::jsonb) AS "createdByStatus",
        (SELECT count(*) FROM work_orders
          WHERE tenant_id = ${tenantId}::uuid AND (${branchId}::uuid IS NULL OR branch_id = ${branchId}::uuid) AND status = 'COMPLETED'
            AND completed_at >= ${from}::timestamptz AND completed_at < ${to}::timestamptz
        ) AS "completedCount"
    `;
    return row;
  }

  async technicianKpi(
    tenantId: string,
    from: string,
    to: string,
    branchId: string | null = null,
    technicianId: string | null = null,
  ): Promise<RawTechnicianKpiRow[]> {
    return this.db.$queryRaw<RawTechnicianKpiRow[]>`
      WITH eligible_techs AS (
        SELECT
          t.id AS "technicianId",
          t.employee_code AS "employeeCode",
          t.user_id AS "userId",
          t.branch_id AS "branchId",
          t.status
        FROM technicians t
        WHERE t.tenant_id = ${tenantId}::uuid
          AND (${branchId}::uuid IS NULL OR t.branch_id = ${branchId}::uuid)
          AND (${technicianId}::uuid IS NULL OR t.id = ${technicianId}::uuid)
      ),
      completed_wos AS (
        SELECT
          wo.id AS work_order_id,
          wo.type,
          wo.scheduled_end,
          wo.completed_at,
          COALESCE(sr.technician_id, ca.technician_id) AS technician_id,
          sr.result AS report_result
        FROM work_orders wo
        LEFT JOIN service_reports sr
          ON sr.tenant_id = wo.tenant_id AND sr.work_order_id = wo.id
        LEFT JOIN LATERAL (
          SELECT a.technician_id
          FROM work_order_assignments a
          WHERE a.tenant_id = wo.tenant_id AND a.work_order_id = wo.id AND a.status = 'COMPLETED'
          ORDER BY a.assigned_at DESC
          LIMIT 1
        ) ca ON true
        WHERE wo.tenant_id = ${tenantId}::uuid
          AND wo.status = 'COMPLETED'
          AND wo.completed_at >= ${from}::timestamptz
          AND wo.completed_at < ${to}::timestamptz
          AND (${branchId}::uuid IS NULL OR wo.branch_id = ${branchId}::uuid)
      )
      SELECT
        t."technicianId",
        t."employeeCode",
        t."userId",
        t."branchId",
        t.status,
        COUNT(cw.work_order_id) AS "completedCount",
        COUNT(CASE WHEN cw.type IN ('REPAIR', 'WARRANTY') AND cw.report_result = 'RESOLVED' THEN 1 END) AS "resolvedRepairCount",
        COUNT(CASE WHEN cw.type IN ('REPAIR', 'WARRANTY') AND cw.report_result IN ('RESOLVED', 'PARTIALLY_RESOLVED', 'UNRESOLVED') THEN 1 END) AS "eligibleRepairCount",
        COUNT(CASE WHEN cw.scheduled_end IS NOT NULL AND cw.completed_at <= cw.scheduled_end THEN 1 END) AS "onTimeCount",
        COUNT(CASE WHEN cw.scheduled_end IS NOT NULL THEN 1 END) AS "scheduledCount"
      FROM eligible_techs t
      LEFT JOIN completed_wos cw ON cw.technician_id = t."technicianId"
      GROUP BY t."technicianId", t."employeeCode", t."userId", t."branchId", t.status
      ORDER BY t."employeeCode" ASC;
    `;
  }
}
