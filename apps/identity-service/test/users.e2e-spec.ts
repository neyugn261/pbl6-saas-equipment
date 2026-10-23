import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import type { App } from 'supertest/types';
import { signTestAccessToken } from '@pbl6/testing';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  createTenant,
  createTestApp,
  createUser,
  resetDatabase,
} from './support/test-app';

const PASSWORD = 'Correct#Pass1';
const CUSTOMER_A = '00000000-0000-4000-8000-000000000101';
const CUSTOMER_OTHER = '00000000-0000-4000-8000-000000000102';

describe('Identity Users & Internal API (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let tenantA: string;
  let tenantB: string;

  let tenantAdminTokenA: string;
  let tenantAdminTokenB: string;
  let customerAdminTokenA: string;
  let techTokenA: string;
  let platformAdminToken: string;
  let adminUserIdA: string;

  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    tenantA = await createTenant(prisma, 'TENANT-A');
    tenantB = await createTenant(prisma, 'TENANT-B');

    const adminUserA = await createUser(prisma, {
      tenantId: tenantA,
      userType: 'TENANT_STAFF',
      email: 'admin@tenant-a.com',
      password: PASSWORD,
      roles: ['TENANT_ADMIN'],
    });
    adminUserIdA = adminUserA;

    const adminUserB = await createUser(prisma, {
      tenantId: tenantB,
      userType: 'TENANT_STAFF',
      email: 'admin@tenant-b.com',
      password: PASSWORD,
      roles: ['TENANT_ADMIN'],
    });

    const customerAdminId = await createUser(prisma, {
      tenantId: tenantA,
      userType: 'CUSTOMER',
      email: 'customer.admin@tenant-a.com',
      password: PASSWORD,
      roles: ['CUSTOMER_ADMIN'],
    });
    await prisma.userCustomerLink.create({
      data: {
        userId: customerAdminId,
        tenantId: tenantA,
        customerId: CUSTOMER_A,
        membershipId: '00000000-0000-4000-8000-000000000201',
        status: 'ACTIVE',
        sourceChangedAt: new Date(),
      },
    });

    tenantAdminTokenA = signTestAccessToken({
      role: 'TENANT_ADMIN',
      tenantId: tenantA,
      userId: adminUserA,
    });

    tenantAdminTokenB = signTestAccessToken({
      role: 'TENANT_ADMIN',
      tenantId: tenantB,
      userId: adminUserB,
    });

    customerAdminTokenA = signTestAccessToken({
      role: 'CUSTOMER_ADMIN',
      tenantId: tenantA,
      customerId: CUSTOMER_A,
      userId: customerAdminId,
    });

    techTokenA = signTestAccessToken({
      role: 'TECHNICIAN',
      tenantId: tenantA,
    });
    const platformAdminId = await createUser(prisma, {
      tenantId: null,
      userType: 'PLATFORM_STAFF',
      email: 'platform.admin@pbl6.local',
      password: PASSWORD,
      roles: ['PLATFORM_ADMIN'],
    });
    platformAdminToken = signTestAccessToken({
      role: 'PLATFORM_ADMIN',
      userId: platformAdminId,
    });
  });

  describe('Platform tenant provisioning', () => {
    it('prevents a Tenant Admin from changing their own roles', async () => {
      await http()
        .patch(`/users/${adminUserIdA}/roles`)
        .set('Authorization', `Bearer ${tenantAdminTokenA}`)
        .send({ roles: [] })
        .expect(403);
    });

    it('invites a Tenant Admin and activates the account', async () => {
      const invited = await http()
        .post(`/platform/tenants/${tenantA}/admins`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({ email: 'new.admin@tenant-a.com', fullName: 'New Admin' })
        .expect(201);
      expect(invited.body.user).toMatchObject({
        tenantId: tenantA,
        userType: 'TENANT_STAFF',
        status: 'INVITED',
        roles: ['TENANT_ADMIN'],
      });
      await http()
        .post('/users/activate')
        .send({ token: invited.body.activationToken, password: PASSWORD })
        .expect(200);
      const login = await http()
        .post('/auth/login')
        .send({
          tenantCode: 'TENANT-A',
          email: 'new.admin@tenant-a.com',
          password: PASSWORD,
        })
        .expect(200);
      expect(login.body.user.roles).toContain('TENANT_ADMIN');
    });

    it('reinvites an INVITED Tenant Admin with the same account and rotates its token', async () => {
      const path = `/platform/tenants/${tenantA}/admins`;
      const body = {
        email: 'repeat.admin@tenant-a.com',
        fullName: 'Repeat Admin',
      };
      const first = await http()
        .post(path)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send(body)
        .expect(201);
      const second = await http()
        .post(path)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send(body)
        .expect(201);
      expect(second.body.user.id).toBe(first.body.user.id);
      expect(second.body.activationToken).not.toBe(first.body.activationToken);
      await http()
        .post('/users/activate')
        .send({ token: first.body.activationToken, password: PASSWORD })
        .expect(422);
      await http()
        .post('/users/activate')
        .send({ token: second.body.activationToken, password: PASSWORD })
        .expect(200);
      await http()
        .post(path)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send(body)
        .expect(409);
    });

    it('omits activation token from invitation responses when exposure is disabled', async () => {
      const config = app.get(ConfigService);
      config.set('IDENTITY_EXPOSE_ACTIVATION_TOKEN', false);
      try {
        const invited = await http()
          .post(`/platform/tenants/${tenantA}/admins`)
          .set('Authorization', `Bearer ${platformAdminToken}`)
          .send({
            email: 'hidden.admin@tenant-a.com',
            fullName: 'Hidden Admin',
          })
          .expect(201);
        expect(invited.body.user.status).toBe('INVITED');
        expect(invited.body).not.toHaveProperty('activationToken');
      } finally {
        config.set('IDENTITY_EXPOSE_ACTIVATION_TOKEN', true);
      }
    });

    it('rejects unknown or inactive tenants and non-platform callers', async () => {
      await http()
        .post(`/platform/tenants/${tenantA}/admins`)
        .set('Authorization', `Bearer ${tenantAdminTokenA}`)
        .send({ email: 'forbidden@tenant-a.com', fullName: 'Forbidden' })
        .expect(403);
      await http()
        .post('/platform/tenants/00000000-0000-4000-8000-000000000999/admins')
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({ email: 'missing@tenant-a.com', fullName: 'Missing' })
        .expect(404);
      await prisma.tenantDirectory.update({
        where: { tenantId: tenantB },
        data: { status: 'SUSPENDED' },
      });
      await http()
        .post(`/platform/tenants/${tenantB}/admins`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({ email: 'inactive@tenant-b.com', fullName: 'Inactive' })
        .expect(409);
    });

    it('protects the last active Tenant Admin and permits platform recovery', async () => {
      await http()
        .post(`/users/${adminUserIdA}/status`)
        .set('Authorization', `Bearer ${tenantAdminTokenA}`)
        .send({ status: 'SUSPENDED' })
        .expect(403);
      const protectedResult = await http()
        .post(`/platform/tenants/${tenantA}/admins/${adminUserIdA}/status`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({ status: 'SUSPENDED' })
        .expect(409);
      expect(protectedResult.body.code).toBe('LAST_ACTIVE_TENANT_ADMIN');

      const secondAdmin = await createUser(prisma, {
        tenantId: tenantA,
        userType: 'TENANT_STAFF',
        email: 'second.admin@tenant-a.com',
        password: PASSWORD,
        roles: ['TENANT_ADMIN'],
      });
      await http()
        .post(`/users/${secondAdmin}/status`)
        .set('Authorization', `Bearer ${tenantAdminTokenA}`)
        .send({ status: 'SUSPENDED' })
        .expect(403);
      await http()
        .post(`/platform/tenants/${tenantA}/admins/${secondAdmin}/status`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({ status: 'SUSPENDED' })
        .expect(200);
      await http()
        .post(`/platform/tenants/${tenantA}/admins/${secondAdmin}/status`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({ status: 'ACTIVE' })
        .expect(200);
    });

    it('keeps one active Tenant Admin during concurrent suspensions', async () => {
      const secondAdmin = await createUser(prisma, {
        tenantId: tenantA,
        userType: 'TENANT_STAFF',
        email: 'concurrent.admin@tenant-a.com',
        password: PASSWORD,
        roles: ['TENANT_ADMIN'],
      });
      const results = await Promise.all(
        [adminUserIdA, secondAdmin].map((id) =>
          http()
            .post(`/platform/tenants/${tenantA}/admins/${id}/status`)
            .set('Authorization', `Bearer ${platformAdminToken}`)
            .send({ status: 'SUSPENDED' }),
        ),
      );
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(
        await prisma.user.count({
          where: {
            tenantId: tenantA,
            status: 'ACTIVE',
            roles: { some: { role: { code: 'TENANT_ADMIN' } } },
          },
        }),
      ).toBe(1);
    });

    it('reserves Tenant Admin role changes for Platform Admin and protects the last admin', async () => {
      const path = `/platform/tenants/${tenantA}/admins/${adminUserIdA}/roles`;
      await http()
        .patch(path)
        .set('Authorization', `Bearer ${tenantAdminTokenA}`)
        .send({ roles: [] })
        .expect(403);
      const last = await http()
        .patch(path)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({ roles: [] })
        .expect(409);
      expect(last.body.code).toBe('LAST_ACTIVE_TENANT_ADMIN');
      const secondAdmin = await createUser(prisma, {
        tenantId: tenantA,
        userType: 'TENANT_STAFF',
        email: 'role.admin@tenant-a.com',
        password: PASSWORD,
        roles: ['TENANT_ADMIN'],
      });
      const removed = await http()
        .patch(`/platform/tenants/${tenantA}/admins/${secondAdmin}/roles`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({ roles: [] })
        .expect(200);
      expect(removed.body.roles).toEqual([]);
      const restored = await http()
        .patch(`/platform/tenants/${tenantA}/admins/${secondAdmin}/roles`)
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({ roles: ['TENANT_ADMIN'] })
        .expect(200);
      expect(restored.body.roles).toEqual(['TENANT_ADMIN']);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 1. Invite User
  // ─────────────────────────────────────────────────────────────────────────
  describe('POST /users (invite)', () => {
    it('Tenant Admin invites a Technician successfully', async () => {
      const res = await http()
        .post('/users')
        .set('Authorization', `Bearer ${tenantAdminTokenA}`)
        .send({
          email: 'tech1@tenant-a.com',
          fullName: 'Tech One',
          userType: 'TENANT_STAFF',
          roles: ['TECHNICIAN'],
        })
        .expect(201);

      expect(res.body.user).toMatchObject({
        tenantId: tenantA,
        userType: 'TENANT_STAFF',
        email: 'tech1@tenant-a.com',
        fullName: 'Tech One',
        status: 'INVITED',
        roles: ['TECHNICIAN'],
      });
      expect(typeof res.body.activationToken).toBe('string');
      expect(res.body.activationToken.length).toBeGreaterThan(20);

      // Verify DB record
      const dbUser = await prisma.user.findUnique({
        where: { id: res.body.user.id },
      });
      expect(dbUser?.status).toBe('INVITED');
      expect(dbUser?.passwordHash).toBeNull();
    });

    it('Tenant Admin invites a Customer User successfully', async () => {
      const res = await http()
        .post('/users')
        .set('Authorization', `Bearer ${tenantAdminTokenA}`)
        .send({
          email: 'cust1@client.com',
          fullName: 'Customer User 1',
          userType: 'CUSTOMER',
          roles: ['CUSTOMER_USER'],
        })
        .expect(201);

      expect(res.body.user).toMatchObject({
        tenantId: tenantA,
        userType: 'CUSTOMER',
        email: 'cust1@client.com',
        status: 'INVITED',
        roles: ['CUSTOMER_USER'],
      });
    });

    it('rejects invitation when role does not match userType', async () => {
      const res = await http()
        .post('/users')
        .set('Authorization', `Bearer ${tenantAdminTokenA}`)
        .send({
          email: 'cust_mismatch@client.com',
          fullName: 'Mismatch User',
          userType: 'CUSTOMER',
          roles: ['TECHNICIAN'],
        })
        .expect(400);

      expect(res.body.code).toBe('ROLE_USER_TYPE_MISMATCH');
    });

    it('rejects invitation with PLATFORM_ADMIN role', async () => {
      await http()
        .post('/users')
        .set('Authorization', `Bearer ${tenantAdminTokenA}`)
        .send({
          email: 'fake_platform@tenant-a.com',
          fullName: 'Fake Admin',
          userType: 'PLATFORM_STAFF',
          roles: ['PLATFORM_ADMIN'],
        })
        .expect(403);
    });

    it('rejects duplicate email within the same tenant', async () => {
      await http()
        .post('/users')
        .set('Authorization', `Bearer ${tenantAdminTokenA}`)
        .send({
          email: 'duplicate@tenant-a.com',
          fullName: 'User 1',
          userType: 'TENANT_STAFF',
        })
        .expect(201);

      const dup = await http()
        .post('/users')
        .set('Authorization', `Bearer ${tenantAdminTokenA}`)
        .send({
          email: 'duplicate@tenant-a.com',
          fullName: 'User 2',
          userType: 'TENANT_STAFF',
        })
        .expect(409);

      expect(dup.body.code).toBe('EMAIL_ALREADY_EXISTS');
    });

    it('allows same email in a different tenant', async () => {
      await http()
        .post('/users')
        .set('Authorization', `Bearer ${tenantAdminTokenA}`)
        .send({
          email: 'shared@example.com',
          fullName: 'User in Tenant A',
          userType: 'TENANT_STAFF',
        })
        .expect(201);

      await http()
        .post('/users')
        .set('Authorization', `Bearer ${tenantAdminTokenB}`)
        .send({
          email: 'shared@example.com',
          fullName: 'User in Tenant B',
          userType: 'TENANT_STAFF',
        })
        .expect(201);
    });

    it('Customer Admin cannot invite staff', async () => {
      await http()
        .post('/users')
        .set('Authorization', `Bearer ${customerAdminTokenA}`)
        .send({
          email: 'tech2@tenant-a.com',
          fullName: 'Tech Two',
          userType: 'TENANT_STAFF',
          roles: ['TECHNICIAN'],
        })
        .expect(403);
    });

    it('Customer Admin can invite a Customer User for membership linking', async () => {
      const res = await http()
        .post('/users')
        .set('Authorization', `Bearer ${customerAdminTokenA}`)
        .send({
          email: 'new.customer@tenant-a.com',
          fullName: 'New Customer User',
          userType: 'CUSTOMER',
          roles: ['CUSTOMER_USER'],
        })
        .expect(201);
      expect(res.body.user.roles).toEqual(['CUSTOMER_USER']);
      expect(res.body.user.customerId).toBeNull();
    });

    it('Tenant Admin cannot grant TENANT_ADMIN through the tenant API', async () => {
      await http()
        .post('/users')
        .set('Authorization', `Bearer ${tenantAdminTokenA}`)
        .send({
          email: 'another.admin@tenant-a.com',
          fullName: 'Another Admin',
          userType: 'TENANT_STAFF',
          roles: ['TENANT_ADMIN'],
        })
        .expect(403);
    });

    it('rejects inviting a PLATFORM_STAFF account from a tenant', async () => {
      await http()
        .post('/users')
        .set('Authorization', `Bearer ${tenantAdminTokenA}`)
        .send({
          email: 'platform@tenant-a.com',
          fullName: 'Invalid Platform Account',
          userType: 'PLATFORM_STAFF',
          roles: [],
        })
        .expect(403);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 2. Activate Account & Set Password
  // ─────────────────────────────────────────────────────────────────────────
  describe('POST /users/activate', () => {
    let activationToken: string;
    let invitedEmail: string;

    beforeEach(async () => {
      invitedEmail = 'invited@tenant-a.com';
      const inviteRes = await http()
        .post('/users')
        .set('Authorization', `Bearer ${tenantAdminTokenA}`)
        .send({
          email: invitedEmail,
          fullName: 'Invited Tech',
          userType: 'TENANT_STAFF',
          roles: ['TECHNICIAN'],
        })
        .expect(201);

      activationToken = inviteRes.body.activationToken;
    });

    it('activates account with valid token and password, then allows login', async () => {
      const newPassword = 'New#Password123';

      const activateRes = await http()
        .post('/users/activate')
        .send({
          token: activationToken,
          password: newPassword,
        })
        .expect(200);

      expect(activateRes.body).toMatchObject({
        tokenType: 'Bearer',
        user: {
          email: invitedEmail,
          status: 'ACTIVE',
        },
      });
      expect(activateRes.body.accessToken).toBeTruthy();

      // Verify login with newly set password works
      const loginRes = await http()
        .post('/auth/login')
        .send({
          tenantCode: 'TENANT-A',
          email: invitedEmail,
          password: newPassword,
        })
        .expect(200);

      expect(loginRes.body.user.email).toBe(invitedEmail);
      expect(loginRes.body.user.status).toBe('ACTIVE');
    });

    it('rejects reuse of activation token', async () => {
      await http()
        .post('/users/activate')
        .send({
          token: activationToken,
          password: 'New#Password123',
        })
        .expect(200);

      const res = await http()
        .post('/users/activate')
        .send({
          token: activationToken,
          password: 'Another#Password456',
        })
        .expect(422);

      expect(res.body.code).toBe('INVALID_ACTIVATION_TOKEN');
    });

    it('consumes an activation token only once under concurrent requests', async () => {
      const attempts = await Promise.all(
        Array.from({ length: 2 }, () =>
          http().post('/users/activate').send({
            token: activationToken,
            password: 'New#Password123',
          }),
        ),
      );
      expect(attempts.map((attempt) => attempt.status).sort()).toEqual([
        200, 422,
      ]);
    });

    it('rejects invalid or malformed activation token', async () => {
      const res = await http()
        .post('/users/activate')
        .send({
          token: 'invalid-nonexistent-token-1234567890',
          password: 'New#Password123',
        })
        .expect(422);

      expect(res.body.code).toBe('INVALID_ACTIVATION_TOKEN');
    });

    it('rejects weak password on activation', async () => {
      await http()
        .post('/users/activate')
        .send({
          token: activationToken,
          password: 'weak',
        })
        .expect(400);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 3. Assign Roles
  // ─────────────────────────────────────────────────────────────────────────
  describe('PATCH /users/:id/roles', () => {
    let staffUserId: string;
    let customerUserId: string;

    beforeEach(async () => {
      staffUserId = await createUser(prisma, {
        tenantId: tenantA,
        userType: 'TENANT_STAFF',
        email: 'staff1@tenant-a.com',
        password: PASSWORD,
        roles: ['TECHNICIAN'],
      });

      customerUserId = await createUser(prisma, {
        tenantId: tenantA,
        userType: 'CUSTOMER',
        email: 'customer1@client.com',
        password: PASSWORD,
        roles: ['CUSTOMER_USER'],
      });
    });

    it('Tenant Admin assigns valid roles to a staff user', async () => {
      const res = await http()
        .patch(`/users/${staffUserId}/roles`)
        .set('Authorization', `Bearer ${tenantAdminTokenA}`)
        .send({ roles: ['SERVICE_MANAGER', 'DISPATCHER'] })
        .expect(200);

      expect(res.body.roles.sort()).toEqual(['DISPATCHER', 'SERVICE_MANAGER']);

      // Check DB
      const userRoles = await prisma.userRole.findMany({
        where: { userId: staffUserId },
        include: { role: true },
      });
      const codes = userRoles.map((r) => r.role.code).sort();
      expect(codes).toEqual(['DISPATCHER', 'SERVICE_MANAGER']);
    });

    it('Tenant Admin assigns CUSTOMER_ADMIN to a CUSTOMER account', async () => {
      const res = await http()
        .patch(`/users/${customerUserId}/roles`)
        .set('Authorization', `Bearer ${tenantAdminTokenA}`)
        .send({ roles: ['CUSTOMER_ADMIN'] })
        .expect(200);

      expect(res.body.roles).toEqual(['CUSTOMER_ADMIN']);
    });

    it('Tenant Admin cannot remove TENANT_ADMIN from another admin', async () => {
      const anotherAdminId = await createUser(prisma, {
        tenantId: tenantA,
        userType: 'TENANT_STAFF',
        email: 'other.admin@tenant-a.com',
        password: PASSWORD,
        roles: ['TENANT_ADMIN'],
      });
      await http()
        .patch(`/users/${anotherAdminId}/roles`)
        .set('Authorization', `Bearer ${tenantAdminTokenA}`)
        .send({ roles: [] })
        .expect(403);
    });

    it('Customer Admin cannot manage a staff account', async () => {
      await http()
        .patch(`/users/${staffUserId}/roles`)
        .set('Authorization', `Bearer ${customerAdminTokenA}`)
        .send({ roles: ['SERVICE_MANAGER'] })
        .expect(404);
    });

    it('Customer Admin can assign CUSTOMER_USER only within its own customer', async () => {
      await prisma.userCustomerLink.create({
        data: {
          userId: customerUserId,
          tenantId: tenantA,
          customerId: CUSTOMER_A,
          membershipId: '00000000-0000-4000-8000-000000000202',
          status: 'ACTIVE',
          sourceChangedAt: new Date(),
        },
      });
      await http()
        .patch(`/users/${customerUserId}/roles`)
        .set('Authorization', `Bearer ${customerAdminTokenA}`)
        .send({ roles: ['CUSTOMER_USER'] })
        .expect(200);
      await http()
        .patch(`/users/${customerUserId}/roles`)
        .set('Authorization', `Bearer ${customerAdminTokenA}`)
        .send({ roles: ['CUSTOMER_ADMIN'] })
        .expect(403);
    });

    it('Customer Admin gets 404 for a user linked to another customer', async () => {
      await prisma.userCustomerLink.create({
        data: {
          userId: customerUserId,
          tenantId: tenantA,
          customerId: CUSTOMER_OTHER,
          membershipId: '00000000-0000-4000-8000-000000000203',
          status: 'ACTIVE',
          sourceChangedAt: new Date(),
        },
      });
      await http()
        .patch(`/users/${customerUserId}/roles`)
        .set('Authorization', `Bearer ${customerAdminTokenA}`)
        .send({ roles: ['CUSTOMER_USER'] })
        .expect(404);
    });

    it('rejects role assignment when role userType does not match user', async () => {
      const res = await http()
        .patch(`/users/${customerUserId}/roles`)
        .set('Authorization', `Bearer ${tenantAdminTokenA}`)
        .send({ roles: ['TECHNICIAN'] })
        .expect(400);

      expect(res.body.code).toBe('ROLE_USER_TYPE_MISMATCH');
    });

    it('returns 404 when target user is in another tenant', async () => {
      await http()
        .patch(`/users/${staffUserId}/roles`)
        .set('Authorization', `Bearer ${tenantAdminTokenB}`)
        .send({ roles: ['DISPATCHER'] })
        .expect(404);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 4. Lock & Unlock Account (Status)
  // ─────────────────────────────────────────────────────────────────────────
  describe('POST /users/:id/status', () => {
    let staffUserId: string;

    beforeEach(async () => {
      staffUserId = await createUser(prisma, {
        tenantId: tenantA,
        userType: 'TENANT_STAFF',
        email: 'lockable@tenant-a.com',
        password: PASSWORD,
        status: 'ACTIVE',
      });
    });

    it('locks user (ACTIVE -> SUSPENDED), revoking active sessions, then unlocks', async () => {
      // 1. Log in to create an active session
      const login1 = await http()
        .post('/auth/login')
        .send({
          tenantCode: 'TENANT-A',
          email: 'lockable@tenant-a.com',
          password: PASSWORD,
        })
        .expect(200);

      // Verify active session exists
      const sessionBefore = await prisma.authSession.findFirst({
        where: { userId: staffUserId, revokedAt: null },
      });
      expect(sessionBefore).not.toBeNull();

      // 2. Lock the user
      const lockRes = await http()
        .post(`/users/${staffUserId}/status`)
        .set('Authorization', `Bearer ${tenantAdminTokenA}`)
        .send({ status: 'SUSPENDED' })
        .expect(200);

      expect(lockRes.body.status).toBe('SUSPENDED');

      // Verify session was revoked
      const sessionAfter = await prisma.authSession.findFirst({
        where: { userId: staffUserId, revokedAt: null },
      });
      expect(sessionAfter).toBeNull();

      // 3. User cannot log in while SUSPENDED
      const loginBlocked = await http()
        .post('/auth/login')
        .send({
          tenantCode: 'TENANT-A',
          email: 'lockable@tenant-a.com',
          password: PASSWORD,
        })
        .expect(403);

      expect(loginBlocked.body.code).toBe('ACCOUNT_NOT_ACTIVE');

      // 4. Token refresh also fails
      await http()
        .post('/auth/refresh')
        .send({ refreshToken: login1.body.refreshToken })
        .expect(401);

      // 5. Unlock the user
      const unlockRes = await http()
        .post(`/users/${staffUserId}/status`)
        .set('Authorization', `Bearer ${tenantAdminTokenA}`)
        .send({ status: 'ACTIVE' })
        .expect(200);

      expect(unlockRes.body.status).toBe('ACTIVE');

      // 6. User can log in again
      await http()
        .post('/auth/login')
        .send({
          tenantCode: 'TENANT-A',
          email: 'lockable@tenant-a.com',
          password: PASSWORD,
        })
        .expect(200);
    });

    it('rejects invalid status transitions', async () => {
      // Trying to transition ACTIVE to ACTIVE (not in allowed map)
      await http()
        .post(`/users/${staffUserId}/status`)
        .set('Authorization', `Bearer ${tenantAdminTokenA}`)
        .send({ status: 'ACTIVE' })
        .expect(400);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 5. List Users of Tenant
  // ─────────────────────────────────────────────────────────────────────────
  describe('GET /users', () => {
    beforeEach(async () => {
      await createUser(prisma, {
        tenantId: tenantA,
        userType: 'TENANT_STAFF',
        email: 'tech_a@tenant-a.com',
        password: PASSWORD,
        roles: ['TECHNICIAN'],
      });
      await createUser(prisma, {
        tenantId: tenantB,
        userType: 'TENANT_STAFF',
        email: 'tech_b@tenant-b.com',
        password: PASSWORD,
        roles: ['TECHNICIAN'],
      });
    });

    it('returns only users belonging to the caller tenant', async () => {
      const res = await http()
        .get('/users')
        .set('Authorization', `Bearer ${tenantAdminTokenA}`)
        .expect(200);

      expect(res.body.items).toBeInstanceOf(Array);
      const emails = res.body.items.map((u: { email: string }) => u.email);
      expect(emails).toContain('admin@tenant-a.com');
      expect(emails).toContain('tech_a@tenant-a.com');
      expect(emails).not.toContain('tech_b@tenant-b.com');
    });

    it('filters users by role', async () => {
      const res = await http()
        .get('/users?role=TECHNICIAN')
        .set('Authorization', `Bearer ${tenantAdminTokenA}`)
        .expect(200);

      expect(res.body.items.length).toBeGreaterThanOrEqual(1);
      for (const item of res.body.items) {
        expect(item.roles).toContain('TECHNICIAN');
      }
    });

    it('Customer Admin lists only users linked to its own customer', async () => {
      const ownUserId = await createUser(prisma, {
        tenantId: tenantA,
        userType: 'CUSTOMER',
        email: 'own.customer@tenant-a.com',
        password: PASSWORD,
        roles: ['CUSTOMER_USER'],
      });
      await prisma.userCustomerLink.create({
        data: {
          userId: ownUserId,
          tenantId: tenantA,
          customerId: CUSTOMER_A,
          membershipId: '00000000-0000-4000-8000-000000000204',
          status: 'ACTIVE',
          sourceChangedAt: new Date(),
        },
      });
      const res = await http()
        .get('/users')
        .set('Authorization', `Bearer ${customerAdminTokenA}`)
        .expect(200);
      const emails = res.body.items.map(
        (item: { email: string }) => item.email,
      );
      expect(emails).toContain('own.customer@tenant-a.com');
      expect(emails).not.toContain('tech_a@tenant-a.com');
      expect(emails).not.toContain('tech_b@tenant-b.com');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 6. Internal Users API (Service-to-Service)
  // ─────────────────────────────────────────────────────────────────────────
  describe('Internal Users API', () => {
    let techId: string;

    beforeEach(async () => {
      techId = await createUser(prisma, {
        tenantId: tenantA,
        userType: 'TENANT_STAFF',
        email: 'assigned.tech@tenant-a.com',
        password: PASSWORD,
        roles: ['TECHNICIAN'],
        status: 'ACTIVE',
      });
    });

    it('GET /internal/users/:id returns user snapshot for same tenant', async () => {
      const res = await http()
        .get(`/internal/users/${techId}`)
        .set('Authorization', `Bearer ${tenantAdminTokenA}`)
        .expect(200);

      expect(res.body).toEqual({
        id: techId,
        tenantId: tenantA,
        userType: 'TENANT_STAFF',
        status: 'ACTIVE',
        roles: ['TECHNICIAN'],
        email: 'assigned.tech@tenant-a.com',
        fullName: 'assigned.tech',
      });
    });

    it('GET /internal/users/:id can be called by another role (e.g. Technician or Dispatcher token)', async () => {
      const res = await http()
        .get(`/internal/users/${techId}`)
        .set('Authorization', `Bearer ${techTokenA}`)
        .expect(200);

      expect(res.body.id).toBe(techId);
    });

    it('GET /internal/users/:id returns 404 if user is in another tenant', async () => {
      await http()
        .get(`/internal/users/${techId}`)
        .set('Authorization', `Bearer ${tenantAdminTokenB}`)
        .expect(404);
    });

    it('does not expose staff or list users to Customer Admin', async () => {
      await http()
        .get(`/internal/users/${techId}`)
        .set('Authorization', `Bearer ${customerAdminTokenA}`)
        .expect(404);
      await http()
        .get('/internal/users?role=TECHNICIAN')
        .set('Authorization', `Bearer ${customerAdminTokenA}`)
        .expect(403);
    });

    it('lets Customer Admin manage only its own invited or linked Customer Users', async () => {
      const invited = await http()
        .post('/users')
        .set('Authorization', `Bearer ${customerAdminTokenA}`)
        .send({
          email: 'invited.by.customer@tenant-a.com',
          fullName: 'Invited Customer User',
          userType: 'CUSTOMER',
          roles: ['CUSTOMER_USER'],
        })
        .expect(201);
      const id: string = invited.body.user.id;
      await http()
        .get(`/users/${id}`)
        .set('Authorization', `Bearer ${customerAdminTokenA}`)
        .expect(200);
      await http()
        .get(`/internal/users/${id}`)
        .set('Authorization', `Bearer ${customerAdminTokenA}`)
        .expect(200);
      const list = await http()
        .get('/users?q=invited.by.customer')
        .set('Authorization', `Bearer ${customerAdminTokenA}`)
        .expect(200);
      expect(list.body.items.map((item: { id: string }) => item.id)).toContain(
        id,
      );

      const peerAdminId = await createUser(prisma, {
        tenantId: tenantA,
        userType: 'CUSTOMER',
        email: 'peer.customer.admin@tenant-a.com',
        password: PASSWORD,
        roles: ['CUSTOMER_ADMIN'],
      });
      await prisma.userCustomerLink.create({
        data: {
          userId: peerAdminId,
          tenantId: tenantA,
          customerId: CUSTOMER_A,
          membershipId: '00000000-0000-4000-8000-000000000207',
          status: 'ACTIVE',
          sourceChangedAt: new Date(),
        },
      });
      const peerToken = signTestAccessToken({
        role: 'CUSTOMER_ADMIN',
        tenantId: tenantA,
        customerId: CUSTOMER_A,
        userId: peerAdminId,
      });
      const peerInvite = await http()
        .post('/users')
        .set('Authorization', `Bearer ${peerToken}`)
        .send({
          email: 'peer.invitee@tenant-a.com',
          fullName: 'Peer Invitee',
          userType: 'CUSTOMER',
          roles: ['CUSTOMER_USER'],
        })
        .expect(201);
      await http()
        .get(`/users/${peerInvite.body.user.id}`)
        .set('Authorization', `Bearer ${customerAdminTokenA}`)
        .expect(404);
      await http()
        .get(`/internal/users/${peerInvite.body.user.id}`)
        .set('Authorization', `Bearer ${customerAdminTokenA}`)
        .expect(404);
      await http()
        .get(`/users/${peerAdminId}`)
        .set('Authorization', `Bearer ${customerAdminTokenA}`)
        .expect(404);

      const otherAdminId = await createUser(prisma, {
        tenantId: tenantA,
        userType: 'CUSTOMER',
        email: 'other.customer.admin@tenant-a.com',
        password: PASSWORD,
        roles: ['CUSTOMER_ADMIN'],
      });
      await prisma.userCustomerLink.create({
        data: {
          userId: otherAdminId,
          tenantId: tenantA,
          customerId: CUSTOMER_OTHER,
          membershipId: '00000000-0000-4000-8000-000000000205',
          status: 'ACTIVE',
          sourceChangedAt: new Date(),
        },
      });
      const otherToken = signTestAccessToken({
        role: 'CUSTOMER_ADMIN',
        tenantId: tenantA,
        customerId: CUSTOMER_OTHER,
        userId: otherAdminId,
      });
      await http()
        .get(`/internal/users/${id}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(404);

      await prisma.userCustomerLink.create({
        data: {
          userId: id,
          tenantId: tenantA,
          customerId: CUSTOMER_A,
          membershipId: '00000000-0000-4000-8000-000000000206',
          status: 'ACTIVE',
          sourceChangedAt: new Date(),
        },
      });
      await http()
        .get(`/internal/users/${id}`)
        .set('Authorization', `Bearer ${customerAdminTokenA}`)
        .expect(200);
      await prisma.userCustomerLink.update({
        where: { userId: id },
        data: { customerId: CUSTOMER_OTHER },
      });
      await http()
        .get(`/internal/users/${id}`)
        .set('Authorization', `Bearer ${customerAdminTokenA}`)
        .expect(404);
      await http()
        .get(`/users/${id}`)
        .set('Authorization', `Bearer ${customerAdminTokenA}`)
        .expect(404);
    });

    it('validates UUID path parameters', async () => {
      for (const path of ['/users/not-a-uuid', '/internal/users/not-a-uuid']) {
        await http()
          .get(path)
          .set('Authorization', `Bearer ${tenantAdminTokenA}`)
          .expect(400);
      }
      await http()
        .patch('/users/not-a-uuid/roles')
        .set('Authorization', `Bearer ${tenantAdminTokenA}`)
        .send({ roles: [] })
        .expect(400);
      await http()
        .post('/users/not-a-uuid/status')
        .set('Authorization', `Bearer ${tenantAdminTokenA}`)
        .send({ status: 'SUSPENDED' })
        .expect(400);
      await http()
        .post('/platform/tenants/not-a-uuid/admins')
        .set('Authorization', `Bearer ${platformAdminToken}`)
        .send({ email: 'bad@tenant-a.com', fullName: 'Bad' })
        .expect(400);
    });

    it('GET /internal/users?role=TECHNICIAN&status=ACTIVE returns list in tenant', async () => {
      const res = await http()
        .get('/internal/users?role=TECHNICIAN&status=ACTIVE')
        .set('Authorization', `Bearer ${tenantAdminTokenA}`)
        .expect(200);

      expect(res.body.items).toBeInstanceOf(Array);
      expect(res.body.items.length).toBeGreaterThanOrEqual(1);
      const found = res.body.items.find((u: { id: string }) => u.id === techId);
      expect(found).toEqual({
        id: techId,
        email: 'assigned.tech@tenant-a.com',
        fullName: 'assigned.tech',
        roles: ['TECHNICIAN'],
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 7. Roles catalog endpoint
  // ─────────────────────────────────────────────────────────────────────────
  describe('GET /roles', () => {
    it('returns fixed role catalog', async () => {
      const res = await http()
        .get('/roles')
        .set('Authorization', `Bearer ${tenantAdminTokenA}`)
        .expect(200);

      expect(res.body.items).toBeInstanceOf(Array);
      expect(res.body.items.length).toBeGreaterThan(0);
      const codes = res.body.items.map((r: { code: string }) => r.code);
      expect(codes).toContain('TECHNICIAN');
      expect(codes).toContain('CUSTOMER_USER');
      expect(codes).toContain('TENANT_ADMIN');
    });
  });
});
