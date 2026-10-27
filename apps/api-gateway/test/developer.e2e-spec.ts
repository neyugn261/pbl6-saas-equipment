import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';
import { configureGateway } from '../src/gateway.setup.js';
import { validateEnv, type AppEnv } from '../src/config/env.validation.js';

// Real local HTTP upstream: proves the rendered API view calls the existing proxy paths.
describe('Developer portal (no DB)', () => {
  let app: INestApplication<App>, upstream: Server, env: AppEnv;
  beforeAll(async () => {
    upstream = createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          status: 'ok',
          path: req.url,
          authorization: req.headers.authorization ?? null,
        }),
      );
    });
    await new Promise<void>((resolve) =>
      upstream.listen(0, '127.0.0.1', resolve),
    );
    const url = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;
    env = validateEnv({
      NODE_ENV: 'test',
      IDENTITY_SERVICE_URL: url,
      ORGANIZATION_SERVICE_URL: url,
      ASSET_SERVICE_URL: url,
      SERVICE_REQUEST_SERVICE_URL: url,
      WORKORDER_SERVICE_URL: url,
      MAINTENANCE_SERVICE_URL: url,
      INVENTORY_SERVICE_URL: url,
      NOTIFICATION_SERVICE_URL: url,
    });
    const config = { get: (key: keyof AppEnv) => env[key] } as ConfigService<
      AppEnv,
      true
    >;
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ConfigService)
      .useValue(config)
      .compile();
    app = module.createNestApplication({ logger: false });
    configureGateway(app, config);
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
    await new Promise<void>((resolve, reject) =>
      upstream.close((error) => (error ? reject(error) : resolve())),
    );
  });
  it('serves the actual HTML, local JS/CSS and Swagger bundle', async () => {
    for (const path of ['/dev', '/dev/', '/docs', '/docs/']) {
      const response = await request(app.getHttpServer()).get(path).expect(200);
      expect(response.headers['content-type']).toMatch(/text\/html/);
      expect(response.text).toContain('PBL6');
    }
    for (const asset of [
      'portal.css',
      'dashboard.js',
      'docs.js',
      'swagger-ui.css',
      'swagger-ui-bundle.js',
    ]) {
      const response = await request(app.getHttpServer()).get(
        '/dev/assets/' + asset,
      );
      expect([asset, response.status, response.body.message]).toEqual([
        asset,
        200,
        undefined,
      ]);
    }
    await request(app.getHttpServer())
      .get('/dev/assets/package.json')
      .expect(404);
  });
  it('lists all eight services and six documents, with scaffold execution disabled', async () => {
    const response = await request(app.getHttpServer())
      .get('/dev/catalog')
      .expect(200);
    expect(response.body).toHaveLength(8);
    expect(
      response.body.filter((item: { specUrl: string | null }) => item.specUrl),
    ).toHaveLength(6);
    expect(
      response.body.find((item: { id: string }) => item.id === 'maintenance'),
    ).toMatchObject({
      interactive: false,
      specUrl: '/docs/openapi/maintenance.json',
    });
  });
  it.each([
    [
      'identity',
      '/api/identity',
      '/auth/me',
      '/api/identity/auth/me',
      '/auth/me',
    ],
    [
      'organization',
      '/api/organization',
      '/customers',
      '/api/organization/customers',
      '/customers',
    ],
    [
      'asset',
      '/api/assets',
      '/equipment',
      '/api/assets/equipment',
      '/equipment',
    ],
    [
      'service-request',
      '/api',
      '/service-requests',
      '/api/service-requests',
      '/service-requests',
    ],
    [
      'workorder',
      '/api/workorders',
      '/work-orders',
      '/api/workorders/work-orders',
      '/work-orders',
    ],
    ['maintenance', '/api/maintenance', '/maintenance-plans', null, null],
  ])(
    'maps %s to the real same-origin Gateway route and hides internal paths',
    async (id, base, path, gatewayPath, upstreamPath) => {
      const response = await request(app.getHttpServer())
        .get(`/docs/openapi/${id}.json`)
        .expect(200);
      expect(response.body.openapi).toBe('3.1.0');
      expect(response.body.servers).toEqual([
        { url: base, description: 'Current API Gateway' },
      ]);
      expect(response.body.paths[path]).toBeDefined();
      expect(
        Object.keys(response.body.paths).some((key) => /internal/i.test(key)),
      ).toBe(false);
      if (gatewayPath) {
        const result = await request(app.getHttpServer())
          .get(gatewayPath)
          .set('Authorization', 'Bearer portal-test')
          .expect(200);
        expect(result.body).toMatchObject({
          path: upstreamPath,
          authorization: 'Bearer portal-test',
        });
      }
    },
  );
  it('preserves login security, excludes unimplemented estimates, and rejects unknown spec filenames', async () => {
    const identity = await request(app.getHttpServer())
      .get('/docs/openapi/identity.json')
      .expect(200);
    expect(identity.body.paths['/auth/login'].post.security).toEqual([]);
    expect(identity.body.security).toEqual([{ bearer: [] }]);
    const requests = await request(app.getHttpServer())
      .get('/docs/openapi/service-request.json')
      .expect(200);
    expect(
      Object.keys(requests.body.paths).some((path) =>
        path.includes('/estimates'),
      ),
    ).toBe(false);
    await request(app.getHttpServer())
      .get('/docs/openapi/package.json')
      .expect(404);
    await request(app.getHttpServer())
      .get('/docs/openapi/workorder.yaml')
      .expect(404);
  });
  it('probes all eight services and reports failures without leaking exception text', async () => {
    const response = await request(app.getHttpServer())
      .get('/dev/status')
      .expect(200);
    expect(response.body.services).toHaveLength(8);
    expect(
      response.body.services.every(
        (item: { state: string }) => item.state === 'up',
      ),
    ).toBe(true);
    const spy = jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('SECRET_UPSTREAM_CREDENTIAL'));
    try {
      const degraded = await request(app.getHttpServer())
        .get('/dev/status')
        .expect(200);
      expect(
        degraded.body.services.filter(
          (item: { state: string }) => item.state === 'down',
        ),
      ).toHaveLength(1);
      expect(JSON.stringify(degraded.body)).not.toContain(
        'SECRET_UPSTREAM_CREDENTIAL',
      );
    } finally {
      spy.mockRestore();
    }
  });
  it('distinguishes a missing health route from an unreachable service', async () => {
    const spy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('', { status: 404 }));
    try {
      const response = await request(app.getHttpServer())
        .get('/dev/status')
        .expect(200);
      expect(response.body.services[0]).toMatchObject({
        state: 'no-health',
        httpStatus: 404,
      });
    } finally {
      spy.mockRestore();
    }
  });
  it('disables pages, specifications, assets and status endpoints in production', async () => {
    env.NODE_ENV = 'production';
    try {
      for (const path of [
        '/dev',
        '/docs',
        '/dev/catalog',
        '/dev/status',
        '/dev/assets/portal.css',
        '/docs/openapi/workorder.json',
      ])
        await request(app.getHttpServer()).get(path).expect(404);
      await request(app.getHttpServer()).get('/health').expect(200);
    } finally {
      env.NODE_ENV = 'test';
    }
  });
});
