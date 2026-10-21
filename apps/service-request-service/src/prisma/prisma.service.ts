import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createPrismaAdapter } from '@pbl6/service-kit/prisma';
import { AppEnv } from '../config/env.validation';
import { PrismaClient } from '../generated/prisma/client.js';

/** Prisma client of service_request_db (session time zone pinned to UTC). */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(config: ConfigService<AppEnv, true>) {
    super({
      adapter: createPrismaAdapter(
        config.get('SERVICE_REQUEST_DATABASE_URL', { infer: true }),
      ),
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
