import { Injectable } from '@nestjs/common';
import {
  AuthSession,
  Prisma,
  TenantDirectory,
} from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service';

const userWithRoles = {
  include: { roles: { include: { role: { select: { code: true } } } } },
} satisfies Prisma.UserDefaultArgs;

export type UserWithRoles = Prisma.UserGetPayload<typeof userWithRoles>;
export type SessionWithUser = AuthSession & { user: UserWithRoles };

export interface NewSession {
  userId: string;
  refreshTokenHash: string;
  expiresAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
}

/** Thrown when a session was revoked concurrently between read and rotate. */
export class SessionAlreadyRevokedError extends Error {}

/** Data access for login, sessions and the tenant read model (identity_db only). */
@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  findTenantByCode(code: string): Promise<TenantDirectory | null> {
    return this.prisma.tenantDirectory.findUnique({ where: { code } });
  }

  findTenantById(tenantId: string): Promise<TenantDirectory | null> {
    return this.prisma.tenantDirectory.findUnique({ where: { tenantId } });
  }

  /**
   * Finds the account for an email inside one login scope: a tenant, or the
   * platform scope when tenantId is null. Raw SQL so the lookup matches the
   * case-insensitive unique indexes uq_users_tenant_email / uq_users_platform_email.
   */
  async findLoginCandidate(
    tenantId: string | null,
    email: string,
  ): Promise<UserWithRoles | null> {
    const rows =
      tenantId === null
        ? await this.prisma.$queryRaw<{ id: string }[]>`
            SELECT id FROM users
            WHERE tenant_id IS NULL AND lower(email) = lower(${email})`
        : await this.prisma.$queryRaw<{ id: string }[]>`
            SELECT id FROM users
            WHERE tenant_id = ${tenantId}::uuid AND lower(email) = lower(${email})`;
    if (rows.length === 0) {
      return null;
    }
    return this.findUserWithRoles(rows[0].id);
  }

  findUserWithRoles(id: string): Promise<UserWithRoles | null> {
    return this.prisma.user.findUnique({ where: { id }, ...userWithRoles });
  }

  /** Creates the session of a successful login and records the login time. */
  async createLoginSession(session: NewSession): Promise<AuthSession> {
    const [created] = await this.prisma.$transaction([
      this.prisma.authSession.create({ data: session }),
      this.prisma.user.update({
        where: { id: session.userId },
        data: { lastLoginAt: new Date() },
      }),
    ]);
    return created;
  }

  findSessionByHash(refreshTokenHash: string): Promise<SessionWithUser | null> {
    return this.prisma.authSession.findUnique({
      where: { refreshTokenHash },
      include: { user: userWithRoles },
    });
  }

  findSessionById(id: string): Promise<AuthSession | null> {
    return this.prisma.authSession.findUnique({ where: { id } });
  }

  /**
   * Revokes `currentId` and creates its replacement in one transaction. The
   * conditional update makes concurrent use of the same refresh token fail
   * for every caller except the first.
   */
  async rotateSession(
    currentId: string,
    replacement: NewSession,
  ): Promise<AuthSession> {
    return this.prisma.$transaction(async (tx) => {
      const revoked = await tx.authSession.updateMany({
        where: { id: currentId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (revoked.count !== 1) {
        throw new SessionAlreadyRevokedError();
      }
      return tx.authSession.create({ data: replacement });
    });
  }

  async revokeSession(id: string): Promise<void> {
    await this.prisma.authSession.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeSessionByHash(refreshTokenHash: string): Promise<void> {
    await this.prisma.authSession.updateMany({
      where: { refreshTokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllSessions(userId: string): Promise<void> {
    await this.prisma.authSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
