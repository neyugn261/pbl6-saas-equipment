import { randomUUID } from 'node:crypto';
import { INestApplication, Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { RoleCode } from '@pbl6/auth';
import { configureApp } from '@pbl6/service-kit';
import { signTestAccessToken } from '@pbl6/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../../src/app.module';
import { PrismaService } from '../../../src/prisma/prisma.service';

export async function createTestApp(): Promise<{
  app: INestApplication<App>;
  prisma: PrismaService;
}> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  configureApp(app, { logger: new Logger('e2e') });
  await app.init();
  return { app, prisma: app.get(PrismaService) };
}

/** Clears every organization table. */
export async function resetDatabase(prisma: PrismaService): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE customer_user_memberships, branch_user_assignments, customer_contacts, locations, customer_sites, customers, branches, outbox_events, tenants',
  );
}

export async function createTenant(prisma: PrismaService, code: string): Promise<string> {
  const tenant = await prisma.tenant.create({ data: { code, name: code } });
  return tenant.id;
}

/** `Authorization` header value for a caller with `role` in `tenantId`. */
export function bearer(role: RoleCode, tenantId?: string, customerId?: string): string {
  return `Bearer ${signTestAccessToken({ role, tenantId, customerId, userId: randomUUID() })}`;
}

/** Small HTTP helper: `api(app, token).post('/branches', body)`. */
export function api(app: INestApplication<App>, authorization: string) {
  const http = () => request(app.getHttpServer());
  return {
    get: (url: string) => http().get(url).set('authorization', authorization),
    post: (url: string, body: object = {}) =>
      http().post(url).set('authorization', authorization).send(body),
    patch: (url: string, body: object) =>
      http().patch(url).set('authorization', authorization).send(body),
    delete: (url: string) => http().delete(url).set('authorization', authorization),
  };
}
