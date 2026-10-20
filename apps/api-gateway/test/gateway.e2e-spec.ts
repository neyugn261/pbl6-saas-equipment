import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';

/**
 * Gateway E2E tests.
 *
 * These tests exercise only the gateway's own behaviour (CORS headers,
 * /internal blocking, rate limiting, /health) and do NOT require any
 * upstream microservice to be running.
 *
 * Proxy routes (/api/identity/*, etc.) are intentionally not exercised here
 * because the upstream services are unavailable in CI. Unit tests for each
 * proxy middleware cover the upstream-forwarding logic.
 */
describe('API Gateway (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    // Apply the same CORS & rate-limit setup as main.ts
    app.enableCors({
      origin: ['http://localhost:3000'],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-correlation-id'],
    });

    // Rate limiter — very tight window so test can trigger it quickly
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const rateLimit = require('express-rate-limit');
    app.use(
      '/api/identity/auth/login',
      rateLimit.default({
        windowMs: 1000,
        limit: 3,
        standardHeaders: true,
        legacyHeaders: false,
        message: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests, please try again later',
        },
      }),
    );

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  // ── Health ─────────────────────────────────────────────────────────────

  it('GET /health → 200 with status ok', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);

    expect(res.body).toMatchObject({ status: 'ok' });
    expect(typeof res.body.version).toBe('string');
  });

  // ── Internal blocking ──────────────────────────────────────────────────

  it('GET /api/internal/anything → 404 (gateway blocks internal paths)', () => {
    return request(app.getHttpServer())
      .get('/api/internal/anything')
      .expect(404);
  });

  it('POST /api/internal/rpc → 404', () => {
    return request(app.getHttpServer())
      .post('/api/internal/rpc')
      .send({ foo: 'bar' })
      .expect(404);
  });

  it('GET /internal → 404', () => {
    return request(app.getHttpServer()).get('/internal').expect(404);
  });

  // ── CORS preflight ─────────────────────────────────────────────────────

  it('OPTIONS /health from allowed origin → 204 with CORS headers', async () => {
    const res = await request(app.getHttpServer())
      .options('/health')
      .set('Origin', 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'GET')
      .expect(204);

    expect(
      res.headers['access-control-allow-origin'],
    ).toBe('http://localhost:3000');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  // ── Correlation-id ─────────────────────────────────────────────────────

  it('GET /health → response includes x-correlation-id header', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.headers['x-correlation-id']).toBeTruthy();
  });

  it('GET /health with x-correlation-id → echoes the same id', async () => {
    const id = 'test-correlation-abc-123';
    const res = await request(app.getHttpServer())
      .get('/health')
      .set('x-correlation-id', id)
      .expect(200);

    expect(res.headers['x-correlation-id']).toBe(id);
  });

  // ── Rate limiting ──────────────────────────────────────────────────────

  it('fires 4 requests to /api/identity/auth/login → 4th is 429', async () => {
    const server = app.getHttpServer();

    // First 3 allowed (limiter has limit: 3, but proxy returns 502 because
    // no upstream — that's fine, what matters is the rate-limiter header)
    for (let i = 0; i < 3; i++) {
      const res = await request(server)
        .post('/api/identity/auth/login')
        .send({});
      // Upstream is unavailable → 502, but NOT 429
      expect(res.status).not.toBe(429);
    }

    // 4th request should be rate-limited
    const final = await request(server)
      .post('/api/identity/auth/login')
      .send({});
    expect(final.status).toBe(429);
    expect(final.body.code).toBe('RATE_LIMIT_EXCEEDED');
  });
});
