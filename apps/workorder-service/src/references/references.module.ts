import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DisplayNameLookup } from '@pbl6/service-kit';
import { REFERENCES, HttpReferencesClient } from './references.client';
@Module({
  providers: [{ provide: REFERENCES, useClass: HttpReferencesClient }, {
    provide: DisplayNameLookup, inject: [ConfigService],
    useFactory: (config: ConfigService) => new DisplayNameLookup({
      identity: config.get<string>('IDENTITY_SERVICE_URL'), organization: config.get<string>('ORGANIZATION_SERVICE_URL'),
    }),
  }],
  exports: [REFERENCES, DisplayNameLookup],
})
export class ReferencesModule {}
