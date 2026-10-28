import { Injectable } from '@nestjs/common';
import {
  Events,
  enqueueEvent,
  isEvent,
  parseEnvelope,
  InvalidEventError,
  findEventDefinition,
  processOnce,
  type EventEnvelope,
  type WorkOrderCreatedV1,
  type WorkOrderCompletedV1,
  type WorkOrderCancelledV1,
  type ServiceRequestStatus,
} from '@pbl6/event-contracts';
import { getCorrelationId } from '@pbl6/service-kit';
import {
  Prisma,
  type ServiceRequest,
  type WorkOrderLifecycle,
} from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service';

type Tx = Prisma.TransactionClient;
type Payload = WorkOrderCreatedV1 | WorkOrderCompletedV1 | WorkOrderCancelledV1;
type Phase = 'CREATED' | 'COMPLETED' | 'CANCELLED';
const CONSUMER = 'service-request-service.work-order-events';

// Explicit field order and normalized UUID/timestamps make transport metadata and
// JSON property order irrelevant to business equality.
function canonical(phase: Phase, payload: Payload): Record<string, unknown> {
  const shared = {
    workOrderId: payload.workOrderId.toLowerCase(),
    workOrderNo: payload.workOrderNo,
    serviceRequestId: payload.serviceRequestId?.toLowerCase() ?? null,
    maintenanceTaskId: payload.maintenanceTaskId?.toLowerCase() ?? null,
    equipmentId: payload.equipmentId.toLowerCase(),
  };
  if (phase === 'CREATED') {
    const p = payload as WorkOrderCreatedV1;
    return {
      ...shared,
      customerId: p.customerId.toLowerCase(),
      type: p.type,
      priority: p.priority,
    };
  }
  if (phase === 'COMPLETED') {
    const p = payload as WorkOrderCompletedV1;
    return {
      ...shared,
      customerId: p.customerId.toLowerCase(),
      serviceReportId: p.serviceReportId.toLowerCase(),
      result: p.result,
      completedAt: new Date(p.completedAt).toISOString(),
      customerSummary: 'customerSummary' in p ? p.customerSummary : null,
    };
  }
  const p = payload as WorkOrderCancelledV1;
  return {
    ...shared,
    reason: p.reason,
    cancelledAt: new Date(p.cancelledAt).toISOString(),
    cancelServiceRequest:
      'cancelServiceRequest' in p ? p.cancelServiceRequest : false,
  };
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable(object[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

@Injectable()
export class WorkOrderEventsConsumer {
  constructor(private readonly prisma: PrismaService) {}

  async handle(raw: EventEnvelope): Promise<void> {
    const envelope = parseEnvelope(JSON.stringify(raw));
    const definition = findEventDefinition(
      envelope.eventType,
      envelope.eventVersion,
    )!;
    if (
      envelope.producer !== definition.producer ||
      envelope.aggregateType !== 'WorkOrder' ||
      definition.aggregateType !== 'WorkOrder' ||
      !envelope.tenantId
    ) {
      throw new InvalidEventError([
        'unexpected Work Order producer, aggregate or tenant',
      ]);
    }
    const payload = envelope.payload as Payload;
    if (
      envelope.aggregateId.toLowerCase() !==
        payload.workOrderId.toLowerCase() ||
      (payload.serviceRequestId === null) ===
        (payload.maintenanceTaskId === null)
    ) {
      throw new InvalidEventError(['invalid Work Order aggregate or origin']);
    }
    let phase: Phase;
    if (isEvent(envelope, Events.WorkOrderCreated)) phase = 'CREATED';
    else if (
      isEvent(envelope, Events.WorkOrderCompleted) ||
      isEvent(envelope, Events.WorkOrderCompletedV2)
    )
      phase = 'COMPLETED';
    else if (
      isEvent(envelope, Events.WorkOrderCancelled) ||
      isEvent(envelope, Events.WorkOrderCancelledV2)
    )
      phase = 'CANCELLED';
    else throw new InvalidEventError(['unsupported Work Order event']);

    const semantic = canonical(phase, payload);
    const result = await processOnce(
      this.prisma,
      {
        eventId: envelope.eventId,
        eventType: envelope.eventType,
        consumer: CONSUMER,
      },
      (tx) => this.receive(tx, envelope, phase, semantic),
    );
    if (result === 'duplicate' && payload.serviceRequestId) {
      await this.prisma.$transaction(async (tx) => {
        const request = await this.findRequest(tx, envelope, payload);
        if (!request) return;
        const prior = await tx.workOrderLifecycle.findFirst({
          where: {
            OR: [
              { createdEventId: envelope.eventId },
              { terminalEventId: envelope.eventId },
            ],
          },
        });
        if (prior) {
          const priorPayload =
            prior.createdEventId === envelope.eventId
              ? prior.createdPayload
              : prior.terminalPayload;
          const priorPhase =
            prior.createdEventId === envelope.eventId
              ? 'CREATED'
              : prior.terminalPhase;
          if (
            prior.tenantId !== request.tenantId ||
            prior.workOrderId.toLowerCase() !==
              payload.workOrderId.toLowerCase() ||
            priorPhase !== phase ||
            stable(priorPayload) !== stable(semantic)
          ) {
            await this.conflict(
              tx,
              envelope,
              request,
              'EVENT_ID_CONFLICT',
              semantic,
            );
          }
        }
      });
    }
  }

  private async receive(
    tx: Tx,
    event: EventEnvelope,
    phase: Phase,
    semantic: Record<string, unknown>,
  ): Promise<void> {
    const payload = event.payload as Payload;
    if (!payload.serviceRequestId) return; // Maintenance-owned Work Orders do not change SR.
    const request = await this.findRequest(tx, event, payload);
    if (!request) return;
    const where = {
      tenantId_workOrderId: {
        tenantId: request.tenantId,
        workOrderId: payload.workOrderId,
      },
    };
    let row = await tx.workOrderLifecycle.findUnique({ where });
    if (
      row &&
      (row.requestId.toLowerCase() !== request.id.toLowerCase() ||
        row.equipmentId.toLowerCase() !== request.equipmentId.toLowerCase() ||
        (row.customerId &&
          row.customerId.toLowerCase() !== request.customerId.toLowerCase()))
    ) {
      await this.conflict(tx, event, request, 'REFERENCE_MISMATCH', semantic);
      return;
    }
    const previous =
      phase === 'CREATED' ? row?.createdPayload : row?.terminalPayload;
    if (previous) {
      if (phase !== 'CREATED' && row?.terminalPhase !== phase) {
        await this.conflict(
          tx,
          event,
          request,
          'TERMINAL_PHASE_CONFLICT',
          semantic,
        );
      } else if (stable(previous) !== stable(semantic)) {
        await this.conflict(tx, event, request, 'SEMANTIC_CONFLICT', semantic);
      }
      return;
    }
    if (
      phase !== 'CREATED' &&
      row?.terminalPhase &&
      row.terminalPhase !== phase
    ) {
      await this.conflict(
        tx,
        event,
        request,
        'TERMINAL_PHASE_CONFLICT',
        semantic,
      );
      return;
    }
    if (!row) {
      row = await tx.workOrderLifecycle.create({
        data: {
          tenantId: request.tenantId,
          workOrderId: payload.workOrderId,
          requestId: request.id,
          equipmentId: request.equipmentId,
          customerId: phase === 'CANCELLED' ? null : request.customerId,
          ...(phase === 'CREATED'
            ? {
                createdPayload: semantic as Prisma.InputJsonValue,
                createdEventId: event.eventId,
                createdVersion: event.eventVersion,
                createdOccurredAt: new Date(event.occurredAt),
                createdCorrelationId: event.correlationId,
              }
            : {
                terminalPayload: semantic as Prisma.InputJsonValue,
                terminalEventId: event.eventId,
                terminalPhase: phase,
                terminalVersion: event.eventVersion,
                terminalOccurredAt: new Date(event.occurredAt),
                terminalCorrelationId: event.correlationId,
              }),
        },
      });
    } else {
      row = await tx.workOrderLifecycle.update({
        where,
        data:
          phase === 'CREATED'
            ? {
                createdPayload: semantic as Prisma.InputJsonValue,
                createdEventId: event.eventId,
                customerId: request.customerId,
                createdVersion: event.eventVersion,
                createdOccurredAt: new Date(event.occurredAt),
                createdCorrelationId: event.correlationId,
              }
            : {
                terminalPayload: semantic as Prisma.InputJsonValue,
                terminalEventId: event.eventId,
                terminalPhase: phase,
                terminalVersion: event.eventVersion,
                terminalOccurredAt: new Date(event.occurredAt),
                terminalCorrelationId: event.correlationId,
              },
      });
    }
    if (phase === 'CREATED')
      await this.applyCreated(tx, request, row, event.correlationId);
    else if (row.appliedPhase === 'CREATED')
      await this.applyTerminal(tx, request, row, event.correlationId);
    // A terminal receipt with no Created remains pending, including across restart.
  }

  private async applyCreated(
    tx: Tx,
    request: ServiceRequest,
    row: WorkOrderLifecycle,
    correlationId: string | null,
  ): Promise<void> {
    if (row.appliedPhase || !row.createdPayload || this.isTerminal(request))
      return;
    if (request.status === 'PROCESSING') {
      if (!request.activeWorkOrderId)
        throw new Error(`Cannot verify legacy Service Request ${request.id}`);
      if (
        request.activeWorkOrderId.toLowerCase() ===
        row.workOrderId.toLowerCase()
      ) {
        const active = await tx.workOrderLifecycle.update({
          where: {
            tenantId_workOrderId: {
              tenantId: row.tenantId,
              workOrderId: row.workOrderId,
            },
          },
          data: { appliedPhase: 'CREATED' },
        });
        if (active.terminalPhase)
          await this.applyTerminal(tx, request, active, correlationId);
        return;
      }
      return; // Durable pending Created(B); A's terminal will reconcile it.
    }
    if (request.status !== 'ACCEPTED') return; // Persist receipt for later reconciliation.
    const active = await tx.workOrderLifecycle.update({
      where: {
        tenantId_workOrderId: {
          tenantId: row.tenantId,
          workOrderId: row.workOrderId,
        },
      },
      data: { appliedPhase: 'CREATED' },
    });
    const updated = await tx.serviceRequest.update({
      where: { id: request.id },
      data: {
        status: 'PROCESSING',
        activeWorkOrderId: row.workOrderId,
        resolutionResult: null,
        resolutionSummary: null,
        resolvedWorkOrderNo: null,
        resolutionCompletedAt: null,
        resolvedAt: null,
      },
    });
    await this.recordStatusChange(
      tx,
      updated,
      'ACCEPTED',
      'PROCESSING',
      null,
      correlationId,
    );
    if (active.terminalPhase)
      await this.applyTerminal(tx, updated, active, correlationId);
  }

  private async applyTerminal(
    tx: Tx,
    request: ServiceRequest,
    row: WorkOrderLifecycle,
    correlationId: string | null,
  ): Promise<void> {
    if (
      row.appliedPhase !== 'CREATED' ||
      !row.terminalPhase ||
      !row.terminalPayload ||
      request.status !== 'PROCESSING' ||
      request.activeWorkOrderId?.toLowerCase() !== row.workOrderId.toLowerCase()
    )
      return;
    const p = row.terminalPayload as Record<string, unknown>;
    const resolved =
      row.terminalPhase === 'COMPLETED' &&
      (p.result === 'RESOLVED' || p.result === 'PARTIALLY_RESOLVED');
    const nextStatus: ServiceRequestStatus =
      row.terminalPhase === 'CANCELLED'
        ? p.cancelServiceRequest
          ? 'CANCELLED'
          : 'ACCEPTED'
        : resolved
          ? 'RESOLVED'
          : 'ACCEPTED';
    await tx.workOrderLifecycle.update({
      where: {
        tenantId_workOrderId: {
          tenantId: row.tenantId,
          workOrderId: row.workOrderId,
        },
      },
      data: { appliedPhase: row.terminalPhase },
    });
    const updated = await tx.serviceRequest.update({
      where: { id: request.id },
      data: {
        status: nextStatus,
        activeWorkOrderId: null,
        ...(row.terminalPhase === 'COMPLETED'
          ? {
              resolutionResult: p.result as string,
              resolutionSummary: p.customerSummary as string | null,
              resolvedWorkOrderNo: p.workOrderNo as string,
              resolutionCompletedAt: new Date(p.completedAt as string),
              resolvedAt: resolved ? new Date(p.completedAt as string) : null,
            }
          : {}),
      },
    });
    await this.recordStatusChange(
      tx,
      updated,
      'PROCESSING',
      nextStatus,
      row.terminalPhase === 'CANCELLED' ? (p.reason as string | null) : null,
      correlationId,
    );
    if (nextStatus === 'ACCEPTED')
      await this.reconcile(tx, updated, correlationId);
  }

  private async reconcile(
    tx: Tx,
    request: ServiceRequest,
    correlationId: string | null,
  ): Promise<void> {
    const pending = await tx.workOrderLifecycle.findFirst({
      where: {
        tenantId: request.tenantId,
        requestId: request.id,
        createdEventId: { not: null },
        appliedPhase: null,
      },
      orderBy: [{ receivedAt: 'asc' }, { workOrderId: 'asc' }],
    });
    if (pending) await this.applyCreated(tx, request, pending, correlationId);
  }

  private async findRequest(
    tx: Tx,
    event: EventEnvelope,
    payload: Payload,
  ): Promise<ServiceRequest | null> {
    await tx.$queryRawUnsafe(
      'SELECT id FROM service_requests WHERE id = $1::uuid AND tenant_id = $2::uuid FOR UPDATE',
      payload.serviceRequestId,
      event.tenantId,
    );
    const request = await tx.serviceRequest.findFirst({
      where: { id: payload.serviceRequestId!, tenantId: event.tenantId! },
    });
    if (!request)
      throw new Error(
        `Service Request ${payload.serviceRequestId} was not found for Work Order event ${event.eventId}`,
      );
    if (
      request.equipmentId.toLowerCase() !== payload.equipmentId.toLowerCase() ||
      ('customerId' in payload &&
        request.customerId.toLowerCase() !== payload.customerId.toLowerCase())
    ) {
      await this.conflict(
        tx,
        event,
        request,
        'REFERENCE_MISMATCH',
        canonical(
          event.eventType === 'WorkOrderCreated'
            ? 'CREATED'
            : event.eventType === 'WorkOrderCompleted'
              ? 'COMPLETED'
              : 'CANCELLED',
          payload,
        ),
      );
      return null;
    }
    return request;
  }

  private async conflict(
    tx: Tx,
    event: EventEnvelope,
    request: ServiceRequest,
    reason: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await tx.workOrderLifecycleConflict.upsert({
      where: { tenantId_eventId_reason: { tenantId: request.tenantId, eventId: event.eventId, reason } },
      update: {},
      create: {
        tenantId: request.tenantId,
        requestId: request.id,
        workOrderId: (event.payload as Payload).workOrderId,
        eventId: event.eventId,
        eventType: event.eventType,
        eventVersion: event.eventVersion,
        reason,
        payload: payload as Prisma.InputJsonValue,
        occurredAt: new Date(event.occurredAt),
      },
    });
  }

  private isTerminal(request: ServiceRequest): boolean {
    return ['CLOSED', 'REJECTED', 'CANCELLED'].includes(request.status);
  }

  private async recordStatusChange(
    tx: Tx,
    request: ServiceRequest,
    fromStatus: ServiceRequestStatus,
    toStatus: ServiceRequestStatus,
    reason: string | null,
    correlationId: string | null,
  ): Promise<void> {
    await tx.requestStatusHistory.create({
      data: {
        tenantId: request.tenantId,
        requestId: request.id,
        oldStatus: fromStatus,
        newStatus: toStatus,
        changedBy: null,
        reason,
      },
    });
    await enqueueEvent(tx, Events.ServiceRequestStatusChanged, {
      tenantId: request.tenantId,
      aggregateId: request.id,
      correlationId: correlationId ?? getCorrelationId(),
      payload: {
        serviceRequestId: request.id,
        requestNo: request.requestNo,
        customerId: request.customerId,
        equipmentId: request.equipmentId,
        fromStatus,
        toStatus,
        changedBy: null,
        reason,
      },
    });
  }
}
