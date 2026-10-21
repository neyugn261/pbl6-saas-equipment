import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IdentityEnv } from '../config/env.validation';
import { PrismaClient } from '../generated/prisma/client.js';
import { createPrismaAdapter } from '@pbl6/service-kit/prisma';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(config: ConfigService<IdentityEnv, true>) {
    super({
      adapter: createPrismaAdapter(
        config.get('IDENTITY_DATABASE_URL', { infer: true }),
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
