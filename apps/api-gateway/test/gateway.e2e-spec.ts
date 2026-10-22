import { createServer, type Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';
import { validateEnv, type AppEnv } from '../src/config/env.validation.js';
import { configureGateway } from '../src/gateway.setup.js';

describe('API Gateway (e2e)', () => {
  let app: INestApplication<App>;
  let upstream: Server;
  let upstreamUrl: string;

  beforeAll(async () => {
    upstream = createServer((req, res) => {
      if (req.url === '/health') {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ status: 'ok' }));
        return;
      }
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            method: req.method,
            url: req.url,
            authorization: req.headers.authorization ?? null,
            correlationId: req.headers['x-correlation-id'] ?? null,
            body: Buffer.concat(chunks).toString(),
          }),
        );
      });
    });
    await new Promise<void>((resolve) =>
      upstream.listen(0, '127.0.0.1', resolve),
    );
    upstreamUrl = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;

    const env: AppEnv = validateEnv({
      IDENTITY_SERVICE_URL: upstreamUrl,
      ORGANIZATION_SERVICE_URL: upstreamUrl,
      ASSET_SERVICE_URL: upstreamUrl,
      SERVICE_REQUEST_SERVICE_URL: upstreamUrl,
      CORS_ORIGINS: 'http://localhost:5173',
      LOGIN_RATE_LIMIT: '5',
      LOGIN_RATE_LIMIT_WINDOW_MS: '60000',
    });
    const config = { get: (key: keyof AppEnv) => env[key] } as ConfigService<
      AppEnv,
      true
    >;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ConfigService)
      .useValue(config)
      .compile();
    app = moduleRef.createNestApplication();
    configureGateway(app, config);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await new Promise<void>((resolve, reject) =>
      upstream.close((error) => (error ? reject(error) : resolve())),
    );
  });

  it('aggregates the four M1 service health checks', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body).toMatchObject({
      status: 'ok',
      services: {
        identity: 'up',
        organization: 'up',
        asset: 'up',
        'service-request': 'up',
      },
    });
    expect(res.headers['x-correlation-id']).toBeTruthy();
  });

  it('returns degraded when a required service is unavailable', async () => {
    const spy = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementationOnce(async () => {
        throw new Error('unavailable');
      });
    try {
      const res = await request(app.getHttpServer()).get('/health').expect(503);
      expect(res.body.status).toBe('degraded');
      expect(Object.values(res.body.services)).toContain('down');
    } finally {
      spy.mockRestore();
    }
  });

  it('blocks direct and service-prefixed internal paths before proxying', async () => {
    for (const path of [
      '/internal/users',
      '/api/identity/internal/users',
      '/api/identity/%69nternal/users',
      '/api/assets/internal/equipment/123',
    ]) {
      await request(app.getHttpServer()).get(path).expect(404);
    }
  });

  it('accepts the web origin and rejects an unrelated origin', async () => {
    const allowed = await request(app.getHttpServer())
      .options('/api/auth/login')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'POST')
      .expect(204);
    expect(allowed.headers['access-control-allow-origin']).toBe(
      'http://localhost:5173',
    );
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');

    const denied = await request(app.getHttpServer())
      .options('/api/auth/login')
      .set('Origin', 'https://untrusted.example')
      .set('Access-Control-Request-Method', 'POST')
      .expect(204);
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('proxies login with the JSON body and forwards both required headers', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login?source=web')
      .set('Authorization', 'Bearer test-token')
      .set('x-correlation-id', 'm1-correlation')
      .send({ email: 'admin@demo.local', password: 'test-password' })
      .expect(200);
    expect(res.body).toMatchObject({
      method: 'POST',
      url: '/auth/login?source=web',
      authorization: 'Bearer test-token',
      correlationId: 'm1-correlation',
    });
    expect(JSON.parse(res.body.body)).toMatchObject({
      email: 'admin@demo.local',
    });
  });

  it('routes M1 contract paths to their owning services', async () => {
    const routes = [
      ['/api/identity/users?page=2', '/users?page=2'],
      ['/api/organization/customers', '/customers'],
      ['/api/assets/equipment', '/equipment'],
      ['/api/service-requests', '/service-requests'],
      ['/api/service-requests/123/accept', '/service-requests/123/accept'],
    ];
    for (const [gatewayPath, upstreamPath] of routes) {
      const res = await request(app.getHttpServer()).get(gatewayPath);
      expect([gatewayPath, res.status]).toEqual([gatewayPath, 200]);
      expect(res.body.url).toBe(upstreamPath);
      expect(res.body.correlationId).toBeTruthy();
    }
  });

  it('returns 429 for /api/auth/login after the shared login budget', async () => {
    const server = app.getHttpServer();
    let limited = false;
    for (let index = 0; index < 6; index++) {
      const path =
        index % 2 === 0 ? '/api/auth/login' : '/api/identity/auth/login';
      const res = await request(server).post(path).send({});
      if (res.status === 429) {
        expect(res.body.code).toBe('RATE_LIMIT_EXCEEDED');
        limited = true;
        break;
      }
      expect(res.status).toBe(200);
    }
    expect(limited).toBe(true);
  });
});
