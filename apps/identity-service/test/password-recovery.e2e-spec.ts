import { randomBytes } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { decryptActivationUrl } from '../src/users/activation-secret';
import { AuthRepository } from '../src/auth/auth.repository';
import {
  createTenant,
  createTestApp,
  createUser,
  resetDatabase,
} from './support/test-app';

describe('HU-04 password recovery (real PostgreSQL, SMTP separately)', () => {
  let app: INestApplication, db: PrismaService, userId: string;
  const oldPassword = 'Old#Password1',
    newPassword = 'New#Password2';
  const key = randomBytes(32).toString('hex');
  const http = () => request(app.getHttpServer());
  const credentials = {
    tenantCode: 'OTP-TEST',
    email: 'otp@example.test',
    password: oldPassword,
  };
  const forgot = () =>
    http()
      .post('/auth/forgot-password')
      .send({ tenantCode: credentials.tenantCode, email: credentials.email });
  const reset = (challengeId: string, otp: string) =>
    http().post('/auth/reset-password').send({ challengeId, otp, newPassword });
  async function challenge() {
    const response = await forgot().expect(202);
    const job = await db.activationDelivery.findUniqueOrThrow({
      where: { tokenId: response.body.challengeId },
    });
    return {
      id: response.body.challengeId as string,
      otp: decryptActivationUrl(job.ciphertext!, key),
    };
  }
  beforeAll(async () => {
    ({ app, prisma: db } = await createTestApp());
    // No worker is started here: this suite checks DB/HTTP, not SMTP delivery.
    const config = app.get(ConfigService);
    config.set('IDENTITY_OTP_SECRET', randomBytes(32).toString('hex'));
    config.set('IDENTITY_ACTIVATION_ENCRYPTION_KEY', key);
    config.set('SMTP_HOST', 'localhost');
  });
  afterAll(async () => app?.close());
  beforeEach(async () => {
    await resetDatabase(db);
    const tenantId = await createTenant(db, credentials.tenantCode);
    userId = await createUser(db, {
      tenantId,
      userType: 'TENANT_STAFF',
      email: credentials.email,
      password: oldPassword,
      roles: ['TECHNICIAN'],
    });
  });
  it('changes only the current account and invalidates old credentials and sessions', async () => {
    const login = await http()
      .post('/auth/login')
      .send(credentials)
      .expect(200);
    const auth = `Bearer ${login.body.accessToken}`;
    await http()
      .post('/auth/change-password')
      .set('Authorization', auth)
      .send({ currentPassword: 'wrong', newPassword })
      .expect(400);
    await http()
      .post('/auth/change-password')
      .set('Authorization', auth)
      .send({ currentPassword: oldPassword, newPassword, userId })
      .expect(400);
    await http()
      .post('/auth/change-password')
      .set('Authorization', auth)
      .send({ currentPassword: oldPassword, newPassword })
      .expect(204);
    await http().get('/auth/me').set('Authorization', auth).expect(401);
    await http()
      .post('/auth/refresh')
      .send({ refreshToken: login.body.refreshToken })
      .expect(401);
    await http().post('/auth/login').send(credentials).expect(401);
    await http()
      .post('/auth/login')
      .send({ ...credentials, password: newPassword })
      .expect(200);
  });
  it('validates policy and JWT at HTTP boundary', async () => {
    await http()
      .post('/auth/change-password')
      .send({ currentPassword: oldPassword, newPassword })
      .expect(401);
    await http()
      .post('/auth/reset-password')
      .send({ challengeId: 'not-a-uuid', otp: '123456', newPassword })
      .expect(400);
    const c = await challenge();
    await http()
      .post('/auth/reset-password')
      .send({ challengeId: c.id, otp: c.otp, newPassword: 'weak' })
      .expect(400);
  });
  it('allows exactly one concurrent redemption and rejects replay', async () => {
    const prior = await db.user.findUniqueOrThrow({ where: { id: userId } });
    const login = await http()
      .post('/auth/login')
      .send(credentials)
      .expect(200);
    const c = await challenge();
    const responses = await Promise.all([
      reset(c.id, c.otp),
      reset(c.id, c.otp),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([204, 400]);
    await reset(c.id, c.otp).expect(400);
    await http()
      .get('/auth/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(401);
    await http().post('/auth/login').send(credentials).expect(401);
    await http()
      .post('/auth/login')
      .send({ ...credentials, password: newPassword })
      .expect(200);
    const token = await db.accountToken.findUniqueOrThrow({
      where: { id: c.id },
    });
    expect(token.usedAt).not.toBeNull();
    expect(token.tokenHash).not.toBe(c.otp);
    // Simulates a login/activation that verified before reset, then tried to
    // create its session after reset committed.
    await expect(
      app.get(AuthRepository).createLoginSession(
        {
          userId,
          refreshTokenHash: 'stale-login-test-hash',
          expiresAt: new Date(Date.now() + 60000),
          ipAddress: null,
          userAgent: null,
        },
        prior.passwordHash,
      ),
    ).rejects.toMatchObject({ response: { code: 'INVALID_CREDENTIALS' } });
  });
  it('invalidates old OTP on resend and enforces five wrong attempts', async () => {
    const old = await challenge(),
      current = await challenge();
    await reset(old.id, old.otp).expect(400);
    const wrong = current.otp === '000000' ? '000001' : '000000';
    for (let i = 0; i < 5; i++) await reset(current.id, wrong).expect(400);
    await reset(current.id, current.otp).expect(400);
    expect(
      (await db.accountToken.findUniqueOrThrow({ where: { id: current.id } }))
        .failedAttempts,
    ).toBe(5);
  });
  it('rejects expired and disabled-account challenges', async () => {
    const expired = await challenge();
    await db.accountToken.update({
      where: { id: expired.id },
      data: {
        createdAt: new Date(Date.now() - 600000),
        expiresAt: new Date(Date.now() - 300000),
      },
    });
    await reset(expired.id, expired.otp).expect(400);
    const disabled = await challenge();
    await db.user.update({
      where: { id: userId },
      data: { status: 'DISABLED' },
    });
    await reset(disabled.id, disabled.otp).expect(400);
  });
  it('does not expose account existence and rate limits unknown email', async () => {
    const known = await forgot().expect(202);
    const missing = {
      tenantCode: credentials.tenantCode,
      email: 'missing@example.test',
    };
    const unknown = await http()
      .post('/auth/forgot-password')
      .send(missing)
      .expect(202);
    expect(unknown.body.message).toBe(known.body.message);
    expect(Object.keys(unknown.body)).toEqual(Object.keys(known.body));
    expect(
      await db.accountToken.findUnique({
        where: { id: unknown.body.challengeId },
      }),
    ).toBeNull();
    for (let i = 0; i < 4; i++)
      await http().post('/auth/forgot-password').send(missing).expect(202);
    await http().post('/auth/forgot-password').send(missing).expect(429);
  });
});
