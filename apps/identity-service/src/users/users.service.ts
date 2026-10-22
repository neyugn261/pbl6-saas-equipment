import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { ROLE_USER_TYPES, canAssignRole, dataScope } from '@pbl6/auth';
import type { Principal, RoleCode } from '@pbl6/auth';
import { AuthRepository } from '../auth/auth.repository';
import { PasswordService } from '../auth/password.service';
import { TokenService } from '../auth/token.service';
import type { LoginResult } from '../auth/auth.types';
import { UsersRepository } from './users.repository';
import type { InviteUserDto } from './dto/invite-user.dto';
import type { AssignRolesDto } from './dto/assign-roles.dto';
import type { UpdateStatusDto } from './dto/update-status.dto';
import type { ActivateAccountDto } from './dto/activate-account.dto';
import type { ListUsersDto } from './dto/list-users.dto';
import type { Page } from '@pbl6/service-kit';
import type { UserProfile, UserSummary } from './users.types';
import type { UserWithRoles } from './users.repository';

const ACTIVATION_TOKEN_TTL_HOURS = 72;

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly usersRepo: UsersRepository,
    private readonly authRepo: AuthRepository,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
  ) {}

  /** List users in the caller's tenant. */
  async listUsers(
    principal: Principal,
    query: ListUsersDto,
  ): Promise<Page<UserSummary>> {
    const scope = dataScope(principal);
    return this.usersRepo.findUsers(scope.tenantId, query, scope.customerId);
  }

  /** Get a single user by id. 404 if not in the caller's tenant. */
  async getUser(principal: Principal, userId: string): Promise<UserProfile> {
    const scope = dataScope(principal);
    const user = await this.usersRepo.findUserById(userId);
    this.assertInScope(user, scope);
    return this.usersRepo.toProfile(user);
  }

  /**
   * Invite a new user: create an INVITED account and return the raw activation
   * token so the caller (or a notification job) can send it via email.
   */
  async inviteUser(
    principal: Principal,
    dto: InviteUserDto,
  ): Promise<{ user: UserProfile; activationToken: string }> {
    const scope = dataScope(principal);
    const tenantId = scope.tenantId;

    if (dto.userType === 'PLATFORM_STAFF') {
      throw new ForbiddenException({
        code: 'USER_TYPE_NOT_ALLOWED',
        message: 'Tenant accounts cannot invite platform staff',
      });
    }
    if (
      scope.customerId !== null &&
      (dto.userType !== 'CUSTOMER' ||
        dto.roles?.length !== 1 ||
        dto.roles[0] !== 'CUSTOMER_USER')
    ) {
      throw new ForbiddenException({
        code: 'USER_TYPE_NOT_ALLOWED',
        message: 'Customer Admin may invite Customer Users only',
      });
    }
    this.validateRoleAssignment(principal, dto.roles ?? [], dto.userType);

    // Check email uniqueness in the tenant
    const existing = await this.usersRepo.findUserByEmail(tenantId, dto.email);
    if (existing) {
      throw new ConflictException({
        code: 'EMAIL_ALREADY_EXISTS',
        message: 'A user with this email already exists in the tenant',
      });
    }

    // Create the account, roles and token together so a failed invitation
    // never leaves an unactivatable account behind.
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(
      Date.now() + ACTIVATION_TOKEN_TTL_HOURS * 60 * 60 * 1000,
    );
    const created = await this.usersRepo.createInvitation({
      tenantId,
      userType: dto.userType,
      email: dto.email,
      fullName: dto.fullName,
      phone: dto.phone ?? null,
      roleCodes: dto.roles ?? [],
      assignedBy: principal.userId,
      tokenHash,
      expiresAt,
    });

    // Re-read with roles
    const userWithRoles = await this.usersRepo.findUserById(created.id);
    if (!userWithRoles) {
      throw new Error('User not found after creation');
    }

    this.logger.log(`Invited user ${created.id} in tenant ${tenantId}`);
    return {
      user: this.usersRepo.toProfile(userWithRoles),
      activationToken: rawToken,
    };
  }

  /**
   * Activate an INVITED account: validate the token, set the password, return
   * session tokens so the user is immediately logged in.
   */
  async activateAccount(
    dto: ActivateAccountDto,
    client: import('../auth/auth.types').ClientContext,
  ): Promise<LoginResult> {
    const tokenHash = createHash('sha256').update(dto.token).digest('hex');
    const record = await this.usersRepo.findActivationToken(tokenHash);

    if (
      !record ||
      record.purpose !== 'ACCOUNT_ACTIVATION' ||
      record.usedAt !== null ||
      record.expiresAt.getTime() <= Date.now()
    ) {
      throw new UnprocessableEntityException({
        code: 'INVALID_ACTIVATION_TOKEN',
        message: 'Activation token is invalid or has expired',
      });
    }

    const { user } = record;
    if (user.status !== 'INVITED') {
      throw new UnprocessableEntityException({
        code: 'ACCOUNT_ALREADY_ACTIVE',
        message: 'Account has already been activated',
      });
    }

    const passwordHash = await this.passwords.hash(dto.password);
    const activated = await this.usersRepo.setPasswordAndActivate(
      user.id,
      passwordHash,
      record.id,
    );
    if (!activated) {
      throw new UnprocessableEntityException({
        code: 'INVALID_ACTIVATION_TOKEN',
        message: 'Activation token is invalid or has expired',
      });
    }
    const activatedUser = await this.usersRepo.findUserById(user.id);
    if (!activatedUser) throw new Error('User not found after activation');

    // Create a login session immediately
    const { token, hash } = this.tokens.generateRefreshToken();
    const session = await this.authRepo.createLoginSession({
      userId: user.id,
      refreshTokenHash: hash,
      expiresAt: this.tokens.refreshTokenExpiry(),
      ipAddress: client.ipAddress,
      userAgent: client.userAgent,
    });

    const accessToken = await this.tokens.signAccessToken({
      sub: user.id,
      sid: session.id,
      tenant_id: activatedUser.tenantId,
      user_type:
        activatedUser.userType as import('../auth/auth.types').UserType,
      roles: activatedUser.roles.map((r) => r.role.code as RoleCode),
      customer_id:
        activatedUser.userType === 'CUSTOMER' &&
        activatedUser.customerLink?.status === 'ACTIVE'
          ? activatedUser.customerLink.customerId
          : null,
    });

    this.logger.log(`Account activated for user ${user.id}`);
    return {
      tokenType: 'Bearer',
      accessToken,
      expiresIn: this.tokens.accessTokenTtlSeconds,
      refreshToken: token,
      refreshTokenExpiresAt: session.expiresAt,
      user: this.usersRepo.toProfile(activatedUser),
    };
  }

  /** Assign (replace) roles for a user in the caller's tenant. */
  async assignRoles(
    principal: Principal,
    userId: string,
    dto: AssignRolesDto,
  ): Promise<UserProfile> {
    const scope = dataScope(principal);
    const user = await this.usersRepo.findUserById(userId);
    this.assertInScope(user, scope);

    this.assertMayChangeExistingRoles(principal, user);
    this.validateRoleAssignment(principal, dto.roles, user.userType);

    await this.usersRepo.setRoles(userId, dto.roles, principal.userId);

    const updated = await this.usersRepo.findUserById(userId);
    return this.usersRepo.toProfile(updated!);
  }

  /** Update status of a user (ACTIVE ↔ SUSPENDED). */
  async updateStatus(
    principal: Principal,
    userId: string,
    dto: UpdateStatusDto,
  ): Promise<UserProfile> {
    const scope = dataScope(principal);
    const user = await this.usersRepo.findUserById(userId);
    this.assertInScope(user, scope);
    if (scope.customerId !== null) {
      this.assertMayChangeExistingRoles(principal, user);
    }

    const allowedTransitions: Record<string, string[]> = {
      ACTIVE: ['SUSPENDED'],
      SUSPENDED: ['ACTIVE'],
    };
    if (!allowedTransitions[user.status]?.includes(dto.status)) {
      throw new BadRequestException({
        code: 'INVALID_STATUS_TRANSITION',
        message: `Cannot transition from ${user.status} to ${dto.status}`,
      });
    }

    if (dto.status === 'SUSPENDED') {
      await this.authRepo.revokeAllSessions(userId);
    }

    const updated = await this.usersRepo.updateUserStatus(userId, dto.status);
    return this.usersRepo.toProfile(updated!);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private validateRoleAssignment(
    principal: Principal,
    roles: RoleCode[],
    userType: string,
  ): void {
    for (const role of roles) {
      if (!canAssignRole(principal.roles, role)) {
        throw new ForbiddenException({
          code: 'ROLE_NOT_ALLOWED',
          message: `Cannot assign ${role} role`,
        });
      }
      if (ROLE_USER_TYPES[role] !== userType) {
        throw new BadRequestException({
          code: 'ROLE_USER_TYPE_MISMATCH',
          message: `Role ${role} is not valid for userType ${userType}`,
        });
      }
    }
  }

  private assertMayChangeExistingRoles(
    principal: Principal,
    user: UserWithRoles,
  ): void {
    for (const entry of user.roles) {
      if (!canAssignRole(principal.roles, entry.role.code)) {
        throw new ForbiddenException({
          code: 'ROLE_NOT_ALLOWED',
          message: `Cannot remove ${entry.role.code} role`,
        });
      }
    }
  }

  private assertInScope(
    user: UserWithRoles | null,
    scope: { tenantId: string; customerId: string | null },
  ): asserts user is UserWithRoles {
    if (
      !user ||
      user.tenantId !== scope.tenantId ||
      (scope.customerId !== null &&
        (user.userType !== 'CUSTOMER' ||
          user.customerLink?.status !== 'ACTIVE' ||
          user.customerLink.customerId !== scope.customerId))
    ) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'User not found',
      });
    }
  }
}
