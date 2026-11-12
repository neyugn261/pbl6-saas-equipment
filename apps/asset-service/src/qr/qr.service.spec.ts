import { ConfigService } from '@nestjs/config';
import { permissionsOf, type Principal } from '@pbl6/auth';
import { QrService } from './qr.service';
import type { QrRepository } from './qr.repository';

const manager: Principal = {
  userId: 'manager', tenantId: 'tenant', customerId: null, userType: 'TENANT_STAFF',
  sessionId: 'session', roles: ['SERVICE_MANAGER'], permissions: permissionsOf(['SERVICE_MANAGER']),
  accessToken: 'test-only', expiresAt: new Date(),
};
const code = { id: 'qr-id', equipmentId: 'equipment', token: 'q'.repeat(43),
  createdAt: new Date('2026-11-12T00:00:00Z'), revokedAt: null };

describe('QR read projection', () => {
  const current = jest.fn();
  const service = new QrService({ current } as unknown as QrRepository,
    new ConfigService({ ASSET_QR_PORTAL_BASE_URL: 'https://portal.test/app/' }));
  beforeEach(() => current.mockReset());

  it.each([
    ['ACTIVE', null, 'NOT_ISSUED', true, false],
    ['ACTIVE', { ...code, revokedAt: new Date() }, 'REVOKED', true, false],
    ['RETIRED', code, 'INELIGIBLE', false, false],
  ])('explains non-printable codes for %s equipment', async (equipmentStatus, qr, state, canIssue, canPrint) => {
    current.mockResolvedValue({ equipmentStatus, qr });
    expect(await service.current(manager, 'equipment')).toMatchObject({ state, code: null, canIssue, canPrint });
  });

  it('keeps the existing URL and payload stable across reads', async () => {
    current.mockResolvedValue({ equipmentStatus: 'ACTIVE', qr: code });
    const first = await service.current(manager, 'equipment');
    expect(await service.current(manager, 'equipment')).toEqual(first);
    expect(first).toMatchObject({ state: 'ACTIVE', code: { token: code.token,
      url: `https://portal.test/app/portal/qr/${code.token}` } });
    expect(current).toHaveBeenCalledWith({ tenantId: manager.tenantId, customerId: null }, 'equipment');
  });

  it('rejects non-managers before querying printable tokens', async () => {
    for (const principal of [
      { ...manager, permissions: permissionsOf(['TECHNICIAN']) },
      { ...manager, userType: 'CUSTOMER' as const },
    ]) await expect(service.current(principal, 'equipment')).rejects.toMatchObject({ status: 403 });
    expect(current).not.toHaveBeenCalled();
  });
});
