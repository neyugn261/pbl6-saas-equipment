import { Injectable } from '@nestjs/common';
import { AccountToken, Prisma, User } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service';
import type { ListUsersDto } from './dto/list-users.dto';
import type { Page } from '@pbl6/service-kit';
import { toSkipTake, toPage } from '@pbl6/service-kit';
import type { UserSummary, UserProfile } from './users.types';

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
  ): Promise<Page<UserSummary>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const { skip, take } = toSkipTake({ page, pageSize });

    const where: Prisma.UserWhereInput = { tenantId };
    if (query.status) where.status = query.status;
    if (query.userType) where.userType = query.userType;
    if (query.q) {
      where.OR = [
        { fullName: { contains: query.q, mode: 'insensitive' } },
        { email: { contains: query.q, mode: 'insensitive' } },
      ];
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
  ): Promise<Page<import('./users.types').UserSnapshot>> {
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

    const items = users.map((u) => this.toSnapshot(u));
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

  async createUser(data: {
    tenantId: string | null;
    userType: string;
    email: string;
    fullName: string;
    phone?: string | null;
    status?: string;
  }): Promise<User> {
    return this.prisma.user.create({
      data: {
        tenantId: data.tenantId,
        userType: data.userType,
        email: data.email,
        fullName: data.fullName,
        phone: data.phone ?? null,
        status: data.status ?? 'INVITED',
        passwordHash: null,
      },
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

  async updateUserStatus(
    id: string,
    status: string,
  ): Promise<UserWithRoles | null> {
    await this.prisma.user.update({ where: { id }, data: { status } });
    return this.findUserById(id);
  }

  async setPasswordAndActivate(
    userId: string,
    passwordHash: string,
    tokenId: string,
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash, status: 'ACTIVE' },
      }),
      this.prisma.accountToken.update({
        where: { id: tokenId },
        data: { usedAt: new Date() },
      }),
    ]);
  }

  createActivationToken(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<AccountToken> {
    return this.prisma.accountToken.create({
      data: {
        userId,
        purpose: 'ACCOUNT_ACTIVATION',
        tokenHash,
        expiresAt,
      },
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
