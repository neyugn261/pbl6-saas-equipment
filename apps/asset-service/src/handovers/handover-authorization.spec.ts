import { ConfigService } from '@nestjs/config';
import { ServiceHttpClient } from '@pbl6/service-kit';
import { permissionsOf, type Principal } from '@pbl6/auth';
import { HandoverAuthorization } from './handover-authorization';
const p: Principal = { userId: 'user', tenantId: 'tenant', customerId: 'customer', userType: 'CUSTOMER',
  sessionId: 'session', roles: ['CUSTOMER_ADMIN'], permissions: permissionsOf(['CUSTOMER_ADMIN']), accessToken: 'test-only', expiresAt: new Date() };
const auth = new HandoverAuthorization(new ConfigService({ IDENTITY_SERVICE_URL: 'http://identity.test', ORGANIZATION_SERVICE_URL: 'http://organization.test' }));
afterEach(() => jest.restoreAllMocks());
it('rejects staff attempting to decide for a customer', async () => {
  await expect(auth.check({ ...p, userType: 'TENANT_STAFF' }, true)).rejects.toMatchObject({ status: 403 });
});
it.each([
  { roles: ['CUSTOMER_USER'] }, { customerId: 'other' }, { status: 'DISABLED' }, { tenantId: 'other' },
])('rejects revoked/stale identity context %j', async change => {
  jest.spyOn(ServiceHttpClient.prototype, 'get').mockResolvedValue({ id: p.userId, tenantId: p.tenantId,
    customerId: p.customerId, userType: 'CUSTOMER', status: 'ACTIVE', roles: ['CUSTOMER_ADMIN'], ...change });
  await expect(auth.check(p, true)).rejects.toMatchObject({ status: 403 });
});
it.each([{ status: 'INACTIVE' }, { customerId: 'other' }, { userId: 'other' }])('rejects current membership mismatch %j', async change => {
  jest.spyOn(ServiceHttpClient.prototype, 'get').mockResolvedValueOnce({ id: p.userId, tenantId: p.tenantId,
    customerId: p.customerId, userType: 'CUSTOMER', status: 'ACTIVE', roles: ['CUSTOMER_ADMIN'] })
    .mockResolvedValueOnce({ userId: p.userId, customerId: p.customerId, status: 'ACTIVE', ...change });
  await expect(auth.check(p, true)).rejects.toMatchObject({ status: 403 });
});
it('fails closed when a live authority cannot be reached', async () => {
  jest.spyOn(ServiceHttpClient.prototype, 'get').mockRejectedValue(new Error('unavailable'));
  await expect(auth.check(p, true)).rejects.toMatchObject({ status: 503 });
});
