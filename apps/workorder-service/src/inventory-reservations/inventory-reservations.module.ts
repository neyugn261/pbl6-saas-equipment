import { Module } from '@nestjs/common';
import { InventoryProofClient } from './inventory-proof.client';
import { InventoryReservationsRepository } from './inventory-reservations.repository';
import { InventoryReservationsService } from './inventory-reservations.service';
import { InventoryReservationsController } from './inventory-reservations.controller';

@Module({
  providers: [
    InventoryProofClient,
    InventoryReservationsRepository,
    InventoryReservationsService,
  ],
  controllers: [InventoryReservationsController],
})
export class InventoryReservationsModule {}
