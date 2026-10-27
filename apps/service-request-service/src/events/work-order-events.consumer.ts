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
  type WorkOrderCompletedV1,
  type WorkOrderCreatedV1,
  type WorkOrderCancelledV1,
  type ServiceRequestStatus,
} from '@pbl6/event-contracts';
import { getCorrelationId } from '@pbl6/service-kit';
import { Prisma, type ServiceRequest } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service';

type Tx = Prisma.TransactionClient;

const CONSUMER = 'service-request-service.work-order-events';

@Injectable()
export class WorkOrderEventsConsumer {
  constructor(private readonly prisma: PrismaService) {}

  async handle(envelope: EventEnvelope): Promise<void> {
    // Keep direct deliveries subject to the same contract as broker deliveries.
    envelope = parseEnvelope(JSON.stringify(envelope));
    const definition = findEventDefinition(
      envelope.eventType,
      envelope.eventVersion,
    )!;
    if (
      envelope.producer !== definition.producer ||
      envelope.aggregateType !== definition.aggregateType ||
      definition.aggregateType !== 'WorkOrder'
    ) {
      throw new InvalidEventError([
        'unexpected event producer or aggregate type',
      ]);
    }
    if (!envelope.tenantId) {
      throw new InvalidEventError([
        `${envelope.eventType} must include a tenant id`,
      ]);
    }
    const payload = envelope.payload as
      WorkOrderCreatedV1 | WorkOrderCompletedV1 | WorkOrderCancelledV1;
    this.assertWorkOrderAggregate(envelope, payload.workOrderId);
    if (
      (payload.serviceRequestId === null) ===
      (payload.maintenanceTaskId === null)
    ) {
      throw new InvalidEventError([
        'exactly one Work Order origin must be set',
      ]);
    }

    if (isEvent(envelope, Events.WorkOrderCreated)) {
      await processOnce(
        this.prisma,
        {
          eventId: envelope.eventId,
          eventType: envelope.eventType,
          consumer: CONSUMER,
        },
        (tx) => this.handleWorkOrderCreated(tx, envelope, envelope.payload),
      );
      return;
    }

    if (
      isEvent(envelope, Events.WorkOrderCompleted) ||
      isEvent(envelope, Events.WorkOrderCompletedV2)
    ) {
      await processOnce(
        this.prisma,
        {
          eventId: envelope.eventId,
          eventType: envelope.eventType,
          consumer: CONSUMER,
        },
        (tx) => this.handleWorkOrderCompleted(tx, envelope, envelope.payload),
      );
      return;
    }

    if (
      isEvent(envelope, Events.WorkOrderCancelled) ||
      isEvent(envelope, Events.WorkOrderCancelledV2)
    ) {
      await processOnce(
        this.prisma,
        {
          eventId: envelope.eventId,
          eventType: envelope.eventType,
          consumer: CONSUMER,
        },
        (tx) => this.handleWorkOrderCancelled(tx, envelope, envelope.payload),
      );
      return;
    }
    throw new InvalidEventError(['unsupported Work Order event']);
  }

  private async handleWorkOrderCreated(
    tx: Tx,
    envelope: EventEnvelope,
    payload: WorkOrderCreatedV1,
  ): Promise<void> {
    this.assertWorkOrderAggregate(envelope, payload.workOrderId);
    const request = await this.findRequest(
      tx,
      envelope,
      payload.serviceRequestId,
      payload.equipmentId,
      payload.customerId,
    );
    if (!request || this.isTerminal(request)) return;
    if (request.status === 'PROCESSING') {
      if (!request.activeWorkOrderId) {
        throw new Error(
          `Cannot verify Work Order for legacy Service Request ${request.id}`,
        );
      }
      // The same active order is a business duplicate; another order is stale.
      return;
    }
    if (request.status !== 'ACCEPTED') {
      throw new Error(
        `Cannot apply WorkOrderCreated to Service Request ${request.id} in ${request.status}`,
      );
    }

    const updated = await tx.serviceRequest.update({
      where: { id: request.id },
      data: {
        status: 'PROCESSING',
        activeWorkOrderId: payload.workOrderId,
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
      null,
      envelope.correlationId,
    );
  }

  private async handleWorkOrderCompleted(
    tx: Tx,
    envelope: EventEnvelope,
    payload: WorkOrderCompletedV1,
  ): Promise<void> {
    this.assertWorkOrderAggregate(envelope, payload.workOrderId);
    const request = await this.findRequest(
      tx,
      envelope,
      payload.serviceRequestId,
      payload.equipmentId,
      payload.customerId,
    );
    if (!request || this.isTerminal(request)) return;
    if (request.status === 'PROCESSING' && !request.activeWorkOrderId) {
      throw new Error(
        `Cannot verify Work Order for Service Request ${request.id} before its Created event is applied`,
      );
    }
    if (
      request.activeWorkOrderId &&
      request.activeWorkOrderId.toLowerCase() !==
        payload.workOrderId.toLowerCase()
    ) {
      return;
    }
    if (request.status === 'RESOLVED') {
      return;
    }
    if (request.status !== 'PROCESSING') {
      throw new Error(
        `Cannot apply WorkOrderCompleted to Service Request ${request.id} in ${request.status}`,
      );
    }

    const resolved =
      payload.result === 'RESOLVED' || payload.result === 'PARTIALLY_RESOLVED';
    const updated = await tx.serviceRequest.update({
      where: { id: request.id },
      data: {
        status: resolved ? 'RESOLVED' : 'ACCEPTED',
        activeWorkOrderId: null,
        resolutionResult: payload.result,
        resolutionSummary:
          'customerSummary' in payload &&
          typeof payload.customerSummary === 'string'
            ? payload.customerSummary
            : null,
        resolvedWorkOrderNo: payload.workOrderNo,
        resolutionCompletedAt: new Date(payload.completedAt),
        resolvedAt: resolved ? new Date(payload.completedAt) : null,
      },
    });
    await this.recordStatusChange(
      tx,
      updated,
      'PROCESSING',
      resolved ? 'RESOLVED' : 'ACCEPTED',
      null,
      null,
      envelope.correlationId,
    );
  }

  private async handleWorkOrderCancelled(
    tx: Tx,
    envelope: EventEnvelope,
    payload: WorkOrderCancelledV1,
  ): Promise<void> {
    this.assertWorkOrderAggregate(envelope, payload.workOrderId);
    const request = await this.findRequest(
      tx,
      envelope,
      payload.serviceRequestId,
      payload.equipmentId,
    );
    if (!request || this.isTerminal(request)) return;
    if (request.status === 'PROCESSING' && !request.activeWorkOrderId) {
      throw new Error(
        `Cannot verify Work Order for Service Request ${request.id} before its Created event is applied`,
      );
    }
    if (
      request.activeWorkOrderId &&
      request.activeWorkOrderId.toLowerCase() !==
        payload.workOrderId.toLowerCase()
    ) {
      return;
    }

    const cancelServiceRequest =
      'cancelServiceRequest' in payload && payload.cancelServiceRequest;
    const nextStatus = cancelServiceRequest ? 'CANCELLED' : 'ACCEPTED';
    if (request.status === 'RESOLVED') return;
    if (request.status !== 'PROCESSING') {
      throw new Error(
        `Cannot apply WorkOrderCancelled to Service Request ${request.id} in ${request.status}`,
      );
    }

    const updated = await tx.serviceRequest.update({
      where: { id: request.id },
      data: { status: nextStatus, activeWorkOrderId: null },
    });
    await this.recordStatusChange(
      tx,
      updated,
      request.status,
      nextStatus,
      null,
      payload.reason,
      envelope.correlationId,
    );
  }

  private assertWorkOrderAggregate(
    envelope: EventEnvelope,
    workOrderId: string,
  ): void {
    if (envelope.aggregateId.toLowerCase() !== workOrderId.toLowerCase()) {
      throw new InvalidEventError([
        `${envelope.eventType} aggregate id does not match its Work Order id`,
      ]);
    }
  }

  private isTerminal(request: ServiceRequest): boolean {
    return ['CLOSED', 'REJECTED', 'CANCELLED'].includes(request.status);
  }

  private async findRequest(
    tx: Tx,
    envelope: EventEnvelope,
    requestId: string | null,
    equipmentId: string,
    customerId?: string,
  ): Promise<ServiceRequest | null> {
    if (!requestId) return null;
    if (!envelope.tenantId) {
      throw new Error('Work Order event must include a tenant id');
    }

    await tx.$queryRawUnsafe(
      `SELECT id FROM service_requests
       WHERE id = $1::uuid AND tenant_id = $2::uuid
       FOR UPDATE`,
      requestId,
      envelope.tenantId,
    );
    const request = await tx.serviceRequest.findFirst({
      where: { id: requestId, tenantId: envelope.tenantId },
    });
    if (!request) {
      throw new Error(
        `Service Request ${requestId} was not found for Work Order event ${envelope.eventId}`,
      );
    }
    if (
      request.equipmentId.toLowerCase() !== equipmentId.toLowerCase() ||
      (customerId !== undefined &&
        request.customerId.toLowerCase() !== customerId.toLowerCase())
    ) {
      throw new Error(
        `Work Order event ${envelope.eventId} references a different Service Request`,
      );
    }
    return request;
  }

  private async recordStatusChange(
    tx: Tx,
    request: ServiceRequest,
    fromStatus: ServiceRequestStatus,
    toStatus: ServiceRequestStatus,
    changedBy: string | null,
    reason: string | null,
    correlationId: string | null,
  ): Promise<void> {
    await tx.requestStatusHistory.create({
      data: {
        tenantId: request.tenantId,
        requestId: request.id,
        oldStatus: fromStatus,
        newStatus: toStatus,
        changedBy,
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
        changedBy,
        reason,
      },
    });
  }
}
