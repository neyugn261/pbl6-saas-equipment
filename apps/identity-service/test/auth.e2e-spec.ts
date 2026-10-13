import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  createTenant,
  createTestApp,
  createUser,
  resetDatabase,
} from './support/test-app';
import { TEST_JWT_SECRET } from './support/test-env';

const PASSWORD = 'Correct#Pass1';

describe('Identity auth API (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let tenantA: string;
  let tenantB: string;

  const http = () => request(app.getHttpServer());
  const login = (body: Record<string, unknown>) =>
    http().post('/auth/login').send(body);
  const decode = (token: string) =>
    new JwtService().decode<Record<string, unknown>>(token);

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
    await createUser(prisma, {
      tenantId: tenantA,
      userType: 'TENANT_STAFF',
      email: 'staff@example.com',
      password: PASSWORD,
      roles: ['SERVICE_MANAGER', 'DISPATCHER'],
    });
    // Same email in another tenant, with a different password.
    await createUser(prisma, {
      tenantId: tenantB,
      userType: 'TENANT_STAFF',
      email: 'staff@example.com',
      password: 'Tenant#B-Pass',
      roles: ['TECHNICIAN'],
    });
    await createUser(prisma, {
      tenantId: null,
      userType: 'PLATFORM_STAFF',
      email: 'admin@platform.local',
      password: PASSWORD,
      roles: ['PLATFORM_ADMIN'],
    });
  });

  describe('GET /health', () => {
    it('reports the database as up', async () => {
      await http().get('/health').expect(200, { status: 'ok', database: 'up' });
    });
  });

  describe('POST /auth/login', () => {
    it('logs in a tenant user and issues tokens with tenant context', async () => {
      const res = await login({
        tenantCode: 'TENANT-A',
        email: 'staff@example.com',
        password: PASSWORD,
      }).expect(200);

      expect(res.body).toMatchObject({ tokenType: 'Bearer', expiresIn: 900 });
      expect(typeof res.body.refreshToken).toBe('string');
      expect(res.body.user).toMatchObject({
        tenantId: tenantA,
        userType: 'TENANT_STAFF',
        email: 'staff@example.com',
        status: 'ACTIVE',
      });
      expect(res.body.user.roles.sort()).toEqual([
        'DISPATCHER',
        'SERVICE_MANAGER',
      ]);

      const claims = decode(res.body.accessToken);
      expect(claims).toMatchObject({
        tenant_id: tenantA,
        user_type: 'TENANT_STAFF',
        iss: 'pbl6-identity',
        aud: 'pbl6',
        sub: res.body.user.id,
      });
      expect(typeof claims.sid).toBe('string');
    });

    it('never returns credentials or token hashes', async () => {
      const res = await login({
        tenantCode: 'TENANT-A',
        email: 'staff@example.com',
        password: PASSWORD,
      }).expect(200);
      const body = JSON.stringify(res.body);
      expect(body).not.toMatch(
        /passwordHash|password_hash|refreshTokenHash|\$2[aby]\$/,
      );
      const stored = await prisma.authSession.findFirstOrThrow();
      expect(stored.refreshTokenHash).not.toBe(res.body.refreshToken);
    });

    it('records the login time', async () => {
      await login({
        tenantCode: 'TENANT-A',
        email: 'staff@example.com',
        password: PASSWORD,
      }).expect(200);
      const user = await prisma.user.findFirstOrThrow({
        where: { tenantId: tenantA },
      });
      expect(user.lastLoginAt).not.toBeNull();
    });

    it('matches the email case-insensitively', async () => {
      await login({
        tenantCode: 'TENANT-A',
        email: 'STAFF@Example.com',
        password: PASSWORD,
      }).expect(200);
    });

    it('logs in the Platform Admin without a tenant code', async () => {
      const res = await login({
        email: 'admin@platform.local',
        password: PASSWORD,
      }).expect(200);
      expect(decode(res.body.accessToken)).toMatchObject({
        tenant_id: null,
        user_type: 'PLATFORM_STAFF',
        roles: ['PLATFORM_ADMIN'],
      });
    });

    it.each([
      [
        'wrong password',
        {
          tenantCode: 'TENANT-A',
          email: 'staff@example.com',
          password: 'Wrong#Pass1',
        },
      ],
      [
        'unknown email',
        {
          tenantCode: 'TENANT-A',
          email: 'nobody@example.com',
          password: PASSWORD,
        },
      ],
      [
        'unknown tenant code',
        { tenantCode: 'NOPE', email: 'staff@example.com', password: PASSWORD },
      ],
    ])('rejects a %s with the same generic error', async (_case, body) => {
      const res = await login(body).expect(401);
      expect(res.body).toMatchObject({ code: 'INVALID_CREDENTIALS' });
    });

    it('rejects a missing password field', async () => {
      await login({
        tenantCode: 'TENANT-A',
        email: 'staff@example.com',
      }).expect(400);
    });

    it('rejects a client-supplied tenantId instead of trusting it', async () => {
      await login({
        tenantCode: 'TENANT-A',
        tenantId: tenantB,
        email: 'staff@example.com',
        password: PASSWORD,
      }).expect(400);
    });

    describe('tenant isolation', () => {
      it('resolves the account inside the tenant named by the code', async () => {
        const a = await login({
          tenantCode: 'TENANT-A',
          email: 'staff@example.com',
          password: PASSWORD,
        }).expect(200);
        const b = await login({
          tenantCode: 'TENANT-B',
          email: 'staff@example.com',
          password: 'Tenant#B-Pass',
        }).expect(200);
        expect(decode(a.body.accessToken).tenant_id).toBe(tenantA);
        expect(decode(b.body.accessToken).tenant_id).toBe(tenantB);
        expect(b.body.user.roles).toEqual(['TECHNICIAN']);
      });

      it("does not accept tenant B's password for tenant A", async () => {
        await login({
          tenantCode: 'TENANT-A',
          email: 'staff@example.com',
          password: 'Tenant#B-Pass',
        }).expect(401);
      });

      it('does not let a tenant user log in through the platform scope', async () => {
        await login({ email: 'staff@example.com', password: PASSWORD }).expect(
          401,
        );
      });

      it('does not let the Platform Admin log in through a tenant code', async () => {
        await login({
          tenantCode: 'TENANT-A',
          email: 'admin@platform.local',
          password: PASSWORD,
        }).expect(401);
      });
    });

    describe('account and tenant status', () => {
      it('rejects an invited account that has no password yet', async () => {
        await createUser(prisma, {
          tenantId: tenantA,
          userType: 'TENANT_STAFF',
          email: 'invited@example.com',
          password: null,
          status: 'INVITED',
        });
        const res = await login({
          tenantCode: 'TENANT-A',
          email: 'invited@example.com',
          password: '',
        }).expect(400);
        expect(res.body.message).toBeDefined();
        await login({
          tenantCode: 'TENANT-A',
          email: 'invited@example.com',
          password: 'anything',
        }).expect(401);
      });

      it('rejects an invited account even with a password set', async () => {
        await createUser(prisma, {
          tenantId: tenantA,
          userType: 'TENANT_STAFF',
          email: 'invited@example.com',
          password: PASSWORD,
          status: 'INVITED',
        });
        const res = await login({
          tenantCode: 'TENANT-A',
          email: 'invited@example.com',
          password: PASSWORD,
        }).expect(403);
        expect(res.body).toMatchObject({ code: 'ACCOUNT_NOT_ACTIVE' });
      });

      it.each(['SUSPENDED', 'DISABLED'] as const)(
        'rejects a %s account',
        async (status) => {
          await createUser(prisma, {
            tenantId: tenantA,
            userType: 'TENANT_STAFF',
            email: 'blocked@example.com',
            password: PASSWORD,
            status,
          });
          const res = await login({
            tenantCode: 'TENANT-A',
            email: 'blocked@example.com',
            password: PASSWORD,
          }).expect(403);
          expect(res.body).toMatchObject({ code: 'ACCOUNT_NOT_ACTIVE' });
        },
      );

      it('does not reveal the account status to a wrong password', async () => {
        await createUser(prisma, {
          tenantId: tenantA,
          userType: 'TENANT_STAFF',
          email: 'blocked@example.com',
          password: PASSWORD,
          status: 'SUSPENDED',
        });
        await login({
          tenantCode: 'TENANT-A',
          email: 'blocked@example.com',
          password: 'Wrong#Pass1',
        }).expect(401);
      });

      it('rejects users of a suspended tenant', async () => {
        await prisma.tenantDirectory.update({
          where: { tenantId: tenantA },
          data: { status: 'SUSPENDED' },
        });
        const res = await login({
          tenantCode: 'TENANT-A',
          email: 'staff@example.com',
          password: PASSWORD,
        }).expect(403);
        expect(res.body).toMatchObject({ code: 'TENANT_NOT_ACTIVE' });
      });
    });
  });

  describe('POST /auth/refresh', () => {
    const loginTenantA = async () =>
      (
        await login({
          tenantCode: 'TENANT-A',
          email: 'staff@example.com',
          password: PASSWORD,
        }).expect(200)
      ).body;

    it('rotates the refresh token and issues a new access token', async () => {
      const first = await loginTenantA();
      const res = await http()
        .post('/auth/refresh')
        .send({ refreshToken: first.refreshToken })
        .expect(200);

      expect(res.body.refreshToken).not.toBe(first.refreshToken);
      expect(decode(res.body.accessToken)).toMatchObject({
        tenant_id: tenantA,
        user_type: 'TENANT_STAFF',
      });
      expect(decode(res.body.accessToken).sid).not.toBe(
        decode(first.accessToken).sid,
      );
      // Rotation keeps the absolute session expiry of the original login.
      expect(res.body.refreshTokenExpiresAt).toBe(first.refreshTokenExpiresAt);
      await http()
        .post('/auth/refresh')
        .send({ refreshToken: res.body.refreshToken })
        .expect(200);
    });

    it('treats reuse of a rotated token as theft and revokes every session', async () => {
      const first = await loginTenantA();
      const other = await loginTenantA();
      const rotated = (
        await http()
          .post('/auth/refresh')
          .send({ refreshToken: first.refreshToken })
          .expect(200)
      ).body;

      const reuse = await http()
        .post('/auth/refresh')
        .send({ refreshToken: first.refreshToken })
        .expect(401);
      expect(reuse.body).toMatchObject({ code: 'REFRESH_TOKEN_REUSED' });

      await http()
        .post('/auth/refresh')
        .send({ refreshToken: rotated.refreshToken })
        .expect(401);
      await http()
        .post('/auth/refresh')
        .send({ refreshToken: other.refreshToken })
        .expect(401);
      expect(
        await prisma.authSession.count({ where: { revokedAt: null } }),
      ).toBe(0);
    });

    it('lets only one of two concurrent refreshes with the same token succeed', async () => {
      const first = await loginTenantA();
      const results = await Promise.all([
        http().post('/auth/refresh').send({ refreshToken: first.refreshToken }),
        http().post('/auth/refresh').send({ refreshToken: first.refreshToken }),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 401]);
    });

    it('rejects an unknown refresh token', async () => {
      const res = await http()
        .post('/auth/refresh')
        .send({ refreshToken: 'x'.repeat(43) })
        .expect(401);
      expect(res.body).toMatchObject({ code: 'INVALID_REFRESH_TOKEN' });
    });

    it('rejects an expired refresh token', async () => {
      const first = await loginTenantA();
      await prisma.$executeRaw`
        UPDATE auth_sessions
        SET created_at = now() - interval '10 days', expires_at = now() - interval '1 second'`;
      const res = await http()
        .post('/auth/refresh')
        .send({ refreshToken: first.refreshToken })
        .expect(401);
      expect(res.body).toMatchObject({ code: 'REFRESH_TOKEN_EXPIRED' });
    });

    it('refuses to refresh once the account is suspended', async () => {
      const first = await loginTenantA();
      await prisma.user.updateMany({
        where: { tenantId: tenantA },
        data: { status: 'SUSPENDED' },
      });
      const res = await http()
        .post('/auth/refresh')
        .send({ refreshToken: first.refreshToken })
        .expect(403);
      expect(res.body).toMatchObject({ code: 'ACCOUNT_NOT_ACTIVE' });
      expect(
        await prisma.authSession.count({ where: { revokedAt: null } }),
      ).toBe(0);
    });

    it('refuses to refresh once the tenant is suspended', async () => {
      const first = await loginTenantA();
      await prisma.tenantDirectory.update({
        where: { tenantId: tenantA },
        data: { status: 'SUSPENDED' },
      });
      await http()
        .post('/auth/refresh')
        .send({ refreshToken: first.refreshToken })
        .expect(403);
    });
  });

  describe('POST /auth/logout and GET /auth/me', () => {
    it('returns the current profile for a valid access token', async () => {
      const session = (
        await login({
          tenantCode: 'TENANT-A',
          email: 'staff@example.com',
          password: PASSWORD,
        }).expect(200)
      ).body;
      const res = await http()
        .get('/auth/me')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .expect(200);
      expect(res.body).toMatchObject({
        tenantId: tenantA,
        email: 'staff@example.com',
        userType: 'TENANT_STAFF',
      });
      expect(res.body.passwordHash).toBeUndefined();
    });

    it('revokes the session on logout', async () => {
      const session = (
        await login({
          tenantCode: 'TENANT-A',
          email: 'staff@example.com',
          password: PASSWORD,
        }).expect(200)
      ).body;
      await http()
        .post('/auth/logout')
        .send({ refreshToken: session.refreshToken })
        .expect(204);

      await http()
        .post('/auth/refresh')
        .send({ refreshToken: session.refreshToken })
        .expect(401);
      await http()
        .get('/auth/me')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .expect(401);
    });

    it('rejects /auth/me once the tenant is suspended', async () => {
      const session = (
        await login({
          tenantCode: 'TENANT-A',
          email: 'staff@example.com',
          password: PASSWORD,
        }).expect(200)
      ).body;
      await prisma.tenantDirectory.update({
        where: { tenantId: tenantA },
        data: { status: 'SUSPENDED' },
      });
      await http()
        .get('/auth/me')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .expect(401);
    });

    it('accepts logout of an unknown token without revealing anything', async () => {
      await http()
        .post('/auth/logout')
        .send({ refreshToken: 'y'.repeat(43) })
        .expect(204);
    });

    it('rejects /auth/me without a token', async () => {
      await http().get('/auth/me').expect(401);
    });

    it('rejects an expired access token', async () => {
      const session = (
        await login({
          tenantCode: 'TENANT-A',
          email: 'staff@example.com',
          password: PASSWORD,
        }).expect(200)
      ).body;
      const claims = decode(session.accessToken);
      const expired = await new JwtService({
        secret: TEST_JWT_SECRET,
      }).signAsync(
        {
          sub: claims.sub,
          sid: claims.sid,
          tenant_id: claims.tenant_id,
          user_type: claims.user_type,
          roles: claims.roles,
          exp: Math.floor(Date.now() / 1000) - 60,
        },
        { issuer: 'pbl6-identity', audience: 'pbl6' },
      );
      await http()
        .get('/auth/me')
        .set('Authorization', `Bearer ${expired}`)
        .expect(401);
    });

    it('rejects a token signed with another secret', async () => {
      const session = (
        await login({
          tenantCode: 'TENANT-A',
          email: 'staff@example.com',
          password: PASSWORD,
        }).expect(200)
      ).body;
      const claims = decode(session.accessToken);
      const forged = await new JwtService({
        secret: 'attacker-secret-attacker-secret-0000',
      }).signAsync(
        {
          sub: claims.sub,
          sid: claims.sid,
          tenant_id: tenantB,
          user_type: 'TENANT_STAFF',
          roles: ['TENANT_ADMIN'],
        },
        { issuer: 'pbl6-identity', audience: 'pbl6' },
      );
      await http()
        .get('/auth/me')
        .set('Authorization', `Bearer ${forged}`)
        .expect(401);
    });
  });

  describe('database guards from migration 0001_init', () => {
    it('refuses to give a staff role to a customer account', async () => {
      const customerId = await createUser(prisma, {
        tenantId: tenantA,
        userType: 'CUSTOMER',
        email: 'customer@example.com',
        password: PASSWORD,
      });
      const technician = await prisma.role.findUniqueOrThrow({
        where: { code: 'TECHNICIAN' },
      });
      await expect(
        prisma.userRole.create({
          data: { userId: customerId, roleId: technician.id },
        }),
      ).rejects.toThrow(/cannot be assigned/);
    });

    it('refuses an ACTIVE account without a password', async () => {
      await expect(
        createUser(prisma, {
          tenantId: tenantA,
          userType: 'TENANT_STAFF',
          email: 'nopass@example.com',
          password: null,
        }),
      ).rejects.toThrow();
    });

    it('enforces a case-insensitive unique email per tenant', async () => {
      await expect(
        createUser(prisma, {
          tenantId: tenantA,
          userType: 'TENANT_STAFF',
          email: 'STAFF@example.com',
          password: PASSWORD,
        }),
      ).rejects.toThrow();
    });
  });
});
