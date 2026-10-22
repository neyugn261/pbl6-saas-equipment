import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthModule as SharedAuthModule, jwtOptionsFromConfig } from '@pbl6/auth';
import { HealthModule } from '@pbl6/service-kit';
import { prismaHealthCheck } from '@pbl6/service-kit/prisma';
import { AuthModule } from './auth/auth.module';
import { validateEnv } from './config/env.validation';
import { EventsModule } from './events/events.module';
import { PrismaModule } from './prisma/prisma.module';
import { PrismaService } from './prisma/prisma.service';
import { UsersModule } from './users/users.module';
import { InternalModule } from './internal/internal.module';

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
    SharedAuthModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => jwtOptionsFromConfig(config),
    }),
    HealthModule.forRootAsync({
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) => [prismaHealthCheck(prisma)],
    }),
    AuthModule,
    EventsModule,
    UsersModule,
    InternalModule,
  ],
})
export class AppModule {}
