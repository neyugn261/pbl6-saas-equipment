import { ForbiddenException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { permissionsOf, type Principal } from '@pbl6/auth';
import { ServiceHttpClient, UpstreamError } from '@pbl6/service-kit';

/** Live checks only for this new workflow; no JWT persistence or machine identity. */
@Injectable()
export class HandoverAuthorization {
  constructor(private readonly config: ConfigService) {}
  async check(p: Principal, decision = false): Promise<void> {
    if (decision && p.userType !== 'CUSTOMER') this.denied();
    const url = this.config.get<string>('IDENTITY_SERVICE_URL');
    if (!url) throw new ServiceUnavailableException({ code: 'IDENTITY_NOT_CONFIGURED', message: 'Identity validation unavailable' });
    try {
      const profile = await new ServiceHttpClient({ name: 'identity-service', baseUrl: url }).get<{
        id: string; tenantId: string; userType: string; customerId: string | null; status: string; roles: string[];
      }>('/auth/me', { accessToken: p.accessToken });
      if (profile.id !== p.userId || profile.tenantId !== p.tenantId || profile.userType !== p.userType ||
          profile.status !== 'ACTIVE' || !permissionsOf(profile.roles).has(
            p.userType === 'CUSTOMER' ? (decision ? 'equipment_handover:respond' : 'equipment:read') : 'equipment:manage',
          ) || (p.userType === 'CUSTOMER' && profile.customerId !== p.customerId)) this.denied();
      if (p.userType === 'CUSTOMER') {
        const organization = this.config.get<string>('ORGANIZATION_SERVICE_URL');
        if (!organization) throw new Error('Organization not configured');
        const membership = await new ServiceHttpClient({ name: 'organization-service', baseUrl: organization }).get<{
          userId: string; customerId: string; status: string;
        }>('/internal/my/customer-membership', { accessToken: p.accessToken });
        if (membership.userId !== p.userId || membership.customerId !== p.customerId || membership.status !== 'ACTIVE') this.denied();
      }
    } catch (error) {
      if (error instanceof ForbiddenException) throw error;
      if (error instanceof UpstreamError && [401, 403, 404].includes(error.status)) this.denied();
      throw new ServiceUnavailableException({ code: 'HANDOVER_AUTHORIZATION_UNAVAILABLE', message: 'Live authorization unavailable; retry later' });
    }
  }
  private denied(): never { throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Current account or customer membership cannot authorize this handover' }); }
}
