import {
  assertBranchAccess,
  requireTenantId,
  staffBranchId,
  type Principal,
} from '@pbl6/auth';
import {
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DisplayNameLookup } from '@pbl6/service-kit';
import { WO_STATUSES } from '../work-orders/dto';
import type {
  TechnicianDrilldownQueryDto,
  TechnicianDrilldownResponse,
  TechnicianDrilldownWorkOrder,
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
    let totalFirstTimeFixCount = 0;
    let totalDurationHours = 0;
    let totalDurationCount = 0;
    let totalRepairCount = 0;
    let totalWarrantyCount = 0;
    let totalMaintenanceCount = 0;
    let totalInspectionCount = 0;

    const items: TechnicianKpiItem[] = rows.map((row) => {
      const completedCount = count(row.completedCount ?? 0);
      const resolvedRepairCount = count(row.resolvedRepairCount ?? 0);
      const eligibleRepairCount = count(row.eligibleRepairCount ?? 0);
      const onTimeCount = count(row.onTimeCount ?? 0);
      const scheduledCount = count(row.scheduledCount ?? 0);
      const firstTimeFixCount = count(row.firstTimeFixCount ?? 0);
      const durationHours = Number(row.totalDurationHours ?? 0);
      const durationCount = count(row.durationCount ?? 0);
      const repairCount = count(row.repairCount ?? 0);
      const warrantyCount = count(row.warrantyCount ?? 0);
      const maintenanceCount = count(row.maintenanceCount ?? 0);
      const inspectionCount = count(row.inspectionCount ?? 0);

      totalCompletedCount += completedCount;
      totalResolvedRepairCount += resolvedRepairCount;
      totalEligibleRepairCount += eligibleRepairCount;
      totalOnTimeCount += onTimeCount;
      totalScheduledCount += scheduledCount;
      totalFirstTimeFixCount += firstTimeFixCount;
      totalDurationHours += durationHours;
      totalDurationCount += durationCount;
      totalRepairCount += repairCount;
      totalWarrantyCount += warrantyCount;
      totalMaintenanceCount += maintenanceCount;
      totalInspectionCount += inspectionCount;

      const repairSuccessRate =
        eligibleRepairCount > 0
          ? Math.round((resolvedRepairCount / eligibleRepairCount) * 10000) /
            10000
          : null;

      const onTimeRate =
        scheduledCount > 0
          ? Math.round((onTimeCount / scheduledCount) * 10000) / 10000
          : null;

      const averageMttrHours =
        durationCount > 0
          ? Math.round((durationHours / durationCount) * 100) / 100
          : null;

      const firstTimeFixRate =
        eligibleRepairCount > 0
          ? Math.round((firstTimeFixCount / eligibleRepairCount) * 10000) /
            10000
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
        averageMttrHours,
        firstTimeFixRate,
        firstTimeFixCount,
        repairCount,
        warrantyCount,
        maintenanceCount,
        inspectionCount,
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
      overallMttrHours:
        totalDurationCount > 0
          ? Math.round((totalDurationHours / totalDurationCount) * 100) / 100
          : null,
      overallFirstTimeFixRate:
        totalEligibleRepairCount > 0
          ? Math.round((totalFirstTimeFixCount / totalEligibleRepairCount) * 10000) /
            10000
          : null,
      totalFirstTimeFixCount,
      totalRepairCount,
      totalWarrantyCount,
      totalMaintenanceCount,
      totalInspectionCount,
    };

    return {
      ...range,
      timezone: 'Asia/Ho_Chi_Minh',
      items,
      summary,
    };
  }

  async technicianWorkOrders(
    p: Principal,
    technicianId: string,
    query: TechnicianDrilldownQueryDto,
  ): Promise<TechnicianDrilldownResponse> {
    const tenantId = requireTenantId(p);
    const range = reportRange(query.from, query.to);

    const technician = await this.repo.findTechnician(tenantId, technicianId);
    if (!technician) {
      throw new NotFoundException({
        code: 'TECHNICIAN_NOT_FOUND',
        message: 'Technician was not found',
      });
    }

    assertBranchAccess(p, technician.branchId);
    const branchId = staffBranchId(p);

    let rows;
    try {
      rows = await this.repo.technicianWorkOrders(
        tenantId,
        technicianId,
        range.from,
        range.to,
        branchId,
      );
    } catch {
      throw new ServiceUnavailableException({
        code: 'REPORT_UNAVAILABLE',
        message: 'Technician work orders report is unavailable',
      });
    }

    const customerIds = [...new Set(rows.map((r) => r.customerId))];
    const [userEntry, branchEntry, customers] = await Promise.all([
      this.names
        ?.lookup('users', [technician.userId], p)
        .then((m) => m.get(technician.userId.toLowerCase()))
        .catch(() => undefined),
      this.names
        ?.lookup('branches', [technician.branchId], p)
        .then((m) => m.get(technician.branchId.toLowerCase()))
        .catch(() => undefined),
      this.names?.lookup('customers', customerIds, p).catch(() => undefined),
    ]);

    const items: TechnicianDrilldownWorkOrder[] = rows.map((r) => ({
      id: r.id,
      workOrderNo: r.workOrderNo,
      title: r.title,
      type: r.type,
      priority: r.priority,
      status: r.status,
      customerId: r.customerId,
      customerName: customers?.get(r.customerId.toLowerCase())?.name ?? null,
      equipmentId: r.equipmentId,
      branchId: r.branchId,
      scheduledStart: r.scheduledStart
        ? new Date(r.scheduledStart).toISOString()
        : null,
      scheduledEnd: r.scheduledEnd
        ? new Date(r.scheduledEnd).toISOString()
        : null,
      startedAt: r.startedAt ? new Date(r.startedAt).toISOString() : null,
      completedAt: new Date(r.completedAt).toISOString(),
      durationHours: r.durationHours !== null ? Number(r.durationHours) : null,
      isOnTime: r.isOnTime,
      reportResult: r.reportResult,
      isFirstTimeFix: r.isFirstTimeFix,
    }));

    return {
      ...range,
      timezone: 'Asia/Ho_Chi_Minh',
      technician: {
        technicianId: technician.id,
        employeeCode: technician.employeeCode,
        fullName: userEntry?.name ?? null,
        branchId: technician.branchId,
        branchName: branchEntry?.name ?? null,
      },
      items,
      total: items.length,
    };
  }
}
