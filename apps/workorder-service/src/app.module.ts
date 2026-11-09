import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthModule, jwtOptionsFromConfig } from '@pbl6/auth';
import { HealthModule } from '@pbl6/service-kit';
import { prismaHealthCheck } from '@pbl6/service-kit/prisma';
import { validateEnv } from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';
import { PrismaService } from './prisma/prisma.service';
import { ReferencesModule } from './references/references.module';
import { TechniciansModule } from './technicians/technicians.module';
import { WorkOrdersModule } from './work-orders/work-orders.module';
import { EventsModule } from './events/events.module';
import { AttachmentsModule } from './attachments/attachments.module';
import { ReportsModule } from './reports/reports.module';
import { InventoryReservationsModule } from './inventory-reservations/inventory-reservations.module';

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
    ReferencesModule,
    TechniciansModule,
    WorkOrdersModule,
    EventsModule,
    AttachmentsModule,
    ReportsModule,
    InventoryReservationsModule,
  ],
})
export class AppModule {}
