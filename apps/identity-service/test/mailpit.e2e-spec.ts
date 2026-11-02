import { INestApplication } from '@nestjs/common';
import { signTestAccessToken } from '@pbl6/testing';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  createTenant,
  createTestApp,
  createUser,
  resetDatabase,
} from './support/test-app';

const live =
  process.env.IDENTITY_MAILPIT_SMOKE === '1' ? describe : describe.skip;

live('Identity activation delivery to local Mailpit', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    await resetDatabase(prisma);
  });
  afterAll(async () => app?.close());

  it('sends one encrypted activation job through SMTP', async () => {
    const tenantId = await createTenant(prisma, 'MAIL-SMOKE');
    const adminId = await createUser(prisma, {
      tenantId,
      userType: 'TENANT_STAFF',
      email: 'admin@mail-smoke.local',
      password: 'Correct#Pass1',
      roles: ['TENANT_ADMIN'],
    });
    const adminToken = signTestAccessToken({
      role: 'TENANT_ADMIN',
      tenantId,
      userId: adminId,
    });
    const response = await request(app.getHttpServer())
      .post('/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: 'recipient@mail-smoke.local',
        fullName: 'Mail Recipient',
        userType: 'TENANT_STAFF',
        roles: ['TECHNICIAN'],
      })
      .expect(201);
    const userId = response.body.user.id as string;
    const token = await prisma.accountToken.findFirstOrThrow({
      where: { userId },
    });
    const queued = await prisma.activationDelivery.findUniqueOrThrow({
      where: { tokenId: token.id },
    });
    expect(queued.ciphertext).not.toContain(
      response.body.activationToken as string,
    );
    const deadline = Date.now() + 20_000;
    for (;;) {
      const delivery = await prisma.activationDelivery.findUniqueOrThrow({
        where: { tokenId: token.id },
      });
      if (delivery.status === 'SENT') {
        expect(delivery.ciphertext).toBeNull();
        expect(delivery.sentAt).not.toBeNull();
        break;
      }
      if (Date.now() >= deadline)
        throw new Error(`Mailpit delivery status: ${delivery.status}`);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }, 30_000);
});
