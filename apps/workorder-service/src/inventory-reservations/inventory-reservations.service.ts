import { Injectable } from '@nestjs/common';
import { requireTenantId, type Principal } from '@pbl6/auth';
import { InventoryProofClient } from './inventory-proof.client';
import { InventoryReservationsRepository } from './inventory-reservations.repository';
import { verifyInventoryProof, reservationConflict } from './proof';
import type {
  InventoryReservationDto,
  SettleInventoryReservationDto,
} from './dto';

@Injectable()
export class InventoryReservationsService {
  constructor(
    private readonly repo: InventoryReservationsRepository,
    private readonly inventory: InventoryProofClient,
  ) {}
  async change(
    p: Principal,
    workOrderId: string,
    input: InventoryReservationDto | SettleInventoryReservationDto,
  ) {
    workOrderId = workOrderId.toLowerCase();
    await this.repo.readable(p, workOrderId);
    const proof = verifyInventoryProof(
      await this.inventory.get(p, input.requestId),
      requireTenantId(p).toLowerCase(),
      workOrderId,
      input.requestId,
      input.fingerprint,
    );
    const settle = 'outcome' in input;
    if (settle && input.outcome !== proof.state) throw reservationConflict();
    const row = await this.repo.change(p, workOrderId, input, proof, settle);
    return {
      requestId: row.requestId,
      fingerprint: row.fingerprint,
      workOrderId: row.workOrderId,
      state: row.state,
    };
  }
}
