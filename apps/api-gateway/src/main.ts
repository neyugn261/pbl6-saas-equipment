import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import rateLimit from 'express-rate-limit';
import { AppModule } from './app.module.js';
import type { AppEnv } from './config/env.validation.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();

  const config = app.get<ConfigService<AppEnv, true>>(ConfigService);

  // ── CORS ────────────────────────────────────────────────────────────────
  const rawOrigins = config.get('CORS_ORIGINS', { infer: true });
  const origins = rawOrigins
    .split(',')
    .map((o: string) => o.trim())
    .filter(Boolean);

  app.enableCors({
    origin: origins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-correlation-id'],
  });

  // ── Rate limiting — auth endpoints only ─────────────────────────────────
  const loginLimiter = rateLimit({
    windowMs: config.get('LOGIN_RATE_LIMIT_WINDOW_MS', { infer: true }),
    limit: config.get('LOGIN_RATE_LIMIT', { infer: true }),
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests, please try again later',
    },
  });

  // Apply rate limit to both login and token refresh
  app.use('/api/identity/auth/login', loginLimiter);
  app.use('/api/identity/auth/refresh', loginLimiter);

  await app.listen(config.get('PORT', { infer: true }));
}

void bootstrap();
