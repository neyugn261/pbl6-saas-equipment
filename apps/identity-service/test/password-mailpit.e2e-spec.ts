import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import {
  createTenant,
  createTestApp,
  createUser,
  resetDatabase,
} from './support/test-app';
import { ActivationDeliveryWorker } from '../src/users/activation-delivery.worker';

const live =
  process.env.IDENTITY_MAILPIT_SMOKE === '1' ? describe : describe.skip;
live('HU-04 OTP through real SMTP and Mailpit', () => {
  let app: INestApplication, db: PrismaService;
  beforeAll(async () => {
    ({ app, prisma: db } = await createTestApp());
    app
      .get(ConfigService)
      .set('IDENTITY_OTP_SECRET', 'mailpit-test-only-secret'.repeat(3));
    await resetDatabase(db);
  });
  afterAll(async () => app?.close());
  it('delivers a usable OTP, clears ciphertext, rejects replay and logs in with new password', async () => {
    const email = `otp-${randomUUID()}@mail-smoke.local`;
    const tenantCode = 'OTP-MAILPIT';
    const tenantId = await createTenant(db, tenantCode);
    await createUser(db, {
      tenantId,
      userType: 'TENANT_STAFF',
      email,
      password: 'Original#Pass1',
      roles: ['TECHNICIAN'],
    });
    const http = request(app.getHttpServer());
    const response = await http
      .post('/auth/forgot-password')
      .send({ tenantCode, email })
      .expect(202);
    const api = process.env.MAILPIT_API_URL;
    if (!api) throw new Error('MAILPIT_API_URL is required');
    let otp: string | undefined;
    const deadline = Date.now() + 25000;
    while (Date.now() < deadline) {
      const response = await fetch(`${api}/api/v1/messages`);
      if (!response.ok) throw new Error('Cannot read Mailpit messages');
      const inbox = (await response.json()) as {
        messages: { ID: string; To: { Address: string }[] }[];
      };
      const message = inbox.messages.find((m) =>
        m.To.some((to) => to.Address === email),
      );
      if (message) {
        const detail = (await (
          await fetch(`${api}/api/v1/message/${message.ID}`)
        ).json()) as { Text: string };
        otp = detail.Text.match(/mật khẩu của bạn: (\d{6})/)?.[1];
        if (otp) break;
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    expect(otp).toMatch(/^\d{6}$/);
    const job = await db.activationDelivery.findUniqueOrThrow({
      where: { tokenId: response.body.challengeId },
    });
    expect(job.status).toBe('SENT');
    expect(job.ciphertext).toBeNull();
    expect(JSON.stringify(response.body)).not.toContain(otp);
    const reset = {
      challengeId: response.body.challengeId,
      otp,
      newPassword: 'Updated#Pass2',
    };
    await http.post('/auth/reset-password').send(reset).expect(204);
    await http.post('/auth/reset-password').send(reset).expect(400);
    await http
      .post('/auth/login')
      .send({ tenantCode, email, password: reset.newPassword })
      .expect(200);
    await http
      .post('/auth/login')
      .send({ tenantCode, email, password: 'Original#Pass1' })
      .expect(401);
  }, 35000);
  it('retains encrypted delivery on SMTP failure and retries through the same worker', async () => {
    const config = app.get(ConfigService),
      worker = app.get(ActivationDeliveryWorker);
    const tenantCode = 'OTP-MAIL-RETRY',
      email = `retry-${randomUUID()}@mail-smoke.local`;
    const tenantId = await createTenant(db, tenantCode);
    await createUser(db, {
      tenantId,
      userType: 'TENANT_STAFF',
      email,
      password: 'Original#Pass1',
      roles: ['TECHNICIAN'],
    });
    const port = config.get('SMTP_PORT');
    // Closed local port: real connection failure, no mocked SMTP transport.
    config.set('SMTP_PORT', 1126);
    try {
      const response = await request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ tenantCode, email })
        .expect(202);
      await worker['tick']();
      const pending = await db.activationDelivery.findUniqueOrThrow({
        where: { tokenId: response.body.challengeId },
      });
      expect(pending.status).toBe('PENDING');
      expect(pending.attempts).toBeGreaterThan(0);
      expect(pending.ciphertext).not.toBeNull();
      expect(pending.lastError).not.toBeNull();
      config.set('SMTP_PORT', port);
      await db.activationDelivery.update({
        where: { id: pending.id },
        data: { availableAt: new Date() },
      });
      await worker['tick']();
      const sent = await db.activationDelivery.findUniqueOrThrow({
        where: { id: pending.id },
      });
      expect(sent.status).toBe('SENT');
      expect(sent.ciphertext).toBeNull();
    } finally {
      config.set('SMTP_PORT', port);
    }
  }, 35000);
});
