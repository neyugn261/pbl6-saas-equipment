import { Controller, Get, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { configureApp, Public } from '@pbl6/service-kit';
import request from 'supertest';
import { AuthModule } from './auth.module';
import { AllowUserTypes, CurrentUser, RequirePermissions } from './decorators';
import type { Principal } from './principal';
import { dataScope } from './scope';
import { CUSTOMER, OPTIONS, sign, TENANT } from './test-tokens.spec-helper';

@Controller('probe')
@AllowUserTypes('TENANT_STAFF', 'CUSTOMER')
class ProbeController {
  @Public()
  @Get('public')
  open() {
    return { ok: true };
  }

  @Get('me')
  me(@CurrentUser() user: Principal) {
    return { userId: user.userId, scope: dataScope(user) };
  }

  @Get('assign')
  @RequirePermissions('work_order:assign')
  assign() {
    return { ok: true };
  }

  @Get('assign-and-manage')
  @RequirePermissions('work_order:assign', 'work_order:manage')
  both() {
    return { ok: true };
  }
}

describe('AuthModule (global guards)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AuthModule.forRootAsync({ useFactory: () => OPTIONS })],
      controllers: [ProbeController],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app, { logger: { log: () => {}, error: () => {}, warn: () => {} } });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('lets public routes through without a token', async () => {
    await http().get('/probe/public').expect(200, { ok: true });
  });

  it('requires a valid token everywhere else', async () => {
    const missing = await http().get('/probe/me').expect(401);
    expect(missing.body).toEqual({ code: 'INVALID_ACCESS_TOKEN', message: 'Missing bearer token' });
    const forged = await http()
      .get('/probe/me')
      .set('authorization', `Bearer ${sign({}, {}, 'forged-secret-forged-secret-forged-123')}`)
      .expect(401);
    expect(forged.body.code).toBe('INVALID_ACCESS_TOKEN');
  });

  it('exposes the principal and its data scope', async () => {
    const res = await http()
      .get('/probe/me')
      .set('authorization', `Bearer ${sign({ user_type: 'CUSTOMER', roles: ['CUSTOMER_USER'], customer_id: CUSTOMER })}`)
      .expect(200);
    expect(res.body.scope).toEqual({ tenantId: TENANT, customerId: CUSTOMER });
  });

  it('enforces permissions from the shared catalog', async () => {
    const dispatcher = `Bearer ${sign({ roles: ['DISPATCHER'] })}`;
    await http().get('/probe/assign').set('authorization', dispatcher).expect(200);
    const res = await http().get('/probe/assign-and-manage').set('authorization', dispatcher).expect(403);
    expect(res.body).toEqual({
      code: 'FORBIDDEN',
      message: 'Missing permission',
      details: { required: ['work_order:manage'] },
    });
    const technician = `Bearer ${sign({ roles: ['TECHNICIAN'] })}`;
    await http().get('/probe/assign').set('authorization', technician).expect(403);
  });

  it('enforces allowed account types', async () => {
    const platform = sign({ user_type: 'PLATFORM_STAFF', tenant_id: null, roles: ['PLATFORM_ADMIN'] });
    const res = await http().get('/probe/me').set('authorization', `Bearer ${platform}`).expect(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('refuses a customer account that is not linked to a customer', async () => {
    const token = sign({ user_type: 'CUSTOMER', roles: ['CUSTOMER_USER'], customer_id: null });
    const res = await http().get('/probe/me').set('authorization', `Bearer ${token}`).expect(403);
    expect(res.body.code).toBe('CUSTOMER_SCOPE_MISSING');
  });
});
