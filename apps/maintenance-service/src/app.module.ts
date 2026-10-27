import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthModule, jwtOptionsFromConfig } from '@pbl6/auth';
import { HealthModule } from '@pbl6/service-kit';
import { prismaHealthCheck } from '@pbl6/service-kit/prisma';
import { validateEnv } from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';
import { PrismaService } from './prisma/prisma.service';
import { PlansModule } from './plans/plans.module';
import { SchedulerService } from './scheduler/scheduler.service';
import { EquipmentEventsConsumer } from './events/equipment-events.consumer';
import { WorkOrderEventsConsumer } from './events/work-order-events.consumer';
import { EventsService } from './events/events.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Service-local .env first, then the monorepo root .env.
      envFilePath: ['.env', '../../.env'],
      validate: validateEnv,
    }),
    PrismaModule,
    PlansModule,
    AuthModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => jwtOptionsFromConfig(config),
    }),
    HealthModule.forRootAsync({
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) => [prismaHealthCheck(prisma)],
    }),
  ],
  providers: [SchedulerService, EquipmentEventsConsumer, WorkOrderEventsConsumer, EventsService],
})
export class AppModule {}
