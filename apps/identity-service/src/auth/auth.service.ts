import {
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { TenantDirectory } from '../generated/prisma/client.js';
import {
  AuthRepository,
  SessionAlreadyRevokedError,
  SessionWithUser,
  UserWithRoles,
} from './auth.repository';
import {
  AuthenticatedUser,
  ClientContext,
  LoginResult,
  TokenPair,
  UserProfile,
  UserStatus,
  UserType,
} from './auth.types';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';

export const AuthErrorCode = {
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  ACCOUNT_NOT_ACTIVE: 'ACCOUNT_NOT_ACTIVE',
  TENANT_NOT_ACTIVE: 'TENANT_NOT_ACTIVE',
  INVALID_REFRESH_TOKEN: 'INVALID_REFRESH_TOKEN',
  REFRESH_TOKEN_EXPIRED: 'REFRESH_TOKEN_EXPIRED',
  REFRESH_TOKEN_REUSED: 'REFRESH_TOKEN_REUSED',
  INVALID_ACCESS_TOKEN: 'INVALID_ACCESS_TOKEN',
} as const;

function unauthorized(
  code: keyof typeof AuthErrorCode,
  message: string,
): UnauthorizedException {
  return new UnauthorizedException({ code, message });
}

export interface LoginInput {
  email: string;
  password: string;
  /** Selects the login scope. Absent = platform scope (Platform Admin). */
  tenantCode?: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly repository: AuthRepository,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
  ) {}

  /**
   * Tenant users log in with tenant code + email + password; Platform Admin
   * logs in without a tenant code (ADR 0001). The tenant code only selects
   * the scope; tenant_id in the token always comes from the stored account.
   */
  async login(input: LoginInput, client: ClientContext): Promise<LoginResult> {
    let tenant: TenantDirectory | null = null;
    let user: UserWithRoles | null = null;

    if (input.tenantCode === undefined) {
      user = await this.repository.findLoginCandidate(null, input.email);
    } else {
      tenant = await this.repository.findTenantByCode(input.tenantCode);
      if (tenant) {
        user = await this.repository.findLoginCandidate(
          tenant.tenantId,
          input.email,
        );
      }
    }

    // Always run the password check so unknown accounts are not faster to reject.
    const passwordOk = await this.passwords.verify(
      input.password,
      user?.passwordHash ?? null,
    );
    if (!user || !passwordOk) {
      throw unauthorized(
        'INVALID_CREDENTIALS',
        'Invalid tenant code, email or password',
      );
    }

    // Statuses are revealed only after the password has been proven.
    this.assertCanAuthenticate(user, tenant);

    const { token, hash } = this.tokens.generateRefreshToken();
    const session = await this.repository.createLoginSession({
      userId: user.id,
      refreshTokenHash: hash,
      expiresAt: this.tokens.refreshTokenExpiry(),
      ipAddress: client.ipAddress,
      userAgent: client.userAgent,
    });

    const pair = await this.issueTokens(
      user,
      session.id,
      token,
      session.expiresAt,
    );
    return { ...pair, user: this.toProfile(user) };
  }

  /**
   * Rotates a refresh token: the presented session is revoked and a new one
   * is created with the same absolute expiry. Presenting a revoked token is
   * treated as theft and revokes every active session of the account.
   */
  async refresh(
    refreshToken: string,
    client: ClientContext,
  ): Promise<TokenPair> {
    const session = await this.repository.findSessionByHash(
      this.tokens.hashRefreshToken(refreshToken),
    );
    if (!session) {
      throw unauthorized('INVALID_REFRESH_TOKEN', 'Refresh token is invalid');
    }
    if (session.revokedAt !== null) {
      await this.handleReuse(session);
    }
    if (session.expiresAt.getTime() <= Date.now()) {
      throw unauthorized('REFRESH_TOKEN_EXPIRED', 'Refresh token has expired');
    }

    const tenant = session.user.tenantId
      ? await this.repository.findTenantById(session.user.tenantId)
      : null;
    try {
      this.assertCanAuthenticate(session.user, tenant);
    } catch (error) {
      await this.repository.revokeSession(session.id);
      throw error;
    }

    const { token, hash } = this.tokens.generateRefreshToken();
    let replacement;
    try {
      replacement = await this.repository.rotateSession(session.id, {
        userId: session.userId,
        refreshTokenHash: hash,
        expiresAt: session.expiresAt,
        ipAddress: client.ipAddress,
        userAgent: client.userAgent,
      });
    } catch (error) {
      if (error instanceof SessionAlreadyRevokedError) {
        await this.handleReuse(session);
      }
      throw error;
    }

    return this.issueTokens(
      session.user,
      replacement.id,
      token,
      replacement.expiresAt,
    );
  }

  /** Revokes the session of a refresh token. Unknown tokens are ignored. */
  async logout(refreshToken: string): Promise<void> {
    await this.repository.revokeSessionByHash(
      this.tokens.hashRefreshToken(refreshToken),
    );
  }

  /**
   * Current account, re-read from the database. Fails once the session has
   * been revoked, even if the access token itself has not expired yet.
   */
  async me(principal: AuthenticatedUser): Promise<UserProfile> {
    const [session, user] = await Promise.all([
      this.repository.findSessionById(principal.sid),
      this.repository.findUserWithRoles(principal.sub),
    ]);
    const sessionActive =
      session !== null &&
      session.userId === principal.sub &&
      session.revokedAt === null &&
      session.expiresAt.getTime() > Date.now();
    const tenant = user?.tenantId
      ? await this.repository.findTenantById(user.tenantId)
      : null;
    const tenantActive = user?.tenantId === null || tenant?.status === 'ACTIVE';
    if (!sessionActive || !user || user.status !== 'ACTIVE' || !tenantActive) {
      throw unauthorized('INVALID_ACCESS_TOKEN', 'Session is no longer valid');
    }
    return this.toProfile(user);
  }

  private async handleReuse(session: SessionWithUser): Promise<never> {
    this.logger.warn(
      `Revoked refresh token presented again; revoking all sessions of user ${session.userId}`,
    );
    await this.repository.revokeAllSessions(session.userId);
    throw unauthorized(
      'REFRESH_TOKEN_REUSED',
      'Refresh token has already been used',
    );
  }

  /**
   * Only ACTIVE accounts may authenticate: INVITED accounts have not finished
   * setting a password, SUSPENDED/DISABLED accounts are blocked. Tenant
   * accounts additionally need an ACTIVE tenant in the local tenant directory.
   */
  private assertCanAuthenticate(
    user: UserWithRoles,
    tenant: TenantDirectory | null,
  ): void {
    if (user.status !== 'ACTIVE') {
      throw new ForbiddenException({
        code: AuthErrorCode.ACCOUNT_NOT_ACTIVE,
        message: 'Account is not active',
      });
    }
    if (user.tenantId !== null && tenant?.status !== 'ACTIVE') {
      throw new ForbiddenException({
        code: AuthErrorCode.TENANT_NOT_ACTIVE,
        message: 'Tenant is not active',
      });
    }
  }

  private async issueTokens(
    user: UserWithRoles,
    sessionId: string,
    refreshToken: string,
    refreshTokenExpiresAt: Date,
  ): Promise<TokenPair> {
    const accessToken = await this.tokens.signAccessToken({
      sub: user.id,
      sid: sessionId,
      tenant_id: user.tenantId,
      user_type: user.userType as UserType,
      roles: user.roles.map((assignment) => assignment.role.code),
    });
    return {
      tokenType: 'Bearer',
      accessToken,
      expiresIn: this.tokens.accessTokenTtlSeconds,
      refreshToken,
      refreshTokenExpiresAt,
    };
  }

  private toProfile(user: UserWithRoles): UserProfile {
    return {
      id: user.id,
      tenantId: user.tenantId,
      userType: user.userType as UserType,
      email: user.email,
      fullName: user.fullName,
      phone: user.phone,
      status: user.status as UserStatus,
      roles: user.roles.map((assignment) => assignment.role.code),
      lastLoginAt: user.lastLoginAt,
    };
  }
}
