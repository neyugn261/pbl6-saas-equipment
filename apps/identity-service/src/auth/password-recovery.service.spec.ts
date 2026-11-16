import { createHmac } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PasswordRecoveryService } from './password-recovery.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { AuthRepository } from './auth.repository';
import type { PasswordService } from './password.service';
import type { IdentityEnv } from '../config/env.validation';
import { decryptActivationUrl } from '../users/activation-secret';

const secret = 'unit-test-only-otp-key'.repeat(3);
const key = 'ab'.repeat(32);
function setup(extra = {}) {
  const user = {
    id: 'user',
    tenantId: null,
    status: 'ACTIVE',
    passwordHash: 'hash',
    email: 'user@example.com',
  };
  const token = {
    id: 'challenge',
    userId: user.id,
    purpose: 'PASSWORD_RESET',
    usedAt: null,
    expiresAt: new Date(Date.now() + 300000),
    failedAttempts: 0,
    tokenHash: createHmac('sha256', secret)
      .update('otp:user:challenge:123456')
      .digest('hex'),
    ...extra,
  };
  const db = {
    $queryRaw: jest.fn().mockResolvedValue([{ attempts: 1 }]),
    user: { findUnique: jest.fn().mockResolvedValue(user), update: jest.fn() },
    accountToken: {
      findUnique: jest.fn().mockResolvedValue(token),
      update: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
    },
    authSession: { updateMany: jest.fn(), findUnique: jest.fn() },
    activationDelivery: { updateMany: jest.fn() },
    $transaction: jest.fn(),
  };
  db.$transaction.mockImplementation((fn: (tx: typeof db) => unknown) =>
    fn(db),
  );
  const passwords = {
    hash: jest.fn().mockResolvedValue('new-hash'),
    verify: jest.fn().mockResolvedValue(false),
  };
  const repository = {
    findLoginCandidate: jest.fn().mockResolvedValue(user),
    findTenantByCode: jest.fn(),
  };
  const config = new ConfigService({
    IDENTITY_OTP_SECRET: secret,
    IDENTITY_ACTIVATION_ENCRYPTION_KEY: key,
    SMTP_HOST: 'localhost',
    IDENTITY_OTP_TTL_SECONDS: 300,
  });
  const service = new PasswordRecoveryService(
    db as unknown as PrismaService,
    repository as unknown as AuthRepository,
    passwords as unknown as PasswordService,
    config as unknown as ConfigService<IdentityEnv, true>,
  );
  return { db, passwords, repository, service, user };
}

describe('password recovery security', () => {
  it('persists a wrong attempt without changing the password', async () => {
    const { service, db } = setup();
    await expect(
      service.reset(
        {
          challengeId: 'challenge',
          otp: '999999',
          newPassword: 'New#Password1',
        },
        'ip',
      ),
    ).rejects.toMatchObject({ response: { code: 'INVALID_PASSWORD_RESET' } });
    expect(db.accountToken.update).toHaveBeenCalledWith({
      where: { id: 'challenge' },
      data: { failedAttempts: { increment: 1 } },
    });
    expect(db.user.update).not.toHaveBeenCalled();
  });
  it.each([
    { usedAt: new Date() },
    { expiresAt: new Date(0) },
    { failedAttempts: 5 },
    { purpose: 'ACCOUNT_ACTIVATION' },
  ])('rejects invalid challenge %j', async (extra) => {
    const { service, db } = setup(extra);
    await expect(
      service.reset(
        {
          challengeId: 'challenge',
          otp: '123456',
          newPassword: 'New#Password1',
        },
        'ip',
      ),
    ).rejects.toThrow();
    expect(db.user.update).not.toHaveBeenCalled();
  });
  it('consumes challenges and revokes only the account sessions on success', async () => {
    const { service, db } = setup();
    await service.reset(
      { challengeId: 'challenge', otp: '123456', newPassword: 'New#Password1' },
      'ip',
    );
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: 'user' },
      data: { passwordHash: 'new-hash' },
    });
    expect(db.authSession.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(db.accountToken.updateMany).toHaveBeenCalled();
  });
  it('returns the same public shape for known and unknown accounts and encrypts delivery', async () => {
    const { service, db, repository } = setup();
    const known = await service.forgot({ email: 'user@example.com' }, 'ip');
    const data = db.accountToken.create.mock.calls[0][0].data;
    const otp = decryptActivationUrl(
      data.activationDelivery.create.ciphertext,
      key,
    );
    expect(otp).toMatch(/^\d{6}$/);
    expect(data.tokenHash).not.toContain(otp);
    expect(JSON.stringify(known)).not.toContain(otp);
    repository.findLoginCandidate.mockResolvedValue(null);
    const unknown = await service.forgot(
      { email: 'missing@example.com' },
      'ip',
    );
    expect(Object.keys(known)).toEqual(Object.keys(unknown));
    expect(known.message).toBe(unknown.message);
    expect(known.challengeId).not.toBe(unknown.challengeId);
    expect(db.accountToken.create).toHaveBeenCalledTimes(1);
  });
  it('rate limits unknown accounts before lookup', async () => {
    const { service, db, repository } = setup();
    db.$queryRaw.mockResolvedValue([{ attempts: 100 }]);
    await expect(
      service.forgot({ email: 'missing@example.com' }, 'ip'),
    ).rejects.toMatchObject({ status: 429 });
    expect(repository.findLoginCandidate).not.toHaveBeenCalled();
  });
  it('rejects passwords that bcrypt would truncate', async () => {
    const { service, db } = setup();
    await expect(
      service.reset(
        {
          challengeId: 'challenge',
          otp: '123456',
          newPassword: 'é'.repeat(40),
        },
        'ip',
      ),
    ).rejects.toMatchObject({ response: { code: 'PASSWORD_TOO_LONG' } });
    expect(db.user.update).not.toHaveBeenCalled();
  });
});
