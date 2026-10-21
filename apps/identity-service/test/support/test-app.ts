import { randomUUID } from 'node:crypto';
import { INestApplication, Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import bcrypt from 'bcryptjs';
import { AppModule } from '../../src/app.module';
import { configureApp } from '@pbl6/service-kit';
import { PrismaService } from '../../src/prisma/prisma.service';

export async function createTestApp(): Promise<{
  app: INestApplication;
  prisma: PrismaService;
}> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication();
  configureApp(app, { logger: new Logger('e2e') });
  await app.init();
  return { app, prisma: app.get(PrismaService) };
}

/** Clears all identity data except the role and permission catalogs. */
export async function resetDatabase(prisma: PrismaService): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE auth_sessions, account_tokens, user_customer_links, user_roles, users, tenant_directory, processed_events',
  );
}

export async function createTenant(
  prisma: PrismaService,
  code: string,
  status: 'ACTIVE' | 'SUSPENDED' | 'DISABLED' = 'ACTIVE',
): Promise<string> {
  const tenantId = randomUUID();
  await prisma.tenantDirectory.create({ data: { tenantId, code, status } });
  return tenantId;
}

export interface UserFixture {
  tenantId: string | null;
  userType: 'PLATFORM_STAFF' | 'TENANT_STAFF' | 'CUSTOMER';
  email: string;
  password: string | null;
  status?: 'INVITED' | 'ACTIVE' | 'SUSPENDED' | 'DISABLED';
  roles?: string[];
}

export async function createUser(
  prisma: PrismaService,
  fixture: UserFixture,
): Promise<string> {
  const user = await prisma.user.create({
    data: {
      tenantId: fixture.tenantId,
      userType: fixture.userType,
      email: fixture.email,
      fullName: fixture.email.split('@')[0],
      passwordHash: fixture.password
        ? await bcrypt.hash(fixture.password, 4)
        : null,
      status: fixture.status ?? 'ACTIVE',
    },
  });
  for (const code of fixture.roles ?? []) {
    const role = await prisma.role.findUniqueOrThrow({ where: { code } });
    await prisma.userRole.create({
      data: { userId: user.id, roleId: role.id },
    });
  }
  return user.id;
}
