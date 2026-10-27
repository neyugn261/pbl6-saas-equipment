import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthModule, jwtOptionsFromConfig } from '@pbl6/auth';
import { HealthModule } from '@pbl6/service-kit';
import { prismaHealthCheck } from '@pbl6/service-kit/prisma';
import { validateEnv } from './config/env.validation';
import { EquipmentModelModule } from './equipment-models/equipment-model.module';
import { EquipmentModule } from './equipment/equipment.module';
import { OrganizationModule } from './organization/organization.module';
import { PrismaModule } from './prisma/prisma.module';
import { PrismaService } from './prisma/prisma.service';
import { EventsService } from './events/events.service';
import { HistoryConsumer } from './events/history.consumer';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Service-local .env first, then the monorepo root .env.
      envFilePath: ['.env', '../../.env'],
      validate: validateEnv,
    }),
    PrismaModule,
    OrganizationModule,
    EquipmentModelModule,
    EquipmentModule,
    // Global JwtAuthGuard + PermissionsGuard: every route needs a token unless @Public().
    AuthModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => jwtOptionsFromConfig(config),
    }),
    HealthModule.forRootAsync({
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) => [prismaHealthCheck(prisma)],
    }),
  ],
  providers: [EventsService, HistoryConsumer],
})
export class AppModule {}
