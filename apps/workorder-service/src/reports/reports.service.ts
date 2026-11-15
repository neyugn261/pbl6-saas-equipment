import {
  assertBranchAccess,
  requireTenantId,
  staffBranchId,
  type Principal,
} from '@pbl6/auth';
import { Injectable, Optional, ServiceUnavailableException } from '@nestjs/common';
import { DisplayNameLookup } from '@pbl6/service-kit';
import { WO_STATUSES } from '../work-orders/dto';
import type {
  TechnicianKpiItem,
  TechnicianKpiQueryDto,
  TechnicianKpiResponse,
  TechnicianKpiSummary,
  WorkOrderSummaryQueryDto,
} from './dto';
import { reportRange } from './report-range';
import { ReportsRepository } from './reports.repository';

function count(value: bigint | number) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0)
    throw new Error('Invalid report count');
  return number;
}
@Injectable()
export class ReportsService {
  constructor(
    private readonly repo: ReportsRepository,
    @Optional() private readonly names?: DisplayNameLookup,
  ) {}

  async summary(p: Principal, query: WorkOrderSummaryQueryDto) {
    const tenantId = requireTenantId(p);
    const range = reportRange(query.from, query.to);
    try {
      const row = await this.repo.summary(
        tenantId,
        range.from,
        range.to,
        staffBranchId(p),
      );
      return {
        ...range,
        timezone: 'Asia/Ho_Chi_Minh',
        createdCount: count(row.createdCount),
        createdByStatus: Object.fromEntries(
          WO_STATUSES.map((status) => [
            status,
            count(row.createdByStatus[status] ?? 0),
          ]),
        ),
        completedCount: count(row.completedCount),
      };
    } catch {
      // Neither an outage nor an invalid DB result is a successful zero report.
      // Do not expose SQL/query parameters to the shared error logger.
      throw new ServiceUnavailableException({
        code: 'REPORT_UNAVAILABLE',
        message: 'Work Order report is unavailable',
      });
    }
  }

  async technicianKpi(
    p: Principal,
    query: TechnicianKpiQueryDto,
  ): Promise<TechnicianKpiResponse> {
    const tenantId = requireTenantId(p);
    const range = reportRange(query.from, query.to);
    let branchId = staffBranchId(p);
    if (query.branchId) {
      assertBranchAccess(p, query.branchId);
      branchId = query.branchId;
    }

    let rows;
    try {
      rows = await this.repo.technicianKpi(
        tenantId,
        range.from,
        range.to,
        branchId,
        query.technicianId ?? null,
      );
    } catch {
      throw new ServiceUnavailableException({
        code: 'REPORT_UNAVAILABLE',
        message: 'Technician KPI report is unavailable',
      });
    }

    const userIds = rows.map((r) => r.userId);
    const branchIds = rows.map((r) => r.branchId);
    const [users, branches] = await Promise.all([
      this.names?.lookup('users', userIds, p).catch(() => undefined),
      this.names?.lookup('branches', branchIds, p).catch(() => undefined),
    ]);

    let totalCompletedCount = 0;
    let totalResolvedRepairCount = 0;
    let totalEligibleRepairCount = 0;
    let totalOnTimeCount = 0;
    let totalScheduledCount = 0;

    const items: TechnicianKpiItem[] = rows.map((row) => {
      const completedCount = count(row.completedCount ?? 0);
      const resolvedRepairCount = count(row.resolvedRepairCount ?? 0);
      const eligibleRepairCount = count(row.eligibleRepairCount ?? 0);
      const onTimeCount = count(row.onTimeCount ?? 0);
      const scheduledCount = count(row.scheduledCount ?? 0);

      totalCompletedCount += completedCount;
      totalResolvedRepairCount += resolvedRepairCount;
      totalEligibleRepairCount += eligibleRepairCount;
      totalOnTimeCount += onTimeCount;
      totalScheduledCount += scheduledCount;

      const repairSuccessRate =
        eligibleRepairCount > 0
          ? Math.round((resolvedRepairCount / eligibleRepairCount) * 10000) /
            10000
          : null;

      const onTimeRate =
        scheduledCount > 0
          ? Math.round((onTimeCount / scheduledCount) * 10000) / 10000
          : null;

      const userEntry = users?.get(row.userId.toLowerCase());
      const branchEntry = branches?.get(row.branchId.toLowerCase());

      return {
        technicianId: row.technicianId,
        employeeCode: row.employeeCode,
        userId: row.userId,
        fullName: userEntry?.name ?? null,
        branchId: row.branchId,
        branchName: branchEntry?.name ?? null,
        branchCode: branchEntry?.code ?? null,
        status: row.status,
        completedCount,
        repairSuccessRate,
        resolvedRepairCount,
        eligibleRepairCount,
        onTimeRate,
        onTimeCount,
        scheduledCount,
      };
    });

    const summary: TechnicianKpiSummary = {
      totalTechnicians: items.length,
      totalCompletedCount,
      totalResolvedRepairCount,
      totalEligibleRepairCount,
      overallRepairSuccessRate:
        totalEligibleRepairCount > 0
          ? Math.round(
              (totalResolvedRepairCount / totalEligibleRepairCount) * 10000,
            ) / 10000
          : null,
      totalOnTimeCount,
      totalScheduledCount,
      overallOnTimeRate:
        totalScheduledCount > 0
          ? Math.round((totalOnTimeCount / totalScheduledCount) * 10000) /
            10000
          : null,
    };

    return {
      ...range,
      timezone: 'Asia/Ho_Chi_Minh',
      items,
      summary,
    };
  }
}
