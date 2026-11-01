import {
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createLogger } from '@pbl6/service-kit';
import type { AppEnv } from '../config/env.validation';
import {
  ATTACHMENT_STORAGE,
  type AttachmentStorage,
} from './attachment-storage';
import { AttachmentCleanupRepository } from './attachment-cleanup.repository';

@Injectable()
export class AttachmentCleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = createLogger('workorder-service');
  private timer?: ReturnType<typeof setInterval>;
  private active?: Promise<void>;
  private nextReconcile = 0;
  private stopping = false;
  constructor(
    private readonly repo: AttachmentCleanupRepository,
    @Inject(ATTACHMENT_STORAGE) private readonly storage: AttachmentStorage,
    private readonly config: ConfigService<AppEnv, true>,
  ) {}
  onModuleInit() {
    if (
      !this.storage.enabled ||
      !this.config.get('WORKORDER_ATTACHMENT_WORKER_ENABLED', { infer: true })
    )
      return;
    this.timer = setInterval(() => {
      void this.tick();
    }, 15_000);
    this.timer.unref();
    void this.tick();
  }
  async onModuleDestroy() {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    await this.active;
  }
  async tick() {
    if (this.active) return this.active;
    this.active = this.run()
      .catch(() => {
        this.logger.error({
          msg: 'Attachment cleanup tick failed',
          code: 'ATTACHMENT_CLEANUP_TICK_FAILED',
        });
      })
      .finally(() => {
        this.active = undefined;
      });
    return this.active;
  }
  private async run() {
    if (!this.storage.enabled) return;
    await this.repo.expireBatch();
    for (let count = 0; count < 100 && !this.stopping; count++) {
      const job = await this.repo.claim();
      if (!job) break;
      try {
        if (!(await this.repo.authorizeRemoval(job))) continue;
        await this.storage.remove(job.objectKey);
        await this.repo.done(job);
      } catch {
        await this.repo.failed(job);
        this.logger.warn({
          msg: 'Attachment cleanup will retry',
          code: 'ATTACHMENT_STORAGE_UNAVAILABLE',
          attemptCount: job.attemptCount,
        });
      }
    }
    if (Date.now() >= this.nextReconcile) {
      this.nextReconcile = Date.now() + 600_000;
      let unknown = 0;
      for await (const object of this.storage.objects()) {
        if (this.stopping) break;
        if (
          object.lastModified.getTime() <= Date.now() - 600_000 &&
          !(await this.repo.reconcile(object.key))
        )
          unknown++;
      }
      if (unknown)
        this.logger.warn({
          msg: 'Unknown attachment objects require owner investigation',
          code: 'ATTACHMENT_OBJECT_OWNERSHIP_UNKNOWN',
          count: unknown,
        });
    }
  }
}
