import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import type { IdentityEnv } from '../config/env.validation';
import { PrismaService } from '../prisma/prisma.service';
import { decryptActivationUrl } from './activation-secret';

/** Private SMTP job worker; no token or URL enters logs or the event bus. */
@Injectable()
export class ActivationDeliveryWorker
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(ActivationDeliveryWorker.name);
  private timer: ReturnType<typeof setInterval> | undefined;
  private busy = false;

  constructor(
    private readonly config: ConfigService<IdentityEnv, true>,
    private readonly prisma: PrismaService,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.get('SMTP_HOST', { infer: true })) return;
    this.timer = setInterval(() => void this.tick(), 5_000);
    void this.tick();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      // Bound work per poll so request handling is not starved by a backlog.
      for (let index = 0; index < 20; index += 1) {
        const claimed = await this.prisma.$queryRaw<{ id: string }[]>`
          WITH next AS (
            SELECT id FROM activation_deliveries
            WHERE status = 'PENDING' AND available_at <= now()
            ORDER BY available_at, id FOR UPDATE SKIP LOCKED LIMIT 1
          )
          UPDATE activation_deliveries AS d
          SET attempts = attempts + 1, available_at = now() + interval '2 minutes'
          FROM next WHERE d.id = next.id RETURNING d.id`;
        if (!claimed.length) break;
        await this.deliver(claimed[0].id);
      }
    } catch (error) {
      this.logger.error({
        msg: 'Activation delivery poll failed',
        code: error instanceof Error ? error.name : 'UNKNOWN',
      });
    } finally {
      this.busy = false;
    }
  }

  private async deliver(id: string): Promise<void> {
    const job = await this.prisma.activationDelivery.findUnique({
      where: { id },
      include: { token: true },
    });
    if (!job || job.status !== 'PENDING' || !job.ciphertext) return;
    if (job.token.usedAt || job.token.expiresAt.getTime() <= Date.now()) {
      await this.prisma.activationDelivery.update({
        where: { id },
        data: { status: 'EXPIRED', ciphertext: null },
      });
      return;
    }
    try {
      const link = decryptActivationUrl(
        job.ciphertext,
        this.config.getOrThrow('IDENTITY_ACTIVATION_ENCRYPTION_KEY', {
          infer: true,
        }),
      );
      const transport = nodemailer.createTransport({
        host: this.config.getOrThrow('SMTP_HOST', { infer: true }),
        port: this.config.get('SMTP_PORT', { infer: true }),
        secure: false,
        connectionTimeout: 30_000,
        greetingTimeout: 30_000,
        socketTimeout: 30_000,
      });
      try {
        await transport.sendMail({
          from: this.config.getOrThrow('SMTP_FROM', { infer: true }),
          to: job.email,
          subject: 'Kích hoạt tài khoản PBL6',
          text: `Mở liên kết sau để kích hoạt tài khoản (hết hạn sau 24 giờ):\n${link}`,
        });
      } finally {
        transport.close();
      }
      await this.prisma.activationDelivery.update({
        where: { id },
        data: {
          status: 'SENT',
          ciphertext: null,
          sentAt: new Date(),
          lastError: null,
        },
      });
      this.logger.log({ msg: 'Activation email sent', deliveryId: id });
    } catch (error) {
      const retrySeconds = Math.min(3600, 30 * 2 ** Math.min(job.attempts, 7));
      await this.prisma.activationDelivery.update({
        where: { id },
        data: {
          availableAt: new Date(Date.now() + retrySeconds * 1000),
          lastError:
            error instanceof Error ? error.name.slice(0, 100) : 'UNKNOWN',
        },
      });
      this.logger.warn({
        msg: 'Activation email retry scheduled',
        deliveryId: id,
        attempts: job.attempts,
      });
    }
  }
}
