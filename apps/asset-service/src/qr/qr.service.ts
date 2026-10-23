import { randomBytes } from 'node:crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { dataScope, type Principal } from '@pbl6/auth';
import { equipmentResponse } from '../equipment/equipment.service';
import { QrRepository } from './qr.repository';

@Injectable()
export class QrService {
  constructor(private readonly repository: QrRepository, private readonly config: ConfigService) {}

  async issue(principal: Principal, equipmentId: string) {
    const token = randomBytes(32).toString('base64url');
    const qr = await this.repository.issue(dataScope(principal), equipmentId, principal.userId, token);
    const base = this.config.getOrThrow<string>('ASSET_QR_PORTAL_BASE_URL');
    const url = new URL(`portal/qr/${token}`, base.endsWith('/') ? base : `${base}/`).toString();
    return { id: qr.id, equipmentId: qr.equipmentId, token, url, createdAt: qr.createdAt.toISOString() };
  }

  async revoke(principal: Principal, equipmentId: string): Promise<void> {
    await this.repository.revoke(dataScope(principal), equipmentId, principal.userId);
  }

  async resolve(principal: Principal, token: string) {
    if (!/^[A-Za-z0-9_-]{22,255}$/.test(token)) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'Invalid QR token' });
    }
    return equipmentResponse(await this.repository.resolve(dataScope(principal), token));
  }
}
