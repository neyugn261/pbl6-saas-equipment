import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import type { AccountToken, User } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service';
import type { ListUsersDto } from './dto/list-users.dto';
import type { Page } from '@pbl6/service-kit';
import { toSkipTake, toPage } from '@pbl6/service-kit';
import type {
  InternalUserListItem,
  UserSummary,
  UserProfile,
} from './users.types';

const userWithRoles = {
  include: {
    roles: { include: { role: { select: { code: true } } } },
    customerLink: { select: { customerId: true, status: true } },
  },
} satisfies Prisma.UserDefaultArgs;

export type UserWithRoles = Prisma.UserGetPayload<typeof userWithRoles>;

function toRoleCodes(user: UserWithRoles): string[] {
  return user.roles.map((r) => r.role.code);
}

function toCustomerId(user: UserWithRoles): string | null {
  return user.userType === 'CUSTOMER' && user.customerLink?.status === 'ACTIVE'
    ? user.customerLink.customerId
    : null;
}

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findUsers(
    tenantId: string,
    query: ListUsersDto,
    customerId: string | null,
    invitedByUserId: string | null,
  ): Promise<Page<UserSummary>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const { skip, take } = toSkipTake({ page, pageSize });

    if (
      customerId !== null &&
      query.userType &&
      query.userType !== 'CUSTOMER'
    ) {
      return toPage([], 0, { page, pageSize });
    }

    const where: Prisma.UserWhereInput = { tenantId };
    if (customerId !== null) {
      where.userType = 'CUSTOMER';
      where.AND = [
        {
          roles: {
            some: { role: { code: 'CUSTOMER_USER' } },
            every: { role: { code: 'CUSTOMER_USER' } },
          },
        },
        {
          OR: [
            { customerLink: { is: { customerId, status: 'ACTIVE' } } },
            ...(invitedByUserId
              ? [
                  {
                    customerLink: { is: null },
                    roles: {
                      some: {
                        assignedBy: invitedByUserId,
                        role: { code: 'CUSTOMER_USER' },
                      },
                      every: { role: { code: 'CUSTOMER_USER' } },
                    },
                  },
                ]
              : []),
          ],
        },
      ];
    }
    if (query.status) where.status = query.status;
    if (query.userType) where.userType = query.userType;
    if (query.q) {
      const search = {
        OR: [
          { fullName: { contains: query.q, mode: 'insensitive' as const } },
          { email: { contains: query.q, mode: 'insensitive' as const } },
        ],
      };
      where.AND = [...(Array.isArray(where.AND) ? where.AND : []), search];
    }
    if (query.role) {
      where.roles = {
        some: { role: { code: query.role } },
      };
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        ...userWithRoles,
      }),
      this.prisma.user.count({ where }),
    ]);

    const items: UserSummary[] = users.map((u) => ({
      id: u.id,
      userType: u.userType as UserSummary['userType'],
      email: u.email,
      fullName: u.fullName,
      phone: u.phone,
      status: u.status as UserSummary['status'],
      roles: toRoleCodes(u),
      createdAt: u.createdAt,
    }));

    return toPage(items, total, { page, pageSize });
  }

  async findInternalUsers(
    tenantId: string,
    query: {
      page?: number;
      pageSize?: number;
      status?: string;
      role?: string;
      userType?: string;
    },
  ): Promise<Page<InternalUserListItem>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const { skip, take } = toSkipTake({ page, pageSize });

    const where: Prisma.UserWhereInput = { tenantId };
    if (query.status) where.status = query.status;
    if (query.userType) where.userType = query.userType;
    if (query.role) {
      where.roles = {
        some: { role: { code: query.role } },
      };
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        ...userWithRoles,
      }),
      this.prisma.user.count({ where }),
    ]);

    const items: InternalUserListItem[] = users.map((u) => ({
      id: u.id,
      email: u.email,
      fullName: u.fullName,
      roles: toRoleCodes(u),
    }));
    return toPage(items, total, { page, pageSize });
  }

  async findUserById(id: string): Promise<UserWithRoles | null> {
    return this.prisma.user.findUnique({ where: { id }, ...userWithRoles });
  }

  /**
   * Case-insensitive lookup matching the partial index uq_users_tenant_email.
   */
  async findUserByEmail(
    tenantId: string,
    email: string,
  ): Promise<UserWithRoles | null> {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM users
      WHERE tenant_id = ${tenantId}::uuid AND lower(email) = lower(${email})`;
    if (rows.length === 0) return null;
    return this.findUserById(rows[0].id);
  }

  async createInvitation(data: {
    tenantId: string | null;
    userType: string;
    email: string;
    fullName: string;
    phone?: string | null;
    roleCodes: string[];
    assignedBy: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<User> {
    return this.prisma.$transaction(async (tx) => {
      const roles = await tx.role.findMany({
        where: { code: { in: data.roleCodes } },
        select: { id: true },
      });
      if (roles.length !== new Set(data.roleCodes).size) {
        throw new Error('Role catalog is missing an assignable role');
      }

      const user = await tx.user.create({
        data: {
          tenantId: data.tenantId,
          userType: data.userType,
          email: data.email,
          fullName: data.fullName,
          phone: data.phone ?? null,
          status: 'INVITED',
          passwordHash: null,
        },
      });
      for (const role of roles) {
        await tx.userRole.create({
          data: {
            userId: user.id,
            roleId: role.id,
            assignedBy: data.assignedBy,
          },
        });
      }
      await tx.accountToken.create({
        data: {
          userId: user.id,
          purpose: 'ACCOUNT_ACTIVATION',
          tokenHash: data.tokenHash,
          expiresAt: data.expiresAt,
        },
      });
      return user;
    });
  }

  /** Serializes platform invitations per tenant and rotates an unused token. */
  async createOrRenewTenantAdminInvitation(data: {
    tenantId: string;
    email: string;
    fullName: string;
    phone: string | null;
    assignedBy: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<string | null> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT tenant_id FROM tenant_directory
        WHERE tenant_id = ${data.tenantId}::uuid FOR UPDATE`;
      const matches = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM users WHERE tenant_id = ${data.tenantId}::uuid
        AND lower(email) = lower(${data.email})`;
      const existing = matches.length
        ? await tx.user.findUnique({
            where: { id: matches[0].id },
            ...userWithRoles,
          })
        : null;
      if (existing) {
        if (
          existing.status !== 'INVITED' ||
          existing.userType !== 'TENANT_STAFF' ||
          existing.roles.length !== 1 ||
          existing.roles[0].role.code !== 'TENANT_ADMIN'
        )
          return null;
        await tx.accountToken.updateMany({
          where: {
            userId: existing.id,
            purpose: 'ACCOUNT_ACTIVATION',
            usedAt: null,
          },
          data: { usedAt: new Date() },
        });
        await tx.accountToken.create({
          data: {
            userId: existing.id,
            purpose: 'ACCOUNT_ACTIVATION',
            tokenHash: data.tokenHash,
            expiresAt: data.expiresAt,
          },
        });
        return existing.id;
      }
      const role = await tx.role.findUniqueOrThrow({
        where: { code: 'TENANT_ADMIN' },
      });
      const user = await tx.user.create({
        data: {
          tenantId: data.tenantId,
          userType: 'TENANT_STAFF',
          email: data.email,
          fullName: data.fullName,
          phone: data.phone,
          status: 'INVITED',
          passwordHash: null,
        },
      });
      await tx.userRole.create({
        data: { userId: user.id, roleId: role.id, assignedBy: data.assignedBy },
      });
      await tx.accountToken.create({
        data: {
          userId: user.id,
          purpose: 'ACCOUNT_ACTIVATION',
          tokenHash: data.tokenHash,
          expiresAt: data.expiresAt,
        },
      });
      return user.id;
    });
  }

  /** Replaces the user's roles atomically; assignedBy is the caller's userId. */
  async setRoles(
    userId: string,
    roleCodes: string[],
    assignedBy: string,
  ): Promise<void> {
    // Resolve role ids
    const roles = await this.prisma.role.findMany({
      where: { code: { in: roleCodes } },
      select: { id: true, code: true },
    });

    await this.prisma.$transaction([
      this.prisma.userRole.deleteMany({ where: { userId } }),
      ...roles.map((role) =>
        this.prisma.userRole.create({
          data: { userId, roleId: role.id, assignedBy },
        }),
      ),
    ]);
  }

  /** Platform role changes share the same tenant lock as admin suspensions. */
  async setTenantAdminRole(
    userId: string,
    tenantId: string,
    roleCodes: string[],
    assignedBy: string,
  ): Promise<'updated' | 'last-admin' | 'stale'> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT tenant_id FROM tenant_directory
        WHERE tenant_id = ${tenantId}::uuid FOR UPDATE`;
      await tx.$queryRaw`
        SELECT u.id FROM users u
        JOIN user_roles ur ON ur.user_id = u.id
        JOIN roles r ON r.id = ur.role_id
        WHERE u.tenant_id = ${tenantId}::uuid AND r.code = 'TENANT_ADMIN'
        ORDER BY u.id FOR UPDATE OF u`;
      const user = await tx.user.findUnique({
        where: { id: userId },
        ...userWithRoles,
      });
      if (
        !user ||
        user.tenantId !== tenantId ||
        user.userType !== 'TENANT_STAFF'
      ) {
        return 'stale';
      }
      const currentRoles = toRoleCodes(user);
      if (currentRoles.some((code) => code !== 'TENANT_ADMIN')) return 'stale';
      if (
        currentRoles.includes('TENANT_ADMIN') &&
        !roleCodes.includes('TENANT_ADMIN') &&
        user.status === 'ACTIVE'
      ) {
        const activeAdmins = await tx.user.count({
          where: {
            tenantId,
            status: 'ACTIVE',
            roles: { some: { role: { code: 'TENANT_ADMIN' } } },
          },
        });
        if (activeAdmins <= 1) return 'last-admin';
      }
      await tx.userRole.deleteMany({ where: { userId } });
      if (roleCodes.includes('TENANT_ADMIN')) {
        const role = await tx.role.findUniqueOrThrow({
          where: { code: 'TENANT_ADMIN' },
        });
        await tx.userRole.create({
          data: { userId, roleId: role.id, assignedBy },
        });
      }
      await tx.authSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return 'updated';
    });
  }

  /** Status change and session revocation share one transaction. */
  async changeUserStatus(
    id: string,
    tenantId: string,
    currentStatus: string,
    nextStatus: string,
    protectLastTenantAdmin = false,
  ): Promise<'updated' | 'last-admin' | 'stale'> {
    return this.prisma.$transaction(async (tx) => {
      if (protectLastTenantAdmin && nextStatus === 'SUSPENDED') {
        // Serialize platform admin changes within a tenant. Counting without
        // this lock would let two concurrent requests suspend both admins.
        await tx.$queryRaw`
          SELECT tenant_id FROM tenant_directory
          WHERE tenant_id = ${tenantId}::uuid FOR UPDATE`;
        await tx.$queryRaw`
          SELECT u.id FROM users u
          JOIN user_roles ur ON ur.user_id = u.id
          JOIN roles r ON r.id = ur.role_id
          WHERE u.tenant_id = ${tenantId}::uuid AND r.code = 'TENANT_ADMIN'
          ORDER BY u.id FOR UPDATE OF u`;
        const activeAdmins = await tx.user.count({
          where: {
            tenantId,
            status: 'ACTIVE',
            roles: { some: { role: { code: 'TENANT_ADMIN' } } },
          },
        });
        if (activeAdmins <= 1) return 'last-admin';
      }

      const changed = await tx.user.updateMany({
        where: { id, tenantId, status: currentStatus },
        data: { status: nextStatus },
      });
      if (changed.count !== 1) return 'stale';
      if (nextStatus === 'SUSPENDED') {
        await tx.authSession.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      return 'updated';
    });
  }

  async setPasswordAndActivate(
    userId: string,
    passwordHash: string,
    tokenId: string,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const claimed = await tx.accountToken.updateMany({
        where: { id: tokenId, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (claimed.count !== 1) return false;

      const activated = await tx.user.updateMany({
        where: { id: userId, status: 'INVITED' },
        data: { passwordHash, status: 'ACTIVE' },
      });
      if (activated.count !== 1) {
        throw new Error('Invited user state changed during activation');
      }
      return true;
    });
  }

  findActivationToken(
    tokenHash: string,
  ): Promise<(AccountToken & { user: UserWithRoles }) | null> {
    return this.prisma.accountToken.findUnique({
      where: { tokenHash },
      include: { user: userWithRoles },
    }) as Promise<(AccountToken & { user: UserWithRoles }) | null>;
  }

  toProfile(user: UserWithRoles): UserProfile {
    return {
      id: user.id,
      tenantId: user.tenantId,
      userType: user.userType as UserProfile['userType'],
      email: user.email,
      fullName: user.fullName,
      phone: user.phone,
      status: user.status as UserProfile['status'],
      roles: toRoleCodes(user),
      customerId: toCustomerId(user),
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
    };
  }

  toSnapshot(user: UserWithRoles): import('./users.types').UserSnapshot {
    return {
      id: user.id,
      tenantId: user.tenantId,
      userType: user.userType as UserProfile['userType'],
      status: user.status as UserProfile['status'],
      roles: toRoleCodes(user),
      email: user.email,
      fullName: user.fullName,
    };
  }
}
