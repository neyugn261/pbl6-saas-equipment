import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
import type { InviteTenantAdminDto } from './dto/invite-tenant-admin.dto';
import type { Page } from '@pbl6/service-kit';
import type { UserProfile, UserSummary } from './users.types';
import type { InviteUserResult } from './users.types';
import type { IdentityEnv } from '../config/env.validation';
import type { UserWithRoles } from './users.repository';
import { isCustomerAdminVisible } from './customer-admin-scope';

const ACTIVATION_TOKEN_TTL_HOURS = 24;

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly usersRepo: UsersRepository,
    private readonly authRepo: AuthRepository,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly config: ConfigService<IdentityEnv, true>,
  ) {}

  /** List users in the caller's tenant. */
  async listUsers(
    principal: Principal,
    query: ListUsersDto,
  ): Promise<Page<UserSummary>> {
    const scope = dataScope(principal);
    return this.usersRepo.findUsers(
      scope.tenantId,
      query,
      scope.customerId,
      scope.customerId === null ? null : principal.userId,
    );
  }

  /** Get a single user by id. 404 if not in the caller's tenant. */
  async getUser(principal: Principal, userId: string): Promise<UserProfile> {
    const user = await this.usersRepo.findUserById(userId);
    this.assertInScope(user, principal);
    return this.usersRepo.toProfile(user);
  }

  /**
   * Invite a new user: create an INVITED account and return the raw activation
   * token so the caller (or a notification job) can send it via email.
   */
  async inviteUser(
    principal: Principal,
    dto: InviteUserDto,
  ): Promise<InviteUserResult> {
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

    return this.createInvitation(principal.userId, tenantId, dto);
  }

  /** Only Platform Admin provisions a Tenant Admin for a known active tenant. */
  async inviteTenantAdmin(
    principal: Principal,
    tenantId: string,
    dto: InviteTenantAdminDto,
  ): Promise<InviteUserResult> {
    this.assertPlatformAdmin(principal);
    const tenant = await this.authRepo.findTenantById(tenantId);
    if (!tenant) {
      throw new NotFoundException({
        code: 'TENANT_NOT_FOUND',
        message: 'Tenant not found',
      });
    }
    if (tenant.status !== 'ACTIVE') {
      throw new ConflictException({
        code: 'TENANT_NOT_ACTIVE',
        message: 'Tenant must be active before inviting an admin',
      });
    }
    this.validateRoleAssignment(principal, ['TENANT_ADMIN'], 'TENANT_STAFF');
    const rawToken = randomBytes(32).toString('hex');
    const userId = await this.usersRepo.createOrRenewTenantAdminInvitation({
      tenantId,
      email: dto.email,
      fullName: dto.fullName,
      phone: dto.phone ?? null,
      assignedBy: principal.userId,
      tokenHash: this.hashToken(rawToken),
      expiresAt: this.activationExpiry(),
    });
    if (!userId) {
      throw new ConflictException({
        code: 'EMAIL_ALREADY_EXISTS',
        message: 'This email belongs to another account in the tenant',
      });
    }
    const user = await this.usersRepo.findUserById(userId);
    if (!user) throw new Error('Tenant Admin not found after invitation');
    this.logger.log(`Invited Tenant Admin ${userId} in tenant ${tenantId}`);
    return this.inviteResult(this.usersRepo.toProfile(user), rawToken);
  }

  private async createInvitation(
    inviterId: string,
    tenantId: string,
    dto: Pick<
      InviteUserDto,
      'email' | 'fullName' | 'phone' | 'userType' | 'roles'
    >,
  ): Promise<InviteUserResult> {
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
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = this.activationExpiry();
    const created = await this.usersRepo.createInvitation({
      tenantId,
      userType: dto.userType,
      email: dto.email,
      fullName: dto.fullName,
      phone: dto.phone ?? null,
      roleCodes: dto.roles ?? [],
      assignedBy: inviterId,
      tokenHash,
      expiresAt,
    });

    // Re-read with roles
    const userWithRoles = await this.usersRepo.findUserById(created.id);
    if (!userWithRoles) {
      throw new Error('User not found after creation');
    }

    this.logger.log(`Invited user ${created.id} in tenant ${tenantId}`);
    return this.inviteResult(this.usersRepo.toProfile(userWithRoles), rawToken);
  }

  private inviteResult(user: UserProfile, token: string): InviteUserResult {
    return this.config.get('IDENTITY_EXPOSE_ACTIVATION_TOKEN', { infer: true })
      ? { user, activationToken: token }
      : { user };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private activationExpiry(): Date {
    return new Date(Date.now() + ACTIVATION_TOKEN_TTL_HOURS * 60 * 60 * 1000);
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
    const user = await this.usersRepo.findUserById(userId);
    this.assertInScope(user, principal);

    if (principal.userId === userId) {
      throw new ForbiddenException({
        code: 'SELF_MANAGEMENT_NOT_ALLOWED',
        message: 'You cannot change your own roles',
      });
    }

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
    this.assertInScope(user, principal);
    if (principal.userId === userId) {
      throw new ForbiddenException({
        code: 'SELF_MANAGEMENT_NOT_ALLOWED',
        message: 'You cannot change your own status',
      });
    }
    if (user.roles.some((entry) => entry.role.code === 'TENANT_ADMIN')) {
      throw new ForbiddenException({
        code: 'PROTECTED_TENANT_ADMIN',
        message: 'Only Platform Admin may change a Tenant Admin status',
      });
    }
    if (scope.customerId !== null) {
      this.assertMayChangeExistingRoles(principal, user);
    }

    this.assertStatusTransition(user.status, dto.status);
    const outcome = await this.usersRepo.changeUserStatus(
      userId,
      scope.tenantId,
      user.status,
      dto.status,
    );
    if (outcome === 'stale') {
      throw new ConflictException({
        code: 'STATUS_CHANGED',
        message: 'User status changed during the request',
      });
    }
    const updated = await this.usersRepo.findUserById(userId);
    return this.usersRepo.toProfile(updated!);
  }

  /** Platform Admin alone may change Tenant Admin status. */
  async updateTenantAdminStatus(
    principal: Principal,
    tenantId: string,
    userId: string,
    dto: UpdateStatusDto,
  ): Promise<UserProfile> {
    this.assertPlatformAdmin(principal);
    const user = await this.usersRepo.findUserById(userId);
    if (
      !user ||
      user.tenantId !== tenantId ||
      !user.roles.some((entry) => entry.role.code === 'TENANT_ADMIN')
    ) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'User not found',
      });
    }
    this.assertStatusTransition(user.status, dto.status);
    const outcome = await this.usersRepo.changeUserStatus(
      userId,
      tenantId,
      user.status,
      dto.status,
      true,
    );
    if (outcome === 'last-admin') {
      throw new ConflictException({
        code: 'LAST_ACTIVE_TENANT_ADMIN',
        message: 'Cannot suspend the last active Tenant Admin',
      });
    }
    if (outcome === 'stale') {
      throw new ConflictException({
        code: 'STATUS_CHANGED',
        message: 'User status changed during the request',
      });
    }
    const updated = await this.usersRepo.findUserById(userId);
    return this.usersRepo.toProfile(updated!);
  }

  /** Platform Admin may add or remove the fixed Tenant Admin role. */
  async updateTenantAdminRoles(
    principal: Principal,
    tenantId: string,
    userId: string,
    dto: AssignRolesDto,
  ): Promise<UserProfile> {
    this.assertPlatformAdmin(principal);
    if (
      dto.roles.length > 1 ||
      dto.roles.some((role) => role !== 'TENANT_ADMIN')
    ) {
      throw new BadRequestException({
        code: 'INVALID_TENANT_ADMIN_ROLES',
        message: 'Only the TENANT_ADMIN role may be changed on this route',
      });
    }
    const user = await this.usersRepo.findUserById(userId);
    if (
      !user ||
      user.tenantId !== tenantId ||
      user.userType !== 'TENANT_STAFF'
    ) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'User not found',
      });
    }
    const outcome = await this.usersRepo.setTenantAdminRole(
      userId,
      tenantId,
      dto.roles,
      principal.userId,
    );
    if (outcome === 'last-admin') {
      throw new ConflictException({
        code: 'LAST_ACTIVE_TENANT_ADMIN',
        message: 'Cannot remove the last active Tenant Admin',
      });
    }
    if (outcome === 'stale') {
      throw new ConflictException({
        code: 'ROLES_CHANGED',
        message: 'User roles changed during the request',
      });
    }
    const updated = await this.usersRepo.findUserById(userId);
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

  private assertStatusTransition(current: string, next: string): void {
    if (
      (current !== 'ACTIVE' || next !== 'SUSPENDED') &&
      (current !== 'SUSPENDED' || next !== 'ACTIVE')
    ) {
      throw new BadRequestException({
        code: 'INVALID_STATUS_TRANSITION',
        message: `Cannot transition from ${current} to ${next}`,
      });
    }
  }

  private assertPlatformAdmin(principal: Principal): void {
    if (
      principal.userType !== 'PLATFORM_STAFF' ||
      !principal.roles.includes('PLATFORM_ADMIN')
    ) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Platform Admin permission is required',
      });
    }
  }

  private assertInScope(
    user: UserWithRoles | null,
    principal: Principal,
  ): asserts user is UserWithRoles {
    const scope = dataScope(principal);
    if (
      !user ||
      user.tenantId !== scope.tenantId ||
      (scope.customerId !== null && !isCustomerAdminVisible(user, principal))
    ) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'User not found',
      });
    }
  }
}
