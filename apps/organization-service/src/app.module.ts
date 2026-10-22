import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthModule, jwtOptionsFromConfig } from '@pbl6/auth';
import { HealthModule } from '@pbl6/service-kit';
import { prismaHealthCheck } from '@pbl6/service-kit/prisma';
import { BranchesModule } from './branches/branches.module';
import { validateEnv } from './config/env.validation';
import { CustomersModule } from './customers/customers.module';
import { EventsModule } from './events/events.module';
import { InternalModule } from './internal/internal.module';
import { PrismaModule } from './prisma/prisma.module';
import { PrismaService } from './prisma/prisma.service';
import { SitesModule } from './sites/sites.module';
import { TenantsModule } from './tenants/tenants.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Service-local .env first, then the monorepo root .env.
      envFilePath: ['.env', '../../.env'],
      validate: validateEnv,
    }),
    PrismaModule,
    // Global JwtAuthGuard + PermissionsGuard: every route needs a token unless @Public().
    AuthModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => jwtOptionsFromConfig(config),
    }),
    HealthModule.forRootAsync({
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) => [prismaHealthCheck(prisma)],
    }),
    EventsModule,
    TenantsModule,
    BranchesModule,
    CustomersModule,
    SitesModule,
    InternalModule,
  ],
})
export class AppModule {}
