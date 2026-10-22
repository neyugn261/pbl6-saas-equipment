import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ServiceHttpClient } from '@pbl6/service-kit';
import { AppEnv } from '../config/env.validation';

/** `GET /internal/users/{id}` of Identity (contract agreed for M1, docs/api/identity.yaml). */
export interface IdentityUser {
  id: string;
  tenantId: string | null;
  userType: 'PLATFORM_STAFF' | 'TENANT_STAFF' | 'CUSTOMER';
  status: string;
  roles: string[];
  email: string;
  fullName: string;
}

/**
 * Looks up accounts in Identity with the caller's forwarded token (ADR 0004).
 * Null when the user does not exist in the caller's tenant.
 */
export abstract class IdentityClient {
  abstract findUser(userId: string, accessToken: string): Promise<IdentityUser | null>;
}

@Injectable()
export class HttpIdentityClient extends IdentityClient {
  private readonly http: ServiceHttpClient;

  constructor(config: ConfigService<AppEnv, true>) {
    super();
    this.http = new ServiceHttpClient({
      name: 'identity-service',
      baseUrl: config.get('IDENTITY_SERVICE_URL', { infer: true }),
    });
  }

  findUser(userId: string, accessToken: string): Promise<IdentityUser | null> {
    return this.http.getOrNull<IdentityUser>(
      `/internal/users/${encodeURIComponent(userId)}`,
      { accessToken },
    );
  }
}
