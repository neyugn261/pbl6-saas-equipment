import { Injectable, Logger, type OnModuleInit, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HandoverService } from './handover.service';
@Injectable()
export class HandoverWorker implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private running = false;
  private readonly logger = new Logger(HandoverWorker.name);
  constructor(private readonly handovers: HandoverService, private readonly config: ConfigService) {}
  onModuleInit() {
    if (this.config.get('NODE_ENV') === 'test') return;
    this.timer = setInterval(() => { void this.tick(); }, 10000);
    this.timer.unref();
  }
  private async tick() {
    if (this.running) return;
    this.running = true;
    try { await this.handovers.expireDue(); }
    catch { this.logger.error({ msg: 'Handover expiry failed; retry on next tick' }); }
    finally { this.running = false; }
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
}
