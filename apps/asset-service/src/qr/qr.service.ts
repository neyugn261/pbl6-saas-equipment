import { randomBytes } from 'node:crypto';
import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { dataScope, type Principal } from '@pbl6/auth';
import { equipmentResponse } from '../equipment/equipment.service';
import { QrRepository } from './qr.repository';

@Injectable()
export class QrService {
  constructor(
    private readonly repository: QrRepository,
    private readonly config: ConfigService,
  ) {}

  private code(qr: { id: string; equipmentId: string; token: string; createdAt: Date }) {
    const base = this.config.getOrThrow<string>('ASSET_QR_PORTAL_BASE_URL');
    return {
      id: qr.id,
      equipmentId: qr.equipmentId,
      token: qr.token,
      url: new URL(`portal/qr/${qr.token}`, base.endsWith('/') ? base : `${base}/`).toString(),
      createdAt: qr.createdAt.toISOString(),
    };
  }

  /** Read the existing printable token; never issue or rotate a code on GET. */
  async current(principal: Principal, equipmentId: string) {
    if (principal.userType !== 'TENANT_STAFF' || !principal.permissions.has('qr:manage'))
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'QR management permission required' });
    const { equipmentStatus, qr } = await this.repository.current(dataScope(principal), equipmentId);
    const state = equipmentStatus === 'RETIRED'
      ? 'INELIGIBLE'
      : !qr ? 'NOT_ISSUED' : qr.revokedAt ? 'REVOKED' : 'ACTIVE';
    return {
      equipmentId,
      state,
      code: state === 'ACTIVE' && qr ? this.code(qr) : null,
      canIssue: equipmentStatus !== 'RETIRED',
      canPrint: state === 'ACTIVE',
      reason: state === 'INELIGIBLE' ? 'EQUIPMENT_RETIRED' : null,
    };
  }

  async issue(principal: Principal, equipmentId: string) {
    const token = randomBytes(32).toString('base64url');
    const qr = await this.repository.issue(
      dataScope(principal),
      equipmentId,
      principal.userId,
      token,
      principal.roles,
    );
    return this.code(qr);
  }

  async revoke(principal: Principal, equipmentId: string): Promise<void> {
    await this.repository.revoke(
      dataScope(principal),
      equipmentId,
      principal.userId,
      principal.roles,
    );
  }

  async resolve(principal: Principal, token: string) {
    if (!/^[A-Za-z0-9_-]{22,255}$/.test(token)) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Invalid QR token',
      });
    }
    return equipmentResponse(
      await this.repository.resolve(dataScope(principal), token),
      principal.userType === 'CUSTOMER',
    );
  }
}
