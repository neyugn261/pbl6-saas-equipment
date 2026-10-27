import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PermissionCode, Principal } from '@pbl6/auth';
import {
  PaginationQueryDto,
  ServiceHttpClient,
  UpstreamError,
} from '@pbl6/service-kit';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { EquipmentService } from '../equipment/equipment.service';
import { HistoryFeedQuery, HistoryService } from '../history/history.service';
import { WarrantyService } from '../warranties/warranty.service';

type Row = Record<string, unknown>;
type Source = 'ORGANIZATION' | 'SERVICE_REQUEST' | 'WORKORDER' | 'MAINTENANCE';
export type Section<T> =
  | { status: 'AVAILABLE'; data: T; fetchedAt: string }
  | {
      status: 'RESTRICTED' | 'UNAVAILABLE' | 'NOT_CONFIGURED' | 'NOT_FOUND';
      data: null;
    };
export class LinkedQuery extends PaginationQueryDto {
  @IsOptional() @IsString() @MaxLength(150) status?: string;
}
const keys = (row: Row, names: string[]) =>
  Object.fromEntries(
    names.filter((key) => key in row).map((key) => [key, row[key]]),
  );
const same = (a: unknown, b: string) =>
  typeof a === 'string' && a.toLowerCase() === b.toLowerCase();
const asRow = (value: unknown): Row => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid source response');
  return value as Row;
};
const requestFields = [
  'id',
  'requestNo',
  'customerId',
  'equipmentId',
  'type',
  'priority',
  'title',
  'description',
  'status',
  'resolutionResult',
  'resolutionSummary',
  'resolvedWorkOrderNo',
  'resolutionCompletedAt',
  'createdAt',
  'updatedAt',
  'resolvedAt',
  'closedAt',
  'allowedActions',
];
const orderFields = [
  'id',
  'workOrderNo',
  'serviceRequestId',
  'maintenanceTaskId',
  'equipmentId',
  'customerId',
  'customerSiteId',
  'locationId',
  'type',
  'title',
  'description',
  'priority',
  'status',
  'scheduledStart',
  'scheduledEnd',
  'currentTechnicianId',
  'createdBy',
  'createdAt',
  'updatedAt',
  'startedAt',
  'completedAt',
  'cancelledAt',
  'currentAssignment',
  'serviceReportId',
  'allowedActions',
];

/** Read composition only. Every remote call carries the same user's token and correlation id. */
@Injectable()
export class DossierService {
  constructor(
    private readonly config: ConfigService,
    private readonly equipment: EquipmentService,
    private readonly history: HistoryService,
    private readonly warranties: WarrantyService,
  ) {}
  private permitted(p: Principal, source: Source) {
    const permission: PermissionCode =
      source === 'ORGANIZATION'
        ? 'customer:read'
        : source === 'SERVICE_REQUEST'
          ? 'service_request:read'
          : source === 'WORKORDER'
            ? 'work_order:read'
            : 'maintenance:read';
    return (
      p.permissions.has(permission) &&
      (source !== 'WORKORDER' || p.userType === 'TENANT_STAFF')
    );
  }
  private async section<T>(
    p: Principal,
    source: Source,
    work: (client: ServiceHttpClient) => Promise<T>,
  ): Promise<Section<T>> {
    if (!this.permitted(p, source)) return { status: 'RESTRICTED', data: null };
    const baseUrl = this.config.get<string>(`${source}_SERVICE_URL`);
    if (!baseUrl) return { status: 'NOT_CONFIGURED', data: null };
    try {
      const data = await work(
        new ServiceHttpClient({
          name: source.toLowerCase(),
          baseUrl,
          timeoutMs: 3000,
        }),
      );
      return { status: 'AVAILABLE', data, fetchedAt: new Date().toISOString() };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        (error instanceof UpstreamError && error.status === 404)
      )
        return { status: 'NOT_FOUND', data: null };
      if (error instanceof UpstreamError && [401, 403].includes(error.status))
        return { status: 'RESTRICTED', data: null };
      return { status: 'UNAVAILABLE', data: null };
    }
  }
  private association(row: Row, core: { id: string; customerId: string }) {
    if (
      !same(row.equipmentId, core.id) ||
      !same(row.customerId, core.customerId)
    )
      throw new NotFoundException();
  }
  private requestView(row: Row) {
    const status = row.status;
    const waitingFor = [
      'AWAITING_INFO',
      'AWAITING_CUSTOMER_APPROVAL',
      'RESOLVED',
    ].includes(String(status))
      ? 'CUSTOMER'
      : ['NEW', 'REVIEWING', 'COST_REJECTED', 'ACCEPTED'].includes(
            String(status),
          )
        ? 'SERVICE_MANAGER'
        : status === 'PROCESSING'
          ? 'WORK_ORDER_TEAM'
          : null;
    return {
      ...keys(row, requestFields),
      waitingFor,
      guidanceSource: 'SERVICE_REQUEST_STATUS',
      actionAuthority: 'SOURCE_ALLOWED_ACTIONS',
    };
  }
  private orderView(row: Row) {
    const status = String(row.status);
    const waitingFor =
      status === 'CREATED'
        ? 'DISPATCHER'
        : ['ASSIGNED', 'ACCEPTED', 'TRAVELLING', 'IN_PROGRESS'].includes(status)
          ? 'TECHNICIAN'
          : status === 'ON_HOLD'
            ? 'WORK_ORDER_TEAM_REVIEW_HOLD_REASON'
            : null;
    return {
      ...keys(row, orderFields),
      waitingFor,
      guidanceSource: 'WORK_ORDER_STATUS',
      actionAuthority: 'SOURCE_ALLOWED_ACTIONS',
    };
  }
  private async linked(
    p: Principal,
    core: { id: string; customerId: string },
    source: 'SERVICE_REQUEST' | 'WORKORDER',
    q: LinkedQuery,
  ) {
    return this.section(p, source, async (client) => {
      const path =
        source === 'SERVICE_REQUEST' ? '/service-requests' : '/work-orders';
      const page = asRow(
        await client.get(path, {
          accessToken: p.accessToken,
          query: {
            equipmentId: core.id,
            page: q.page,
            pageSize: q.pageSize,
            status: q.status,
            sort: '-createdAt',
          },
        }),
      );
      if (
        !Array.isArray(page.items) ||
        page.items.length > q.pageSize ||
        !Number.isSafeInteger(page.total) ||
        Number(page.total) < page.items.length
      )
        throw new Error('Invalid source page');
      return {
        items: page.items.map((value) => {
          const row = asRow(value);
          this.association(row, core);
          return source === 'SERVICE_REQUEST'
            ? this.requestView(row)
            : this.orderView(row);
        }),
        total: page.total as number,
        page: q.page,
        pageSize: q.pageSize,
      };
    });
  }
  async dossier(p: Principal, id: string) {
    const core = await this.equipment.detail(p, id); // Authorize locally before any remote lookup.
    const preview = Object.assign(new LinkedQuery(), { page: 1, pageSize: 5 });
    const [
      warranties,
      history,
      customer,
      site,
      contacts,
      location,
      requests,
      workOrders,
      maintenance,
      maintenanceHistory,
      latestCompletion,
    ] = await Promise.all([
      this.warranties.list(p, id),
      this.history.list(
        p,
        Object.assign(new HistoryFeedQuery(), { pageSize: 5 }),
        id,
      ),
      this.section(p, 'ORGANIZATION', async (c) => {
        const row = asRow(
          await c.get(`/customers/${core.customerId}`, {
            accessToken: p.accessToken,
          }),
        );
        if (!same(row.id, core.customerId)) throw new NotFoundException();
        return keys(row, [
          'id',
          'code',
          'name',
          'phone',
          'email',
          'address',
          'status',
        ]);
      }),
      this.section(p, 'ORGANIZATION', async (c) => {
        const row = asRow(
          await c.get(`/sites/${core.customerSiteId}`, {
            accessToken: p.accessToken,
          }),
        );
        if (
          !same(row.id, core.customerSiteId) ||
          !same(row.customerId, core.customerId)
        )
          throw new NotFoundException();
        return keys(row, [
          'id',
          'customerId',
          'code',
          'name',
          'address',
          'phone',
          'status',
        ]);
      }),
      this.section(p, 'ORGANIZATION', async (c) => {
        const rows = await c.get<Row[]>(
          `/customers/${core.customerId}/contacts`,
          { accessToken: p.accessToken },
        );
        if (!Array.isArray(rows)) throw new Error('Invalid contacts');
        return rows
          .filter(
            (row) =>
              same(row.customerId, core.customerId) &&
              (!row.customerSiteId ||
                same(row.customerSiteId, core.customerSiteId)),
          )
          .map((row) =>
            keys(row, [
              'id',
              'customerId',
              'customerSiteId',
              'name',
              'email',
              'phone',
              'position',
              'isPrimary',
            ]),
          );
      }),
      core.locationId
        ? this.section(p, 'ORGANIZATION', async (c) => {
            const rows = await c.get<Row[]>(
              `/sites/${core.customerSiteId}/locations`,
              { accessToken: p.accessToken },
            );
            const row = Array.isArray(rows)
              ? rows.find((item) => same(item.id, core.locationId!))
              : undefined;
            if (!row) throw new NotFoundException();
            return keys(row, [
              'id',
              'customerSiteId',
              'code',
              'name',
              'description',
              'status',
            ]);
          })
        : Promise.resolve({
            status: 'AVAILABLE' as const,
            data: null,
            fetchedAt: new Date().toISOString(),
          }),
      this.linked(p, core, 'SERVICE_REQUEST', preview),
      this.linked(p, core, 'WORKORDER', preview),
      this.section(p, 'MAINTENANCE', (c) =>
        c.get('/maintenance-summary', {
          accessToken: p.accessToken,
          query: { equipmentId: id },
        }),
      ),
      this.section(p, 'MAINTENANCE', (c) =>
        c.get('/maintenance-history', {
          accessToken: p.accessToken,
          query: { equipmentId: id, page: 1, pageSize: 5 },
        }),
      ),
      this.history.latestCompletion(p, id),
    ]);
    const missingFields = [
      'displayName',
      'installationDate',
      'handoverDate',
      'commissionedDate',
    ].filter((field) => !core[field as keyof typeof core]);
    if (
      !core.technicalSpecifications ||
      !Object.keys(core.technicalSpecifications).length
    )
      missingFields.push('technicalSpecifications');
    return {
      equipment: core,
      warranties,
      calendarCoverage: core.warranty,
      coverageMeaning:
        'CALENDAR_ONLY_CLAIM_DECISION_BELONGS_TO_SERVICE_REQUEST',
      operationalCondition: {
        status: core.operationalStatus,
        confirmedAt: core.operationalStatusUpdatedAt,
        confirmedBy:
          p.userType === 'CUSTOMER' ? null : core.operationalStatusUpdatedBy,
        meaning: 'EXPLICIT_CONFIRMATION_NOT_INFERRED_FROM_WORK_ORDER',
        confirmationIsCurrentHealthGuarantee: false,
      },
      profileCompleteness: {
        missingFields,
        legacyHistoryMayBeIncomplete: true,
      },
      customer,
      site,
      contacts,
      location,
      latestRecordedService: {
        entry: latestCompletion,
        basis: 'LATEST_OCCURRED_COMPLETION_CONSUMED_BY_ASSET',
        mayLagSourceService: true,
      },
      requests,
      workOrders,
      maintenance,
      maintenanceHistory,
      timelinePreview: history,
      previewLimit: 5,
      asOf: new Date().toISOString(),
      consistency: 'INDEPENDENT_SERVICE_READS',
      historyCoverage: {
        asset: 'LOCAL_MUTATIONS_AND_CONSUMED_REQUEST_STATUS_WO_COMPLETION',
        maintenance: 'LOCAL_PLAN_TASK_LEDGER',
        sourceRequest: 'DETAIL_HISTORY_AND_COMMENTS',
        sourceWorkOrder: 'STAFF_DETAIL_HISTORY_ASSIGNMENTS_LOGS_REPORT',
        beforeAuditDeployment: 'MAY_BE_INCOMPLETE',
      },
      links: {
        timeline: `/equipment/${id}/timeline`,
        serviceRequests: `/equipment/${id}/service-requests`,
        workOrders: `/equipment/${id}/work-orders`,
        maintenancePlans: `/equipment/${id}/maintenance-plans`,
        maintenanceTasks: `/equipment/${id}/maintenance-tasks`,
        maintenanceHistory: `/maintenance-history?equipmentId=${id}`,
      },
    };
  }
  async list(
    p: Principal,
    id: string,
    source: 'SERVICE_REQUEST' | 'WORKORDER',
    q: LinkedQuery,
  ) {
    const core = await this.equipment.detail(p, id);
    return this.linked(p, core, source, q);
  }
  async request(p: Principal, id: string, requestId: string) {
    const core = await this.equipment.detail(p, id);
    return this.section(p, 'SERVICE_REQUEST', async (client) => {
      const path = `/service-requests/${requestId}`;
      const row = asRow(await client.get(path, { accessToken: p.accessToken }));
      this.association(row, core);
      if (!same(row.id, requestId)) throw new NotFoundException();
      const [history, comments, estimates] = await Promise.all([
        this.section(p, 'SERVICE_REQUEST', (c) =>
          c.get(`${path}/history`, { accessToken: p.accessToken }),
        ),
        this.section(p, 'SERVICE_REQUEST', (c) =>
          c.get(`${path}/comments`, { accessToken: p.accessToken }),
        ),
        this.section(p, 'SERVICE_REQUEST', (c) =>
          c.get(`${path}/estimates`, { accessToken: p.accessToken }),
        ),
      ]);
      return {
        request: this.requestView(row),
        warrantyCheck: row.warrantyCheck ?? null,
        liveEstimate: row.liveEstimate ?? null,
        calendarCoverageNow: core.warranty,
        claimDecisionMeaning: 'SNAPSHOT_AT_SERVICE_REQUEST_REVIEW',
        history,
        comments,
        estimates,
      };
    });
  }
  async order(p: Principal, id: string, orderId: string) {
    const core = await this.equipment.detail(p, id);
    return this.section(p, 'WORKORDER', async (client) => {
      const path = `/work-orders/${orderId}`;
      const row = asRow(await client.get(path, { accessToken: p.accessToken }));
      this.association(row, core);
      if (!same(row.id, orderId)) throw new NotFoundException();
      const [history, assignments, logs, report] = await Promise.all(
        ['history', 'assignments', 'logs', 'service-report'].map((part) =>
          this.section(p, 'WORKORDER', (c) =>
            c.get(`${path}/${part}`, { accessToken: p.accessToken }),
          ),
        ),
      );
      return {
        workOrder: this.orderView(row),
        history,
        assignments,
        logs,
        report,
        scheduleMeaning: 'SCHEDULED_WINDOW_NOT_CONFIRMED_APPOINTMENT',
        operationalCondition: core.operationalStatus,
      };
    });
  }
  async maintenanceList(
    p: Principal,
    id: string,
    tasks: boolean,
    q: LinkedQuery,
  ) {
    const core = await this.equipment.detail(p, id);
    return this.section(p, 'MAINTENANCE', async (c) => {
      const page = asRow(
        await c.get(tasks ? '/maintenance-tasks' : '/maintenance-plans', {
          accessToken: p.accessToken,
          query: {
            equipmentId: id,
            page: q.page,
            pageSize: q.pageSize,
            status: q.status,
          },
        }),
      );
      if (!Array.isArray(page.items) || !Number.isSafeInteger(page.total))
        throw new Error('Invalid maintenance page');
      for (const row of page.items) this.association(asRow(row), core);
      return page;
    });
  }
}
