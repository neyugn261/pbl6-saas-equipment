import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { requireTenantId, type Principal } from '@pbl6/auth';
import { WO_STATUSES } from '../work-orders/dto';
import type { WorkOrderSummaryQueryDto } from './dto';
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
  constructor(private readonly repo: ReportsRepository) {}
  async summary(p: Principal, query: WorkOrderSummaryQueryDto) {
    const tenantId = requireTenantId(p);
    const range = reportRange(query.from, query.to);
    try {
      const row = await this.repo.summary(tenantId, range.from, range.to);
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
}
