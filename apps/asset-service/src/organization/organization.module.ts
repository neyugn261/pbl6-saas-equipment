import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ServiceHttpClient } from '@pbl6/service-kit';
import type { AppEnv } from '../config/env.validation';
import { ORGANIZATION_CLIENT } from './organization-client';
import { OrganizationHttpClient } from './organization-http.client';

@Module({
  providers: [
    {
      provide: ORGANIZATION_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppEnv, true>) =>
        new OrganizationHttpClient(
          new ServiceHttpClient({
            name: 'organization-service',
            baseUrl: config.get('ORGANIZATION_SERVICE_URL', { infer: true }),
          }),
        ),
    },
  ],
  exports: [ORGANIZATION_CLIENT],
})
export class OrganizationModule {}
