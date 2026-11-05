import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { permissionsOf } from '@pbl6/auth';
import {
  Events,
  backoffDelay,
  is,
  isEvent,
  PRIORITIES,
  REPORT_RESULTS,
  SERVICE_REQUEST_STATUSES,
  SERVICE_REQUEST_TYPES,
  type EventEnvelope,
} from '@pbl6/event-contracts';
import { isUUID } from 'class-validator';
import {
  Prisma,
  type PendingNotificationEvent,
  type RecipientSnapshot,
  type ServiceRequestSnapshot,
} from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service';

export const NOTIFICATION_BUSINESS_CONSUMER =
  'notification-service.business-events';

export const NOTIFICATION_BUSINESS_EVENTS = [
  Events.EquipmentHandoverChanged,
  Events.ServiceRequestCreated,
  Events.ServiceRequestStatusChanged,
  Events.WorkOrderCreated,
  Events.WorkOrderAssigned,
  Events.WorkOrderCompletedV2,
  Events.WorkOrderCancelledV2,
  Events.LowStockDetected,
] as const;

const RETRY_POLICY = {
  maxAttempts: 10,
  baseDelayMs: 1_000,
  maxDelayMs: 60_000,
} as const;

type PendingPayload =
  | { kind: 'EQUIPMENT_HANDOVER_CHANGED'; occurredAt: string; handoverId: string; equipmentId: string;
      customerId: string; createdBy: string; handoverNo: string; assetCode: string; version: number;
      status: 'PENDING_CUSTOMER_CONFIRMATION' | 'ACTIVATED' | 'REJECTED' | 'CANCELLED' | 'EXPIRED' }
  | {
      kind: 'SERVICE_REQUEST_CREATED';
      occurredAt: string;
      serviceRequestId: string;
      requestNo: string;
      customerId: string;
      equipmentId: string;
      requesterId: string;
      requestType: string;
      priority: string;
    }
  | {
      kind: 'SERVICE_REQUEST_STATUS_CHANGED';
      occurredAt: string;
      serviceRequestId: string;
      requestNo: string;
      customerId: string;
      equipmentId: string;
      fromStatus: string | null;
      toStatus: string;
    }
  | {
      kind: 'WORK_ORDER_CREATED';
      occurredAt: string;
      workOrderId: string;
      workOrderNo: string;
      serviceRequestId: string | null;
      maintenanceTaskId: string | null;
      customerId: string;
    }
  | {
      kind: 'WORK_ORDER_ASSIGNED';
      occurredAt: string;
      workOrderId: string;
      workOrderNo: string;
      technicianUserId: string;
      scheduledStart: string | null;
    }
  | {
      kind: 'WORK_ORDER_COMPLETED';
      occurredAt: string;
      workOrderId: string;
      workOrderNo: string;
      serviceRequestId: string | null;
      maintenanceTaskId: string | null;
      customerId: string;
      result: string;
      customerSummary: string;
    }
  | {
      kind: 'WORK_ORDER_CANCELLED';
      occurredAt: string;
      workOrderId: string;
      workOrderNo: string;
      serviceRequestId: string | null;
      maintenanceTaskId: string | null;
      cancelServiceRequest: boolean;
    }
  | {
      kind: 'LOW_STOCK_DETECTED';
      occurredAt: string;
      stockId: string;
      partSku: string;
      quantity: string;
      minQuantity: string;
    };

interface Recipient {
  userId: string;
  customerId: string | null;
}

interface RenderedNotification {
  title: string;
  body: string;
  resourceType: string;
  resourceId: string;
}

type ReconcileResult =
  | {
      kind: 'READY';
      recipients: Recipient[];
      rendered: RenderedNotification;
      customerRendered?: RenderedNotification;
    }
  | { kind: 'WAIT'; reason: string }
  | { kind: 'STALE' }
  | { kind: 'CONFLICT'; reason: string; expectedHash: string; observedHash: string };

@Injectable()
export class NotificationEventsService {
  constructor(private readonly prisma: PrismaService) {}

  async handle(envelope: EventEnvelope): Promise<void> {
    const payload = this.allowlistedPayload(envelope);
    const tenantId = envelope.tenantId;
    if (!payload || !tenantId) {
      throw new Error('Unsupported or unscoped Notification business event');
    }

    const digest = this.hash({
      tenantId,
      eventType: envelope.eventType,
      eventVersion: envelope.eventVersion,
      payload,
    });

    await this.prisma.$transaction(async (tx) => {
      const inserted = await tx.$executeRaw`
        INSERT INTO processed_events (event_id, consumer, event_type)
        VALUES (
          ${envelope.eventId}::uuid,
          ${NOTIFICATION_BUSINESS_CONSUMER},
          ${`${envelope.eventType}.v${envelope.eventVersion}`}
        )
        ON CONFLICT (event_id, consumer) DO NOTHING
      `;
      const key = {
        sourceEventId_consumer: {
          sourceEventId: envelope.eventId,
          consumer: NOTIFICATION_BUSINESS_CONSUMER,
        },
      };
      const existing = await tx.pendingNotificationEvent.findUnique({
        where: key,
      });

      if (inserted === 0) {
        if (!existing) {
          throw new Error('Notification inbox row has no durable event record');
        }
        if (existing.payloadSha256 !== digest) {
          await this.recordConflict(
            tx,
            envelope.eventId,
            existing.eventType,
            existing.payloadSha256,
            digest,
          );
          await tx.pendingNotificationEvent.update({
            where: key,
            data: {
              status: 'MANUAL_REVIEW',
              reason: 'EVENT_ID_PAYLOAD_CONFLICT',
              lastErrorCategory: 'EVENT_ID_PAYLOAD_CONFLICT',
            },
          });
        }
        return;
      }

      await tx.pendingNotificationEvent.create({
        data: {
          sourceEventId: envelope.eventId,
          consumer: NOTIFICATION_BUSINESS_CONSUMER,
          tenantId,
          eventType: envelope.eventType,
          eventVersion: envelope.eventVersion,
          payload,
          payloadSha256: digest,
          reason: 'WAITING_FOR_PROJECTION',
          nextAttemptAt: new Date(0),
        },
      });

      if (isEvent(envelope, Events.ServiceRequestCreated)) {
        await this.projectServiceRequestCreated(tx, envelope, payload);
      }

      await this.reconcileTenant(tx, tenantId, true);
    });
  }

  async reconcileDue(): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<PendingNotificationEvent[]>`
        SELECT
          source_event_id AS "sourceEventId",
          consumer,
          tenant_id AS "tenantId",
          event_type AS "eventType",
          event_version AS "eventVersion",
          payload,
          payload_sha256 AS "payloadSha256",
          status,
          reason,
          attempts,
          next_attempt_at AS "nextAttemptAt",
          last_error_category AS "lastErrorCategory",
          lease_until AS "leaseUntil",
          created_at AS "createdAt",
          updated_at AS "updatedAt",
          resolved_at AS "resolvedAt"
        FROM pending_notification_events
        WHERE status IN ('PENDING', 'RETRYING')
          AND next_attempt_at <= now()
          AND (lease_until IS NULL OR lease_until <= now())
        ORDER BY next_attempt_at, created_at
        LIMIT 50
        FOR UPDATE SKIP LOCKED
      `;
      for (const row of this.orderBySourceTime(rows)) {
        await this.reconcileOne(tx, row);
      }
    });
  }

  async reconcileTenant(
    tx: Prisma.TransactionClient,
    tenantId: string,
    ignoreBackoff = false,
  ): Promise<void> {
    const rows = await tx.pendingNotificationEvent.findMany({
      where: {
        tenantId,
        status: { in: ['PENDING', 'RETRYING', 'MANUAL_REVIEW'] },
        ...(ignoreBackoff ? {} : { nextAttemptAt: { lte: new Date() } }),
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
    for (const row of this.orderBySourceTime(rows)) {
      await this.reconcileOne(tx, row);
    }
  }

  private async projectServiceRequestCreated(
    tx: Prisma.TransactionClient,
    envelope: EventEnvelope,
    payload: PendingPayload,
  ): Promise<void> {
    if (payload.kind !== 'SERVICE_REQUEST_CREATED' || !envelope.tenantId) {
      throw new Error('Invalid Service Request creation projection');
    }
    const key = {
      tenantId_serviceRequestId: {
        tenantId: envelope.tenantId,
        serviceRequestId: payload.serviceRequestId,
      },
    };
    const existing = await tx.serviceRequestSnapshot.findUnique({
      where: key,
    });
    const sourceOccurredAt = new Date(payload.occurredAt);
    if (!existing) {
      await tx.serviceRequestSnapshot.create({
        data: {
          tenantId: envelope.tenantId,
          serviceRequestId: payload.serviceRequestId,
          requestNo: payload.requestNo,
          customerId: payload.customerId,
          requesterId: payload.requesterId,
          requestType: payload.requestType,
          priority: payload.priority,
          status: 'NEW',
          createdEventId: envelope.eventId,
          sourceOccurredAt,
        },
      });
      return;
    }

    const sameOrigin =
      existing.requestNo === payload.requestNo &&
      existing.customerId === payload.customerId &&
      existing.requesterId === payload.requesterId &&
      existing.requestType === payload.requestType &&
      existing.priority === payload.priority;
    if (!sameOrigin) {
      await this.recordConflict(
        tx,
        envelope.eventId,
        'ServiceRequestCreated.v1',
        this.hash({
          requestNo: existing.requestNo,
          customerId: existing.customerId,
          requesterId: existing.requesterId,
          requestType: existing.requestType,
          priority: existing.priority,
        }),
        this.hash(payload),
      );
      await tx.pendingNotificationEvent.update({
        where: {
          sourceEventId_consumer: {
            sourceEventId: envelope.eventId,
            consumer: NOTIFICATION_BUSINESS_CONSUMER,
          },
        },
        data: {
          status: 'MANUAL_REVIEW',
          reason: 'SERVICE_REQUEST_PROJECTION_CONFLICT',
          lastErrorCategory: 'SERVICE_REQUEST_PROJECTION_CONFLICT',
        },
      });
    }
  }

  private async reconcileOne(
    tx: Prisma.TransactionClient,
    row: PendingNotificationEvent,
  ): Promise<void> {
    if (
      row.status === 'MANUAL_REVIEW' &&
      !row.reason.startsWith('WAITING_FOR_')
    ) {
      return;
    }
    const key = {
      sourceEventId_consumer: {
        sourceEventId: row.sourceEventId,
        consumer: row.consumer,
      },
    };
    const payload = this.readPendingPayload(row.payload);
    if (!payload) {
      await tx.pendingNotificationEvent.update({
        where: key,
        data: {
          status: 'MANUAL_REVIEW',
          reason: 'INVALID_STORED_PAYLOAD',
          lastErrorCategory: 'INVALID_STORED_PAYLOAD',
        },
      });
      return;
    }

    const completedBootstrap = await tx.recipientBootstrapRun.findFirst({
      where: { tenantId: row.tenantId, status: 'COMPLETED' },
      select: { bootstrapRunId: true },
    });
    if (!completedBootstrap) {
      await this.defer(tx, row, 'WAITING_FOR_RECIPIENT_BOOTSTRAP');
      return;
    }

    let serviceRequest: ServiceRequestSnapshot | null = null;
    if (payload.kind === 'SERVICE_REQUEST_STATUS_CHANGED') {
      const statusResult = await this.applyServiceRequestStatus(
        tx,
        row,
        payload,
      );
      if (statusResult.kind === 'WAIT') {
        await this.defer(tx, row, statusResult.reason);
        return;
      }
      if (statusResult.kind === 'STALE') {
        await this.resolve(tx, row);
        return;
      }
      if (statusResult.kind === 'CONFLICT') {
        await this.recordConflict(
          tx,
          row.sourceEventId,
          row.eventType,
          statusResult.expectedHash,
          statusResult.observedHash,
        );
        await this.markManualReview(tx, row, statusResult.reason);
        return;
      }
      serviceRequest = statusResult.serviceRequest;
    } else {
      const serviceRequestId = this.serviceRequestId(payload);
      if (serviceRequestId) {
        serviceRequest = await tx.serviceRequestSnapshot.findUnique({
          where: {
            tenantId_serviceRequestId: {
              tenantId: row.tenantId,
              serviceRequestId,
            },
          },
        });
        if (!serviceRequest) {
          await this.defer(tx, row, 'WAITING_FOR_SERVICE_REQUEST_PROJECTION');
          return;
        }
      }
    }
    const workOrderCustomerId = this.workOrderCustomerId(payload);
    if (
      serviceRequest &&
      workOrderCustomerId &&
      workOrderCustomerId !== serviceRequest.customerId
    ) {
      await this.recordConflict(
        tx,
        row.sourceEventId,
        row.eventType,
        this.hash({ customerId: serviceRequest.customerId }),
        this.hash({ customerId: workOrderCustomerId }),
      );
      await this.markManualReview(
        tx,
        row,
        'WORK_ORDER_SERVICE_REQUEST_CUSTOMER_CONFLICT',
      );
      return;
    }

    const terminalResult = await this.checkTerminalConflict(tx, row, payload);
    if (terminalResult) {
      if (terminalResult.kind === 'STALE') {
        await this.resolve(tx, row);
      } else {
        await this.recordConflict(
          tx,
          row.sourceEventId,
          row.eventType,
          terminalResult.expectedHash,
          terminalResult.observedHash,
        );
        await this.markManualReview(tx, row, terminalResult.reason);
      }
      return;
    }

    const result = await this.resolveRecipients(tx, row, payload, serviceRequest);
    if (result.kind === 'WAIT') {
      await this.defer(tx, row, result.reason);
      return;
    }
    if (result.kind === 'STALE') {
      await this.resolve(tx, row);
      return;
    }
    if (result.kind === 'CONFLICT') {
      await this.recordConflict(
        tx,
        row.sourceEventId,
        row.eventType,
        result.expectedHash,
        result.observedHash,
      );
      await this.markManualReview(tx, row, result.reason);
      return;
    }

    const now = new Date();
    const deliveries = result.recipients.map((recipient) => ({
      sourceEventId: row.sourceEventId,
      consumer: row.consumer,
      userId: recipient.userId,
      customerId: recipient.customerId,
      channel: 'IN_APP',
      status: 'COMPLETED',
      completedAt: now,
    }));
    if (deliveries.length > 0) {
      await tx.pendingNotificationDelivery.createMany({
        data: deliveries,
        skipDuplicates: true,
      });
      await tx.notification.createMany({
        data: result.recipients.map((recipient) => {
          const rendered =
            recipient.customerId && result.customerRendered
              ? result.customerRendered
              : result.rendered;
          return {
            tenantId: row.tenantId,
            userId: recipient.userId,
            customerId: recipient.customerId,
            sourceEventId: row.sourceEventId,
            type: `${row.eventType}.v${row.eventVersion}`,
            title: rendered.title,
            content: rendered.body,
            payload: {
              resourceType: rendered.resourceType,
              resourceId: rendered.resourceId,
            },
            channel: 'IN_APP',
            status: 'SENT',
            sentAt: now,
          };
        }),
        skipDuplicates: true,
      });
    }
    await this.resolve(tx, row);
  }

  private async applyServiceRequestStatus(
    tx: Prisma.TransactionClient,
    row: PendingNotificationEvent,
    payload: Extract<
      PendingPayload,
      { kind: 'SERVICE_REQUEST_STATUS_CHANGED' }
    >,
  ): Promise<
    | { kind: 'APPLIED'; serviceRequest: ServiceRequestSnapshot }
    | { kind: 'WAIT'; reason: string }
    | { kind: 'STALE' }
    | {
        kind: 'CONFLICT';
        reason: string;
        expectedHash: string;
        observedHash: string;
      }
  > {
    const key = {
      tenantId_serviceRequestId: {
        tenantId: row.tenantId,
        serviceRequestId: payload.serviceRequestId,
      },
    };
    const current = await tx.serviceRequestSnapshot.findUnique({
      where: key,
    });
    if (!current) return { kind: 'WAIT', reason: 'WAITING_FOR_SERVICE_REQUEST_PROJECTION' };
    if (
      current.customerId !== payload.customerId ||
      current.requestNo !== payload.requestNo
    ) {
      return {
        kind: 'CONFLICT',
        reason: 'SERVICE_REQUEST_STATUS_CONTEXT_CONFLICT',
        expectedHash: this.hash({
          customerId: current.customerId,
          requestNo: current.requestNo,
        }),
        observedHash: this.hash({
          customerId: payload.customerId,
          requestNo: payload.requestNo,
        }),
      };
    }

    const occurredAt = new Date(payload.occurredAt);
    if (occurredAt < current.sourceOccurredAt) return { kind: 'STALE' };
    if (
      occurredAt.getTime() === current.sourceOccurredAt.getTime() &&
      current.status !== payload.toStatus
    ) {
      return {
        kind: 'CONFLICT',
        reason: 'SERVICE_REQUEST_STATUS_ORDER_CONFLICT',
        expectedHash: this.hash({
          status: current.status,
          occurredAt: current.sourceOccurredAt.toISOString(),
        }),
        observedHash: this.hash({
          status: payload.toStatus,
          occurredAt: payload.occurredAt,
        }),
      };
    }
    if (
      payload.fromStatus !== null &&
      current.status !== payload.fromStatus &&
      current.status !== payload.toStatus
    ) {
      return { kind: 'WAIT', reason: 'WAITING_FOR_SERVICE_REQUEST_STATUS_ORDER' };
    }
    if (current.status === payload.toStatus) {
      return { kind: 'APPLIED', serviceRequest: current };
    }

    const update = await tx.serviceRequestSnapshot.updateMany({
      where: {
        ...key.tenantId_serviceRequestId,
        status: current.status,
        sourceOccurredAt: current.sourceOccurredAt,
      },
      data: {
        status: payload.toStatus,
        latestStatusEventId: row.sourceEventId,
        latestStatusChangedAt: occurredAt,
        sourceOccurredAt: occurredAt,
        updatedAt: new Date(),
      },
    });
    if (update.count === 0) {
      return { kind: 'WAIT', reason: 'WAITING_FOR_SERVICE_REQUEST_STATUS_ORDER' };
    }
    const updated = await tx.serviceRequestSnapshot.findUnique({ where: key });
    if (!updated) throw new Error('Service Request projection disappeared');
    return { kind: 'APPLIED', serviceRequest: updated };
  }

  private async resolveRecipients(
    tx: Prisma.TransactionClient,
    row: PendingNotificationEvent,
    payload: PendingPayload,
    serviceRequest: ServiceRequestSnapshot | null,
  ): Promise<ReconcileResult> {
    const recipients = new Map<string, Recipient>();
    let rendered: RenderedNotification;

    switch (payload.kind) {
      case 'EQUIPMENT_HANDOVER_CHANGED': {
        // A late submit notification must not override a terminal decision.
        const newer = await tx.pendingNotificationEvent.findFirst({ where: {
          tenantId: row.tenantId, eventType: 'EquipmentHandoverChanged',
          AND: [{ payload: { path: ['handoverId'], equals: payload.handoverId } },
            { payload: { path: ['version'], gt: payload.version } }],
        } });
        if (newer) return { kind: 'STALE' };
        if (payload.status === 'PENDING_CUSTOMER_CONFIRMATION' || payload.status === 'ACTIVATED') {
          const customers = await tx.recipientSnapshot.findMany({ where: { tenantId: row.tenantId,
            userType: 'CUSTOMER', customerId: payload.customerId, accountStatus: 'ACTIVE', membershipStatus: 'ACTIVE' } });
          for (const customer of customers) {
            if (customer.membershipId && customer.membershipSourceChangedAt && this.canReadNotifications(customer) &&
              permissionsOf(this.roles(customer)).has('equipment_handover:respond')) {
              this.add(recipients, { userId: customer.userId, customerId: payload.customerId });
            }
          }
          if (recipients.size === 0 && payload.status === 'PENDING_CUSTOMER_CONFIRMATION')
            return { kind: 'WAIT', reason: 'WAITING_FOR_HANDOVER_CUSTOMER_RECIPIENT' };
        }
        if (payload.status !== 'PENDING_CUSTOMER_CONFIRMATION') {
          await this.addStaffByRoles(tx, row.tenantId, ['TENANT_ADMIN', 'SERVICE_MANAGER'], recipients);
        }
        const labels = { PENDING_CUSTOMER_CONFIRMATION: 'Bạn có thiết bị mới cần xác nhận bàn giao.',
          ACTIVATED: 'Bàn giao đã được xác nhận và thiết bị đã kích hoạt.', REJECTED: 'Khách hàng đã từ chối bàn giao.',
          EXPIRED: 'Yêu cầu xác nhận bàn giao đã hết hạn.', CANCELLED: 'Yêu cầu bàn giao đã bị hủy.' };
        rendered = { title: labels[payload.status], body: `${payload.handoverNo} · ${payload.assetCode}`,
          resourceType: 'EQUIPMENT_HANDOVER', resourceId: payload.handoverId };
        break;
      }
      case 'SERVICE_REQUEST_CREATED': {
        const requester = await this.getRequester(
          tx,
          row.tenantId,
          payload.requesterId,
          payload.customerId,
        );
        if (requester.kind === 'WAIT') return requester;
        if (requester.recipient) this.add(recipients, requester.recipient);
        await this.addStaffByRoles(
          tx,
          row.tenantId,
          ['SERVICE_MANAGER', 'DISPATCHER'],
          recipients,
        );
        rendered = {
          title: 'New service request',
          body: `${payload.requestNo} was created.`,
          resourceType: 'SERVICE_REQUEST',
          resourceId: payload.serviceRequestId,
        };
        break;
      }
      case 'SERVICE_REQUEST_STATUS_CHANGED': {
        if (!serviceRequest) return { kind: 'WAIT', reason: 'WAITING_FOR_SERVICE_REQUEST_PROJECTION' };
        const requester = await this.getRequester(
          tx,
          row.tenantId,
          serviceRequest.requesterId,
          serviceRequest.customerId,
        );
        if (requester.kind === 'WAIT') return requester;
        if (requester.recipient) this.add(recipients, requester.recipient);
        await this.addStaffByRoles(
          tx,
          row.tenantId,
          ['SERVICE_MANAGER', 'DISPATCHER'],
          recipients,
        );
        rendered = {
          title: 'Service request updated',
          body: `${payload.requestNo} is now ${payload.toStatus.replaceAll('_', ' ').toLowerCase()}.`,
          resourceType: 'SERVICE_REQUEST',
          resourceId: payload.serviceRequestId,
        };
        break;
      }
      case 'WORK_ORDER_ASSIGNED': {
        const technician = await tx.recipientSnapshot.findUnique({
          where: { userId: payload.technicianUserId },
        });
        if (!technician) {
          return { kind: 'WAIT', reason: 'WAITING_FOR_TECHNICIAN_PROJECTION' };
        }
        if (this.hasRole(technician, 'TECHNICIAN', row.tenantId)) {
          this.add(recipients, {
            userId: technician.userId,
            customerId: null,
          });
        }
        rendered = {
          title: 'Work order assigned',
          body: payload.scheduledStart
            ? `${payload.workOrderNo} is scheduled for ${payload.scheduledStart}.`
            : `${payload.workOrderNo} was assigned to you.`,
          resourceType: 'WORK_ORDER',
          resourceId: payload.workOrderId,
        };
        break;
      }
      case 'WORK_ORDER_CREATED': {
        await this.addStaffByRoles(
          tx,
          row.tenantId,
          ['SERVICE_MANAGER', 'DISPATCHER'],
          recipients,
        );
        let customerRendered: RenderedNotification | undefined;
        if (serviceRequest) {
          const requester = await this.getRequester(
            tx,
            row.tenantId,
            serviceRequest.requesterId,
            serviceRequest.customerId,
          );
          if (requester.kind === 'WAIT') return requester;
          if (requester.recipient) {
            this.add(recipients, requester.recipient);
            if (requester.recipient.customerId) {
              customerRendered = {
                title: 'Service request update',
                body: `Work order ${payload.workOrderNo} was created for your service request.`,
                resourceType: 'SERVICE_REQUEST',
                resourceId: serviceRequest.serviceRequestId,
              };
            }
          }
        }
        rendered = {
          title: 'Work order created',
          body: `${payload.workOrderNo} was created.`,
          resourceType: 'WORK_ORDER',
          resourceId: payload.workOrderId,
        };
        return {
          kind: 'READY',
          recipients: [...recipients.values()],
          rendered,
          ...(customerRendered ? { customerRendered } : {}),
        };
      }
      case 'WORK_ORDER_COMPLETED': {
        await this.addStaffByRoles(
          tx,
          row.tenantId,
          ['SERVICE_MANAGER', 'DISPATCHER'],
          recipients,
        );
        let customerRendered: RenderedNotification | undefined;
        if (serviceRequest) {
          const requester = await this.getRequester(
            tx,
            row.tenantId,
            serviceRequest.requesterId,
            serviceRequest.customerId,
          );
          if (requester.kind === 'WAIT') return requester;
          if (requester.recipient) {
            this.add(recipients, requester.recipient);
            if (requester.recipient.customerId) {
              customerRendered = {
                title: 'Service request completed',
                body: payload.customerSummary.slice(0, 1000),
                resourceType: 'SERVICE_REQUEST',
                resourceId: serviceRequest.serviceRequestId,
              };
            }
          }
        }
        rendered = {
          title: 'Work order completed',
          body: `${payload.workOrderNo} was completed (${payload.result.replaceAll('_', ' ').toLowerCase()}).`,
          resourceType: 'WORK_ORDER',
          resourceId: payload.workOrderId,
        };
        return {
          kind: 'READY',
          recipients: [...recipients.values()],
          rendered,
          ...(customerRendered ? { customerRendered } : {}),
        };
      }
      case 'WORK_ORDER_CANCELLED': {
        await this.addStaffByRoles(
          tx,
          row.tenantId,
          ['SERVICE_MANAGER', 'DISPATCHER'],
          recipients,
        );
        rendered = {
          title: 'Work order cancelled',
          body: `${payload.workOrderNo} was cancelled.`,
          resourceType: 'WORK_ORDER',
          resourceId: payload.workOrderId,
        };
        break;
      }
      case 'LOW_STOCK_DETECTED': {
        await this.addStaffByRoles(
          tx,
          row.tenantId,
          ['INVENTORY_STAFF'],
          recipients,
        );
        rendered = {
          title: 'Low stock detected',
          body: `${payload.partSku}: ${payload.quantity} available; minimum ${payload.minQuantity}.`,
          resourceType: 'STOCK',
          resourceId: payload.stockId,
        };
        break;
      }
    }

    return { kind: 'READY', recipients: [...recipients.values()], rendered };
  }

  private async getRequester(
    tx: Prisma.TransactionClient,
    tenantId: string,
    userId: string,
    customerId: string,
  ): Promise<
    | { kind: 'OK'; recipient: Recipient | null }
    | { kind: 'WAIT'; reason: string }
  > {
    const snapshot = await tx.recipientSnapshot.findUnique({ where: { userId } });
    if (!snapshot) return { kind: 'WAIT', reason: 'WAITING_FOR_REQUESTER_PROJECTION' };
    if (
      snapshot.tenantId !== tenantId ||
      snapshot.accountStatus !== 'ACTIVE' ||
      !this.canReadNotifications(snapshot)
    ) {
      return { kind: 'OK', recipient: null };
    }
    if (snapshot.userType === 'CUSTOMER') {
      if (
        snapshot.membershipStatus === 'ACTIVE' &&
        snapshot.membershipId &&
        snapshot.membershipSourceChangedAt &&
        snapshot.customerId === customerId
      ) {
        return {
          kind: 'OK',
          recipient: { userId, customerId },
        };
      }
      return { kind: 'OK', recipient: null };
    }
    if (snapshot.userType === 'TENANT_STAFF') {
      return { kind: 'OK', recipient: { userId, customerId: null } };
    }
    return { kind: 'OK', recipient: null };
  }

  private async addStaffByRoles(
    tx: Prisma.TransactionClient,
    tenantId: string,
    roles: string[],
    recipients: Map<string, Recipient>,
  ): Promise<void> {
    const snapshots = await tx.recipientSnapshot.findMany({
      where: {
        tenantId,
        userType: 'TENANT_STAFF',
        accountStatus: 'ACTIVE',
      },
    });
    for (const snapshot of snapshots) {
      if (
        roles.some((role) => this.hasRole(snapshot, role, tenantId))
      ) {
        this.add(recipients, { userId: snapshot.userId, customerId: null });
      }
    }
  }

  private hasRole(
    snapshot: RecipientSnapshot,
    role: string,
    tenantId: string,
  ): boolean {
    return (
      snapshot.tenantId === tenantId &&
      snapshot.userType === 'TENANT_STAFF' &&
      snapshot.accountStatus === 'ACTIVE' &&
      this.roles(snapshot).includes(role) &&
      this.canReadNotifications(snapshot)
    );
  }

  private canReadNotifications(snapshot: RecipientSnapshot): boolean {
    return permissionsOf(this.roles(snapshot)).has('notification:read');
  }

  private roles(snapshot: RecipientSnapshot): string[] {
    return Array.isArray(snapshot.roleCodes) &&
      snapshot.roleCodes.every((role): role is string => typeof role === 'string')
      ? snapshot.roleCodes
      : [];
  }

  private add(recipients: Map<string, Recipient>, recipient: Recipient): void {
    recipients.set(`${recipient.userId}:${recipient.customerId ?? ''}`, recipient);
  }

  private async checkTerminalConflict(
    tx: Prisma.TransactionClient,
    row: PendingNotificationEvent,
    payload: PendingPayload,
  ): Promise<
    | { kind: 'STALE' }
    | { kind: 'CONFLICT'; reason: string; expectedHash: string; observedHash: string }
    | undefined
  > {
    if (
      payload.kind !== 'WORK_ORDER_COMPLETED' &&
      payload.kind !== 'WORK_ORDER_CANCELLED'
    ) {
      return undefined;
    }
    const priorEvents = await tx.pendingNotificationEvent.findMany({
      where: {
        tenantId: row.tenantId,
        eventType: { in: ['WorkOrderCompleted', 'WorkOrderCancelled'] },
        status: 'RESOLVED',
        sourceEventId: { not: row.sourceEventId },
      },
      select: {
        eventType: true,
        payload: true,
        payloadSha256: true,
      },
    });
    for (const prior of priorEvents) {
      const priorPayload = this.readPendingPayload(prior.payload);
      if (
        !priorPayload ||
        (priorPayload.kind !== 'WORK_ORDER_COMPLETED' &&
          priorPayload.kind !== 'WORK_ORDER_CANCELLED') ||
        priorPayload.workOrderId !== payload.workOrderId
      ) {
        continue;
      }
      if (
        Date.parse(priorPayload.occurredAt) > Date.parse(payload.occurredAt)
      ) {
        return { kind: 'STALE' };
      }
      return {
        kind: 'CONFLICT',
        reason: 'WORK_ORDER_TERMINAL_EVENT_CONFLICT',
        expectedHash: prior.payloadSha256,
        observedHash: row.payloadSha256,
      };
    }
    return undefined;
  }

  private serviceRequestId(payload: PendingPayload): string | null {
    switch (payload.kind) {
      case 'WORK_ORDER_CREATED':
      case 'WORK_ORDER_COMPLETED':
      case 'WORK_ORDER_CANCELLED':
        return payload.serviceRequestId;
      default:
        return null;
    }
  }

  private workOrderCustomerId(payload: PendingPayload): string | null {
    return payload.kind === 'WORK_ORDER_CREATED' ||
      payload.kind === 'WORK_ORDER_COMPLETED'
      ? payload.customerId
      : null;
  }

  private async defer(
    tx: Prisma.TransactionClient,
    row: PendingNotificationEvent,
    reason: string,
  ): Promise<void> {
    const attempts = row.attempts + 1;
    const exhausted = attempts >= RETRY_POLICY.maxAttempts;
    const delay = backoffDelay(attempts, RETRY_POLICY);
    await tx.pendingNotificationEvent.update({
      where: {
        sourceEventId_consumer: {
          sourceEventId: row.sourceEventId,
          consumer: row.consumer,
        },
      },
      data: {
        status: exhausted ? 'MANUAL_REVIEW' : 'RETRYING',
        reason,
        attempts,
        nextAttemptAt: new Date(Date.now() + delay),
        lastErrorCategory: reason,
        leaseUntil: null,
      },
    });
  }

  private async resolve(
    tx: Prisma.TransactionClient,
    row: PendingNotificationEvent,
  ): Promise<void> {
    await tx.pendingNotificationEvent.update({
      where: {
        sourceEventId_consumer: {
          sourceEventId: row.sourceEventId,
          consumer: row.consumer,
        },
      },
      data: {
        status: 'RESOLVED',
        resolvedAt: new Date(),
        leaseUntil: null,
        lastErrorCategory: null,
      },
    });
  }

  private async markManualReview(
    tx: Prisma.TransactionClient,
    row: PendingNotificationEvent,
    reason: string,
  ): Promise<void> {
    await tx.pendingNotificationEvent.update({
      where: {
        sourceEventId_consumer: {
          sourceEventId: row.sourceEventId,
          consumer: row.consumer,
        },
      },
      data: {
        status: 'MANUAL_REVIEW',
        reason,
        lastErrorCategory: reason,
        leaseUntil: null,
      },
    });
  }

  private async recordConflict(
    tx: Prisma.TransactionClient,
    sourceEventId: string,
    eventType: string,
    expectedSha256: string,
    observedSha256: string,
  ): Promise<void> {
    await tx.notificationEventConflict.createMany({
      data: [
        {
          sourceEventId,
          consumer: NOTIFICATION_BUSINESS_CONSUMER,
          expectedSha256,
          observedSha256,
          eventType,
        },
      ],
      skipDuplicates: true,
    });
  }

  private allowlistedPayload(envelope: EventEnvelope): PendingPayload | undefined {
    if (isEvent(envelope, Events.EquipmentHandoverChanged)) {
      const p = envelope.payload;
      return { kind: 'EQUIPMENT_HANDOVER_CHANGED', occurredAt: envelope.occurredAt,
        handoverId: p.handoverId, equipmentId: p.equipmentId, customerId: p.customerId,
        createdBy: p.createdBy, handoverNo: p.handoverNo, assetCode: p.assetCode, status: p.status, version: p.version };
    }
    if (isEvent(envelope, Events.ServiceRequestCreated)) {
      return {
        kind: 'SERVICE_REQUEST_CREATED',
        occurredAt: envelope.occurredAt,
        serviceRequestId: envelope.payload.serviceRequestId,
        requestNo: envelope.payload.requestNo,
        customerId: envelope.payload.customerId,
        equipmentId: envelope.payload.equipmentId,
        requesterId: envelope.payload.requesterId,
        requestType: envelope.payload.type,
        priority: envelope.payload.priority,
      };
    }
    if (isEvent(envelope, Events.ServiceRequestStatusChanged)) {
      return {
        kind: 'SERVICE_REQUEST_STATUS_CHANGED',
        occurredAt: envelope.occurredAt,
        serviceRequestId: envelope.payload.serviceRequestId,
        requestNo: envelope.payload.requestNo,
        customerId: envelope.payload.customerId,
        equipmentId: envelope.payload.equipmentId,
        fromStatus: envelope.payload.fromStatus,
        toStatus: envelope.payload.toStatus,
      };
    }
    if (isEvent(envelope, Events.WorkOrderCreated)) {
      return {
        kind: 'WORK_ORDER_CREATED',
        occurredAt: envelope.occurredAt,
        workOrderId: envelope.payload.workOrderId,
        workOrderNo: envelope.payload.workOrderNo,
        serviceRequestId: envelope.payload.serviceRequestId,
        maintenanceTaskId: envelope.payload.maintenanceTaskId,
        customerId: envelope.payload.customerId,
      };
    }
    if (isEvent(envelope, Events.WorkOrderAssigned)) {
      return {
        kind: 'WORK_ORDER_ASSIGNED',
        occurredAt: envelope.occurredAt,
        workOrderId: envelope.payload.workOrderId,
        workOrderNo: envelope.payload.workOrderNo,
        technicianUserId: envelope.payload.technicianUserId,
        scheduledStart: envelope.payload.scheduledStart,
      };
    }
    if (isEvent(envelope, Events.WorkOrderCompletedV2)) {
      return {
        kind: 'WORK_ORDER_COMPLETED',
        occurredAt: envelope.occurredAt,
        workOrderId: envelope.payload.workOrderId,
        workOrderNo: envelope.payload.workOrderNo,
        serviceRequestId: envelope.payload.serviceRequestId,
        maintenanceTaskId: envelope.payload.maintenanceTaskId,
        customerId: envelope.payload.customerId,
        result: envelope.payload.result,
        customerSummary: envelope.payload.customerSummary,
      };
    }
    if (isEvent(envelope, Events.WorkOrderCancelledV2)) {
      return {
        kind: 'WORK_ORDER_CANCELLED',
        occurredAt: envelope.occurredAt,
        workOrderId: envelope.payload.workOrderId,
        workOrderNo: envelope.payload.workOrderNo,
        serviceRequestId: envelope.payload.serviceRequestId,
        maintenanceTaskId: envelope.payload.maintenanceTaskId,
        cancelServiceRequest: envelope.payload.cancelServiceRequest,
      };
    }
    if (isEvent(envelope, Events.LowStockDetected)) {
      return {
        kind: 'LOW_STOCK_DETECTED',
        occurredAt: envelope.occurredAt,
        stockId: envelope.payload.stockId,
        partSku: envelope.payload.partSku,
        quantity: envelope.payload.quantity,
        minQuantity: envelope.payload.minQuantity,
      };
    }
    return undefined;
  }

  private readPendingPayload(value: Prisma.JsonValue): PendingPayload | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const raw = value as Prisma.JsonObject;
    const kind = raw.kind;
    const occurredAt = raw.occurredAt;
    if (
      typeof kind !== 'string' ||
      typeof occurredAt !== 'string' ||
      !is.isoDateTime(occurredAt)
    ) {
      return undefined;
    }
    const uuid = (candidate: Prisma.JsonValue | undefined): candidate is string =>
      typeof candidate === 'string' && isUUID(candidate);
    const text = (
      candidate: Prisma.JsonValue | undefined,
      maxLength: number,
    ): candidate is string =>
      typeof candidate === 'string' &&
      candidate.length > 0 &&
      candidate.length <= maxLength;
    const oneOf = (
      candidate: Prisma.JsonValue | undefined,
      values: readonly string[],
    ): candidate is string =>
      typeof candidate === 'string' && values.includes(candidate);
    const isoDateTime = (
      candidate: Prisma.JsonValue | undefined,
    ): candidate is string =>
      typeof candidate === 'string' && is.isoDateTime(candidate);
    const decimal = (
      candidate: Prisma.JsonValue | undefined,
    ): candidate is string =>
      typeof candidate === 'string' && is.decimal(candidate);
    const nullableUuid = (candidate: Prisma.JsonValue | undefined): candidate is string | null =>
      candidate === null || uuid(candidate);
    const hasOnlyKeys = (...keys: string[]) =>
      Object.keys(raw).every((key) => keys.includes(key));
    const hasOneOrigin = (serviceRequestId: string | null, maintenanceTaskId: string | null) =>
      (serviceRequestId === null) !== (maintenanceTaskId === null);
    switch (kind) {
      case 'EQUIPMENT_HANDOVER_CHANGED':
        if (uuid(raw.handoverId) && uuid(raw.equipmentId) && uuid(raw.customerId) && uuid(raw.createdBy) &&
          text(raw.handoverNo, 50) && text(raw.assetCode, 100) && typeof raw.version === 'number' && Number.isSafeInteger(raw.version) && raw.version > 0 &&
          oneOf(raw.status, ['PENDING_CUSTOMER_CONFIRMATION', 'ACTIVATED', 'REJECTED', 'CANCELLED', 'EXPIRED']))
          return { kind, occurredAt, handoverId: raw.handoverId, equipmentId: raw.equipmentId, customerId: raw.customerId,
            createdBy: raw.createdBy, handoverNo: raw.handoverNo, assetCode: raw.assetCode, version: raw.version,
            status: raw.status as Extract<PendingPayload, { kind: 'EQUIPMENT_HANDOVER_CHANGED' }>['status'] };
        return undefined;
      case 'SERVICE_REQUEST_CREATED':
        if (
          hasOnlyKeys(
            'kind', 'occurredAt', 'serviceRequestId', 'requestNo', 'customerId',
            'equipmentId', 'requesterId', 'requestType', 'priority',
          ) &&
          uuid(raw.serviceRequestId) && text(raw.requestNo, 50) &&
          uuid(raw.customerId) && uuid(raw.equipmentId) && uuid(raw.requesterId) &&
          oneOf(raw.requestType, SERVICE_REQUEST_TYPES) &&
          oneOf(raw.priority, PRIORITIES)
        ) {
          return {
            kind,
            occurredAt,
            serviceRequestId: raw.serviceRequestId,
            requestNo: raw.requestNo,
            customerId: raw.customerId,
            equipmentId: raw.equipmentId,
            requesterId: raw.requesterId,
            requestType: raw.requestType,
            priority: raw.priority,
          };
        }
        return undefined;
      case 'SERVICE_REQUEST_STATUS_CHANGED':
        if (
          !hasOnlyKeys(
            'kind', 'occurredAt', 'serviceRequestId', 'requestNo', 'customerId',
            'equipmentId', 'fromStatus', 'toStatus',
          )
        ) {
          return undefined;
        }
        {
          const fromStatus = raw.fromStatus;
          const toStatus = raw.toStatus;
        if (
          uuid(raw.serviceRequestId) && text(raw.requestNo, 50) &&
          uuid(raw.customerId) && uuid(raw.equipmentId) &&
          (fromStatus === null || oneOf(fromStatus, SERVICE_REQUEST_STATUSES)) &&
          oneOf(toStatus, SERVICE_REQUEST_STATUSES)
        ) {
          return {
            kind,
            occurredAt,
            serviceRequestId: raw.serviceRequestId,
            requestNo: raw.requestNo,
            customerId: raw.customerId,
            equipmentId: raw.equipmentId,
            fromStatus,
            toStatus,
          };
        }
        return undefined;
        }
      case 'WORK_ORDER_CREATED':
        if (
          hasOnlyKeys(
            'kind', 'occurredAt', 'workOrderId', 'workOrderNo',
            'serviceRequestId', 'maintenanceTaskId', 'customerId',
          ) &&
          uuid(raw.workOrderId) && text(raw.workOrderNo, 50) &&
          nullableUuid(raw.serviceRequestId) && nullableUuid(raw.maintenanceTaskId) &&
          hasOneOrigin(raw.serviceRequestId, raw.maintenanceTaskId) &&
          uuid(raw.customerId)
        ) {
          return {
            kind,
            occurredAt,
            workOrderId: raw.workOrderId,
            workOrderNo: raw.workOrderNo,
            serviceRequestId: raw.serviceRequestId,
            maintenanceTaskId: raw.maintenanceTaskId,
            customerId: raw.customerId,
          };
        }
        return undefined;
      case 'WORK_ORDER_ASSIGNED':
        if (
          hasOnlyKeys(
            'kind', 'occurredAt', 'workOrderId', 'workOrderNo',
            'technicianUserId', 'scheduledStart',
          ) &&
          uuid(raw.workOrderId) && text(raw.workOrderNo, 50) &&
          uuid(raw.technicianUserId) &&
          (raw.scheduledStart === null || isoDateTime(raw.scheduledStart))
        ) {
          return {
            kind,
            occurredAt,
            workOrderId: raw.workOrderId,
            workOrderNo: raw.workOrderNo,
            technicianUserId: raw.technicianUserId,
            scheduledStart: raw.scheduledStart,
          };
        }
        return undefined;
      case 'WORK_ORDER_COMPLETED':
        if (
          hasOnlyKeys(
            'kind', 'occurredAt', 'workOrderId', 'workOrderNo',
            'serviceRequestId', 'maintenanceTaskId', 'customerId', 'result',
            'customerSummary',
          ) &&
          uuid(raw.workOrderId) && text(raw.workOrderNo, 50) &&
          nullableUuid(raw.serviceRequestId) && nullableUuid(raw.maintenanceTaskId) &&
          hasOneOrigin(raw.serviceRequestId, raw.maintenanceTaskId) &&
          uuid(raw.customerId) && oneOf(raw.result, REPORT_RESULTS) &&
          text(raw.customerSummary, 2_000)
        ) {
          return {
            kind,
            occurredAt,
            workOrderId: raw.workOrderId,
            workOrderNo: raw.workOrderNo,
            serviceRequestId: raw.serviceRequestId,
            maintenanceTaskId: raw.maintenanceTaskId,
            customerId: raw.customerId,
            result: raw.result,
            customerSummary: raw.customerSummary,
          };
        }
        return undefined;
      case 'WORK_ORDER_CANCELLED':
        if (
          hasOnlyKeys(
            'kind', 'occurredAt', 'workOrderId', 'workOrderNo',
            'serviceRequestId', 'maintenanceTaskId', 'cancelServiceRequest',
          ) &&
          uuid(raw.workOrderId) && text(raw.workOrderNo, 50) &&
          nullableUuid(raw.serviceRequestId) && nullableUuid(raw.maintenanceTaskId) &&
          hasOneOrigin(raw.serviceRequestId, raw.maintenanceTaskId) &&
          typeof raw.cancelServiceRequest === 'boolean'
        ) {
          return {
            kind,
            occurredAt,
            workOrderId: raw.workOrderId,
            workOrderNo: raw.workOrderNo,
            serviceRequestId: raw.serviceRequestId,
            maintenanceTaskId: raw.maintenanceTaskId,
            cancelServiceRequest: raw.cancelServiceRequest,
          };
        }
        return undefined;
      case 'LOW_STOCK_DETECTED':
        if (
          hasOnlyKeys(
            'kind', 'occurredAt', 'stockId', 'partSku', 'quantity', 'minQuantity',
          ) &&
          uuid(raw.stockId) && text(raw.partSku, 100) &&
          decimal(raw.quantity) && decimal(raw.minQuantity)
        ) {
          return {
            kind,
            occurredAt,
            stockId: raw.stockId,
            partSku: raw.partSku,
            quantity: raw.quantity,
            minQuantity: raw.minQuantity,
          };
        }
        return undefined;
      default:
        return undefined;
    }
  }

  private orderBySourceTime<T extends { payload: Prisma.JsonValue }>(
    rows: T[],
  ): T[] {
    return [...rows].sort(
      (left, right) =>
        this.occurredAt(left.payload) - this.occurredAt(right.payload),
    );
  }

  private occurredAt(payload: Prisma.JsonValue): number {
    if (
      payload &&
      typeof payload === 'object' &&
      !Array.isArray(payload) &&
      typeof payload.occurredAt === 'string'
    ) {
      return Date.parse(payload.occurredAt);
    }
    return Number.MAX_SAFE_INTEGER;
  }

  private hash(value: unknown): string {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }
}
