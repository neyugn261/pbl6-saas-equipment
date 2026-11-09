import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthModule, jwtOptionsFromConfig } from '@pbl6/auth';
import { HealthModule, DisplayNameLookup } from '@pbl6/service-kit';
import { prismaHealthCheck } from '@pbl6/service-kit/prisma';
import { validateEnv } from './config/env.validation';
import { PrismaService } from './prisma/prisma.service';
import { PrismaModule } from './prisma/prisma.module';
import {
  InventoryController,
  InternalInventoryController,
  UsageConfirmationController,
  ServicePartsController,
} from './inventory/inventory.controller';
import { InventoryService } from './inventory/inventory.service';
import { InventoryRepository } from './inventory/inventory.repository';
import { ReferencesClient } from './inventory/references.client';
import { EventsService } from './events/events.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
      validate: validateEnv,
    }),
    PrismaModule,
    AuthModule.forRootAsync({
      inject: [ConfigService],
      branchServiceUrl: (config: ConfigService) =>
        config.getOrThrow<string>('ORGANIZATION_SERVICE_URL'),
      useFactory: jwtOptionsFromConfig,
    }),
    HealthModule.forRootAsync({
      inject: [PrismaService],
      useFactory: (db: PrismaService) => [prismaHealthCheck(db)],
    }),
  ],
  controllers: [
    InventoryController,
    InternalInventoryController,
    UsageConfirmationController,
    ServicePartsController,
  ],
  providers: [
    { provide: DisplayNameLookup, inject: [ConfigService], useFactory: (config: ConfigService) =>
      new DisplayNameLookup({ organization: config.get<string>('ORGANIZATION_SERVICE_URL'),
        }),
    },
    InventoryRepository,
    InventoryService,
    ReferencesClient,
    EventsService,
  ],
})
export class AppModule {}
