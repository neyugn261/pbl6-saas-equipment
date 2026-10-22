import { randomUUID } from 'node:crypto';
import { INestApplication, Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { RoleCode } from '@pbl6/auth';
import { configureApp } from '@pbl6/service-kit';
import { signTestAccessToken } from '@pbl6/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../../src/app.module';
import {
  IdentityClient,
  type IdentityUser,
} from '../../../src/identity/identity.client';
import { PrismaService } from '../../../src/prisma/prisma.service';

/**
 * Identity's `GET /internal/users/{id}` as agreed in the M1 contract: only
 * users of the caller's tenant are found (the token is decoded for it).
 */
export class FakeIdentityClient extends IdentityClient {
  private readonly users = new Map<string, IdentityUser>();

  add(user: Partial<IdentityUser> & Pick<IdentityUser, 'tenantId' | 'userType' | 'roles'>): string {
    const id = user.id ?? randomUUID();
    this.users.set(id, { id, status: 'ACTIVE', email: `${id}@example.com`, fullName: 'Test', ...user });
    return id;
  }

  clear(): void {
    this.users.clear();
  }

  async findUser(userId: string, accessToken: string): Promise<IdentityUser | null> {
    const claims = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64url').toString());
    const user = this.users.get(userId);
    return user && user.tenantId === claims.tenant_id ? user : null;
  }
}

export async function createTestApp(): Promise<{
  app: INestApplication<App>;
  prisma: PrismaService;
  identity: FakeIdentityClient;
}> {
  const identity = new FakeIdentityClient();
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(IdentityClient)
    .useValue(identity)
    .compile();
  const app = moduleRef.createNestApplication({ logger: false });
  configureApp(app, { logger: new Logger('e2e') });
  await app.init();
  return { app, prisma: app.get(PrismaService), identity };
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
export function bearer(
  role: RoleCode,
  tenantId?: string,
  customerId?: string,
  userId: string = randomUUID(),
): string {
  return `Bearer ${signTestAccessToken({ role, tenantId, customerId, userId })}`;
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
