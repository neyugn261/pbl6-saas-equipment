import 'reflect-metadata';
import { config } from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { AccessTokenVerifier, jwtOptionsFromConfig } from '@pbl6/auth';
import { ConfigService } from '@nestjs/config';
import { ServiceHttpClient } from '@pbl6/service-kit';
import { seedInventory } from './seed-demo';

async function main() {
  config({ path: '.env', quiet: true });
  config({ path: '../../.env', quiet: true });
  if (process.env.NODE_ENV === 'production')
    throw new Error('Demo seed is disabled in production');
  const { IDENTITY_SERVICE_URL, SEED_DEMO_PASSWORD } = process.env;
  if (!IDENTITY_SERVICE_URL || !SEED_DEMO_PASSWORD)
    throw new Error('IDENTITY_SERVICE_URL and SEED_DEMO_PASSWORD are required');
  const identity = new ServiceHttpClient({
    name: 'identity-service',
    baseUrl: IDENTITY_SERVICE_URL,
  });
  const catalog = require('../../../../scripts/demo/catalog.cjs');
  const sessions: Array<{ branchId: string; accessToken: string }> = [];
  for (const warehouse of catalog.warehouses) {
    const session = await identity.post<{ accessToken: string }>(
      '/auth/login',
      {
        tenantCode: 'DEMO',
        email: warehouse.email,
        password: SEED_DEMO_PASSWORD,
      },
    );
    sessions.push({
      branchId: warehouse.branchId,
      accessToken: session.accessToken,
    });
  }
  // No consumer/relay is started by this one-shot dev utility.
  process.env.RABBITMQ_URL = '';
  const { AppModule } = await import('../app.module.js');
  const { InventoryRepository } =
    await import('../inventory/inventory.repository.js');
  const { ReferencesClient } =
    await import('../inventory/references.client.js');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    for (const session of sessions) {
      const p = new AccessTokenVerifier(
        jwtOptionsFromConfig(app.get(ConfigService)),
      ).verify(session.accessToken);
      const result = await seedInventory(
        app.get(InventoryRepository),
        app.get(ReferencesClient),
        p,
        process.env.NODE_ENV ?? 'development',
        session.branchId,
      );
      console.log(JSON.stringify({ status: 'READY', ...result }));
    }
  } finally {
    await app.close();
  }
}
void main().catch(() => {
  console.error(
    'Inventory demo seed failed; check local Identity/Organization availability and demo configuration',
  );
  process.exitCode = 1;
});
