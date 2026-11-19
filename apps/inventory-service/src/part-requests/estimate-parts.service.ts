import { Injectable } from '@nestjs/common';
import {
  assertBranchAccess,
  requireTenantId,
  type Principal,
} from '@pbl6/auth';
import {
  Events,
  InvalidEventError,
  isEvent,
  parseEnvelope,
  processOnce,
  type EventEnvelope,
  type PayloadOf,
} from '@pbl6/event-contracts';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../generated/prisma/client.js';
import { ReferencesClient } from '../inventory/references.client';
import { fingerprint, json, notFound } from '../inventory/policy';
import { operationTotals } from './requests.policy';

type Snapshot = PayloadOf<typeof Events.CostEstimatePartsSnapshot>;
@Injectable()
export class EstimatePartsService {
  constructor(
    private readonly db: PrismaService,
    private readonly refs: ReferencesClient,
  ) {}
  async handle(envelope: EventEnvelope) {
    if (!isEvent(envelope, Events.CostEstimatePartsSnapshot)) return;
    parseEnvelope(JSON.stringify(envelope));
    const p = envelope.payload;
    if (
      !envelope.tenantId ||
      envelope.producer !== 'service-request-service' ||
      envelope.aggregateType !== 'ServiceRequest' ||
      envelope.aggregateId.toLowerCase() !== p.serviceRequestId.toLowerCase() ||
      (p.status === 'WITHDRAWN' && p.lines.length)
    )
      throw new InvalidEventError(['Invalid approved parts source']);
    const tenantId = envelope.tenantId.toLowerCase(),
      serviceRequestId = p.serviceRequestId.toLowerCase();
    const normalized = {
      ...p,
      serviceRequestId,
      estimateId: p.estimateId.toLowerCase(),
      lines: p.lines
        .map((line) => ({
          ...line,
          lineId: line.lineId.toLowerCase(),
          partId: line.partId.toLowerCase(),
          quantity: new Prisma.Decimal(line.quantity).toFixed(2),
          unitPrice: new Prisma.Decimal(line.unitPrice).toFixed(2),
        }))
        .sort((a, b) => a.lineId.localeCompare(b.lineId)),
    };
    const hash = fingerprint('ESTIMATE_PARTS', normalized);
    await processOnce(
      this.db,
      {
        eventId: envelope.eventId,
        eventType: envelope.eventType,
        consumer: 'inventory-service.estimate-parts',
      },
      async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`estimate-parts:${tenantId}:${serviceRequestId}`},0))::text`;
        const key = {
          tenantId_serviceRequestId: { tenantId, serviceRequestId },
        };
        const existing = await tx.estimatePartsSnapshot.findUnique({
          where: key,
        });
        if (existing && existing.sourceVersion > p.sourceVersion) return;
        if (existing?.sourceVersion === p.sourceVersion) {
          if (existing.requestHash !== hash)
            throw new InvalidEventError([
              'Conflicting snapshot at same source version',
            ]);
          return;
        }
        for (const line of normalized.lines) {
          if (
            !(await tx.part.findFirst({
              where: { tenantId, id: line.partId },
              select: { id: true },
            }))
          )
            throw new InvalidEventError([
              'Part does not belong to event tenant',
            ]);
        }
        const data = {
          sourceVersion: p.sourceVersion,
          requestHash: hash,
          payload: json(normalized),
        };
        await tx.estimatePartsSnapshot.upsert({
          where: key,
          create: { tenantId, serviceRequestId, ...data },
          update: data,
        });
      },
    );
  }
  async recommended(p: Principal, id: string) {
    const wo = await this.refs.workOrderDetail(id, p);
    if (!wo || wo.id.toLowerCase() !== id.toLowerCase()) throw notFound();
    assertBranchAccess(p, wo.branchId);
    const tenantId = requireTenantId(p);
    const row = wo.serviceRequestId
      ? await this.db.estimatePartsSnapshot.findUnique({
          where: {
            tenantId_serviceRequestId: {
              tenantId,
              serviceRequestId: wo.serviceRequestId,
            },
          },
        })
      : null;
    if (!row)
      return {
        state: 'NO_SNAPSHOT',
        workOrderId: id,
        lines: [],
        reservesStock: false,
      };
    const payload = row.payload as unknown as Snapshot;
    if (payload.status !== 'APPROVED')
      return {
        state: 'WITHDRAWN',
        workOrderId: id,
        lines: [],
        reservesStock: false,
      };
    const [openLines, usages] = await this.db.$transaction(
      [
        this.db.partRequestLine.findMany({
          where: { tenantId, request: { workOrderId: id, status: 'OPEN' } },
          include: { fulfillments: true },
        }),
        this.db.workOrderPart.findMany({
          where: { tenantId, workOrderId: id },
        }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    const partIds = [...new Set([...payload.lines.map(l => l.partId), ...openLines.map(l => l.partId), ...usages.map(u => u.partId)])];
    const parts = await this.db.part.findMany({
      where: { tenantId, id: { in: partIds } },
      select: { id: true, sku: true, name: true, unit: true, status: true, allowFractional: true },
    });
    const partTotals = parts.map((part) => {
      const sum = (values: (Prisma.Decimal | string)[]) =>
        values.reduce<Prisma.Decimal>(
          (total, v) => total.plus(v),
          new Prisma.Decimal(0),
        );
      const approved = sum(
        payload.lines
          .filter((l) => l.partId === part.id)
          .map((l) => l.quantity),
      );
      const requests = openLines.filter((l) => l.partId === part.id);
      const issued = usages.filter((u) => u.partId === part.id);
      return {
        partId: part.id,
        sku: part.sku,
        unit: part.unit,
        hasApprovedCatalogueLine: payload.lines.some(l => l.partId === part.id),
        quantityApproved: approved.toFixed(2),
        quantityOpenToFulfill: sum(
          requests.map((l) => {
            const totals = operationTotals(l.fulfillments);
            return l.quantityRequested
              .minus(totals.committed)
              .minus(totals.pending);
          }),
        ).toFixed(2),
        quantityPendingIssue: sum(
          requests.map((l) => operationTotals(l.fulfillments).pending),
        ).toFixed(2),
        quantityIssued: sum(issued.map((u) => u.quantityUsed)).toFixed(2),
        quantityReturned: sum(issued.map((u) => u.quantityReturned)).toFixed(2),
        quantityConfirmedUsed: sum(
          issued.map((u) => u.quantityConfirmedUsed),
        ).toFixed(2),
        quantityUnreconciled: sum(
          issued.map((u) =>
            u.quantityUsed
              .minus(u.quantityReturned)
              .minus(u.quantityConfirmedUsed),
          ),
        ).toFixed(2),
      };
    });
    return {
      state: 'APPROVED',
      workOrderId: id,
      estimateId: payload.estimateId,
      estimateRevision: payload.estimateRevision,
      sourceVersion: payload.sourceVersion,
      currency: payload.currency,
      reservesStock: false,
      partTotals,
      lines: payload.lines.map((line) => ({
        ...line,
        part: parts.find((p) => p.id === line.partId) ?? null,
      })),
    };
  }
}
