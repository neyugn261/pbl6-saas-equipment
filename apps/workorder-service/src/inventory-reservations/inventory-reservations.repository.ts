import { Injectable } from '@nestjs/common';
import { requireTenantId, type Principal } from '@pbl6/auth';
import { PrismaService } from '../prisma/prisma.service';
import { missing, conflict } from '../common/errors';
import {
  workOrderScope,
  type WorkOrderTx,
} from '../work-orders/work-orders.repository';
import { Prisma } from '../generated/prisma/client.js';
import {
  canonical,
  reservationConflict,
  type VerifiedInventoryProof,
} from './proof';
import type { InventoryReservationDto } from './dto';

/** All callers already hold the WO row lock, including the SR event consumer. */
export async function assertNoInventoryHold(
  tx: WorkOrderTx,
  tenantId: string,
  workOrderId: string,
) {
  if (
    await tx.workOrderInventoryReservation.count({
      where: { tenantId, workOrderId, state: 'HELD' },
    })
  )
    throw conflict(
      'INVENTORY_RESERVATION_HELD',
      'Resolve pending inventory operations before completing or cancelling this Work Order',
    );
}
@Injectable()
export class InventoryReservationsRepository {
  constructor(private readonly db: PrismaService) {}
  async readable(p: Principal, workOrderId: string) {
    if (
      !(await this.db.workOrder.findFirst({
        where: { ...workOrderScope(p), id: workOrderId },
        select: { id: true },
      }))
    )
      throw missing('WORK_ORDER_NOT_FOUND');
  }
  change(
    p: Principal,
    workOrderId: string,
    input: InventoryReservationDto,
    proof: VerifiedInventoryProof,
    settle: boolean,
  ) {
    const tenantId = requireTenantId(p).toLowerCase();
    return this.db.$transaction(
      async (tx) => {
        // Identity lock covers a key reused against different WOs; no network I/O
        // occurs while holding this lock or the WO lock.
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`wo-inventory:${tenantId}:${input.requestId}`}, 0))::text`;
        await tx.$queryRaw`SELECT id FROM work_orders WHERE tenant_id = ${tenantId}::uuid AND id = ${workOrderId}::uuid FOR UPDATE`;
        const order = await tx.workOrder.findFirst({
          where: { ...workOrderScope(p), id: workOrderId },
        });
        if (!order) throw missing('WORK_ORDER_NOT_FOUND');
        const identity = { tenantId, requestId: input.requestId };
        const prior = await tx.workOrderInventoryReservation.findUnique({
          where: { tenantId_requestId: identity },
        });
        if (
          prior &&
          (prior.workOrderId !== workOrderId ||
            prior.fingerprint !== input.fingerprint ||
            prior.actorId !== proof.actorId ||
            canonical(prior.inventoryRequest) !== canonical(proof.request))
        )
          throw reservationConflict();
        if (!settle) {
          if (prior) {
            if (
              (prior.state === 'RELEASED' && proof.state === 'COMMITTED') ||
              (prior.state === 'COMMITTED' && proof.state === 'ABORTED')
            )
              throw reservationConflict();
            if (
              prior.state === 'COMMITTED' &&
              proof.state === 'COMMITTED' &&
              (prior.inventoryUsageId !== proof.usageId ||
                prior.stockTransactionId !== proof.transactionId)
            )
              throw reservationConflict();
            return prior; // Terminal replay never recreates a hold, even with a stale PENDING proof.
          }
          if (
            proof.state !== 'PENDING' ||
            ['COMPLETED', 'CANCELLED'].includes(order.status)
          )
            throw reservationConflict();
          return tx.workOrderInventoryReservation.create({
            data: {
              ...identity,
              workOrderId,
              fingerprint: input.fingerprint,
              actorId: proof.actorId,
              inventoryRequest: proof.request as Prisma.InputJsonObject,
              state: 'HELD',
            },
          });
        }
        const target = proof.state === 'COMMITTED' ? 'COMMITTED' : 'RELEASED';
        if (proof.state === 'PENDING') throw reservationConflict();
        if (prior && prior.state !== 'HELD') {
          if (
            prior.state !== target ||
            prior.inventoryUsageId !== proof.usageId ||
            prior.stockTransactionId !== proof.transactionId
          )
            throw reservationConflict();
          return prior;
        }
        if (!prior) {
          if (proof.state !== 'ABORTED') throw reservationConflict();
          return tx.workOrderInventoryReservation.create({
            data: {
              ...identity,
              workOrderId,
              fingerprint: input.fingerprint,
              actorId: proof.actorId,
              inventoryRequest: proof.request as Prisma.InputJsonObject,
              state: 'RELEASED',
              settledAt: new Date(),
            },
          });
        }
        return tx.workOrderInventoryReservation.update({
          where: { tenantId_requestId: identity },
          data: {
            state: target,
            inventoryUsageId: proof.usageId,
            stockTransactionId: proof.transactionId,
            settledAt: new Date(),
          },
        });
      },
      { timeout: 10000, maxWait: 5000 },
    );
  }
}
