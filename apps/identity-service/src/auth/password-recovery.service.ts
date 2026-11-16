import {
  createHmac,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import {
  BadRequestException,
  HttpException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Principal } from '@pbl6/auth';
import type { IdentityEnv } from '../config/env.validation';
import { PrismaService } from '../prisma/prisma.service';
import type { Prisma, User } from '../generated/prisma/client.js';
import { encryptActivationUrl } from '../users/activation-secret';
import { AuthRepository } from './auth.repository';
import { PasswordService } from './password.service';
import {
  ChangePasswordDto,
  ForgotPasswordDto,
  ResetPasswordDto,
} from './dto/password.dto';

type Tx = Prisma.TransactionClient;
const MESSAGE =
  'Nếu tài khoản đủ điều kiện, mã xác nhận sẽ được gửi qua email.';

@Injectable()
export class PasswordRecoveryService {
  private readonly logger = new Logger(PasswordRecoveryService.name);
  constructor(
    private readonly db: PrismaService,
    private readonly repository: AuthRepository,
    private readonly passwords: PasswordService,
    private readonly config: ConfigService<IdentityEnv, true>,
  ) {}

  private secret(): string {
    const secret = this.config.get('IDENTITY_OTP_SECRET', { infer: true });
    if (!secret)
      throw new ServiceUnavailableException({
        code: 'PASSWORD_RECOVERY_UNAVAILABLE',
        message: 'Password recovery is unavailable',
      });
    return secret;
  }

  private digest(value: string): string {
    return createHmac('sha256', this.secret()).update(value).digest('hex');
  }

  /** Commits rejected attempts too. Shared across processes, including unknown accounts. */
  private async budget(keys: [string, number][]): Promise<void> {
    const allowed = await this.db.$transaction(async (tx) => {
      let ok = true;
      for (const [label, limit] of keys) {
        const key = this.digest(`rate:${label}`);
        const rows = await tx.$queryRaw<{ attempts: number }[]>`
          INSERT INTO password_rate_limits (key, window_at, attempts)
          VALUES (${key}, now(), 1)
          ON CONFLICT (key) DO UPDATE SET
            attempts = CASE WHEN password_rate_limits.window_at <= now() - interval '15 minutes'
              THEN 1 ELSE password_rate_limits.attempts + 1 END,
            window_at = CASE WHEN password_rate_limits.window_at <= now() - interval '15 minutes'
              THEN now() ELSE password_rate_limits.window_at END
          RETURNING attempts`;
        ok = rows[0].attempts <= limit && ok;
      }
      return ok;
    });
    if (!allowed)
      throw new HttpException(
        { code: 'PASSWORD_RATE_LIMITED', message: 'Please retry later' },
        429,
      );
  }

  private async eligible(tx: Tx, user: User | null): Promise<boolean> {
    if (!user || user.status !== 'ACTIVE' || !user.passwordHash) return false;
    return (
      user.tenantId === null ||
      (
        await tx.tenantDirectory.findUnique({
          where: { tenantId: user.tenantId },
        })
      )?.status === 'ACTIVE'
    );
  }

  private async invalidate(tx: Tx, userId: string): Promise<void> {
    const now = new Date();
    await tx.authSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now },
    });
    await tx.accountToken.updateMany({
      where: { userId, purpose: 'PASSWORD_RESET', usedAt: null },
      data: { usedAt: now },
    });
    await tx.activationDelivery.updateMany({
      where: {
        token: { userId, purpose: 'PASSWORD_RESET' },
        status: 'PENDING',
      },
      data: { status: 'EXPIRED', ciphertext: null },
    });
  }

  async change(
    principal: Principal,
    input: ChangePasswordDto,
    ip: string,
  ): Promise<void> {
    this.checkPassword(input.newPassword);
    await this.budget([
      [`change-ip:${ip}`, 30],
      [`change-user:${principal.userId}`, 5],
    ]);
    await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${principal.userId}::uuid FOR UPDATE`;
      const user = await tx.user.findUnique({
        where: { id: principal.userId },
      });
      const session = await tx.authSession.findUnique({
        where: { id: principal.sessionId },
      });
      if (
        !user ||
        user.tenantId !== principal.tenantId ||
        !(await this.eligible(tx, user)) ||
        !session ||
        session.userId !== user.id ||
        session.revokedAt ||
        session.expiresAt.getTime() <= Date.now()
      )
        throw new UnauthorizedException({
          code: 'INVALID_ACCESS_TOKEN',
          message: 'Session is no longer valid',
        });
      if (
        !(await this.passwords.verify(input.currentPassword, user.passwordHash))
      )
        throw new BadRequestException({
          code: 'CURRENT_PASSWORD_INVALID',
          message: 'Current password is incorrect',
        });
      if (await this.passwords.verify(input.newPassword, user.passwordHash))
        throw new BadRequestException({
          code: 'PASSWORD_UNCHANGED',
          message: 'Choose a different password',
        });
      await tx.user.update({
        where: { id: user.id },
        data: { passwordHash: await this.passwords.hash(input.newPassword) },
      });
      await this.invalidate(tx, user.id);
    });
    this.logger.log({
      msg: 'Password changed; sessions revoked',
      userId: principal.userId,
    });
  }

  async forgot(input: ForgotPasswordDto, ip: string) {
    this.secret();
    const key = this.config.get('IDENTITY_ACTIVATION_ENCRYPTION_KEY', {
      infer: true,
    });
    if (!key || !this.config.get('SMTP_HOST', { infer: true }))
      throw new ServiceUnavailableException({
        code: 'PASSWORD_RECOVERY_UNAVAILABLE',
        message: 'Password recovery is unavailable',
      });
    await this.budget([
      [`forgot-ip:${ip}`, 20],
      [
        `forgot-account:${JSON.stringify([input.tenantCode ?? null, input.email.toLowerCase()])}`,
        5,
      ],
    ]);
    const challengeId = randomUUID();
    const tenant =
      input.tenantCode === undefined
        ? null
        : await this.repository.findTenantByCode(input.tenantCode);
    const candidate =
      input.tenantCode !== undefined && !tenant
        ? null
        : await this.repository.findLoginCandidate(
            tenant?.tenantId ?? null,
            input.email,
          );
    const otp = randomInt(0, 1_000_000).toString().padStart(6, '0');
    if (candidate)
      await this.db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${candidate.id}::uuid FOR UPDATE`;
        const user = await tx.user.findUnique({ where: { id: candidate.id } });
        if (!user || !(await this.eligible(tx, user))) return;
        // Resend invalidates earlier challenges, without revoking login sessions yet.
        await tx.accountToken.updateMany({
          where: { userId: user.id, purpose: 'PASSWORD_RESET', usedAt: null },
          data: { usedAt: new Date() },
        });
        await tx.activationDelivery.updateMany({
          where: {
            token: { userId: user.id, purpose: 'PASSWORD_RESET' },
            status: 'PENDING',
          },
          data: { status: 'EXPIRED', ciphertext: null },
        });
        await tx.accountToken.create({
          data: {
            id: challengeId,
            userId: user.id,
            purpose: 'PASSWORD_RESET',
            tokenHash: this.digest(`otp:${user.id}:${challengeId}:${otp}`),
            expiresAt: new Date(
              Date.now() +
                this.config.get('IDENTITY_OTP_TTL_SECONDS', { infer: true }) *
                  1000,
            ),
            activationDelivery: {
              create: {
                email: user.email,
                ciphertext: encryptActivationUrl(otp, key),
              },
            },
          },
        });
      });
    return { message: MESSAGE, challengeId };
  }

  async reset(input: ResetPasswordDto, ip: string): Promise<void> {
    this.checkPassword(input.newPassword);
    await this.budget([
      [`reset-ip:${ip}`, 30],
      [`reset-challenge:${input.challengeId}`, 10],
    ]);
    const token = await this.db.accountToken.findUnique({
      where: { id: input.challengeId },
    });
    const success =
      token &&
      (await this.db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${token.userId}::uuid FOR UPDATE`;
        const current = await tx.accountToken.findUnique({
          where: { id: input.challengeId },
        });
        const user = await tx.user.findUnique({ where: { id: token.userId } });
        if (
          !current ||
          !user ||
          current.purpose !== 'PASSWORD_RESET' ||
          current.usedAt ||
          current.expiresAt.getTime() <= Date.now() ||
          current.failedAttempts >= 5 ||
          !(await this.eligible(tx, user))
        )
          return false;
        const expected = Buffer.from(current.tokenHash, 'hex');
        const actual = Buffer.from(
          this.digest(`otp:${user.id}:${current.id}:${input.otp}`),
          'hex',
        );
        if (
          expected.length !== actual.length ||
          !timingSafeEqual(expected, actual)
        ) {
          await tx.accountToken.update({
            where: { id: current.id },
            data: { failedAttempts: { increment: 1 } },
          });
          return false; // commit attempt before returning a generic error
        }
        if (await this.passwords.verify(input.newPassword, user.passwordHash))
          return false;
        await tx.user.update({
          where: { id: user.id },
          data: { passwordHash: await this.passwords.hash(input.newPassword) },
        });
        await this.invalidate(tx, user.id);
        return true;
      }));
    if (!success)
      throw new BadRequestException({
        code: 'INVALID_PASSWORD_RESET',
        message: 'Invalid or expired password reset challenge',
      });
    this.logger.log({
      msg: 'Password reset; sessions revoked',
      userId: token!.userId,
    });
  }

  private checkPassword(password: string): void {
    // bcrypt only uses the first 72 bytes; never accept silently truncated secrets.
    if (Buffer.byteLength(password, 'utf8') > 72)
      throw new BadRequestException({
        code: 'PASSWORD_TOO_LONG',
        message: 'Password must not exceed 72 UTF-8 bytes',
      });
  }
}
