import { Injectable } from '@nestjs/common';
import {
  Events,
  InvalidEventError,
  isEvent,
  parseEnvelope,
  processOnce,
  type EventEnvelope,
} from '@pbl6/event-contracts';
import { PrismaService } from '../prisma/prisma.service';

/** Suspension closes the explicitly enabled public capabilities; activation never reopens them. */
@Injectable()
export class PublicQrTenantConsumer {
  constructor(private readonly db: PrismaService) {}
  async handle(envelope: EventEnvelope) {
    if (!isEvent(envelope, Events.TenantStatusChanged)) return;
    parseEnvelope(JSON.stringify(envelope));
    if (
      !envelope.tenantId ||
      envelope.producer !== 'organization-service' ||
      envelope.aggregateType !== 'Tenant' ||
      envelope.aggregateId.toLowerCase() !== envelope.payload.tenantId.toLowerCase() ||
      envelope.tenantId.toLowerCase() !==
        envelope.payload.tenantId.toLowerCase()
    )
      throw new InvalidEventError(['Invalid tenant lifecycle source']);
    await processOnce(
      this.db,
      {
        eventId: envelope.eventId,
        eventType: envelope.eventType,
        consumer: 'asset-service.public-qr-tenant',
      },
      async (tx) => {
        if (envelope.payload.status !== 'ACTIVE')
          await tx.equipmentQrCode.updateMany({
            where: { tenantId: envelope.tenantId!, publicEnabled: true },
            data: { publicEnabled: false },
          });
      },
    );
  }
}
