import type { INestApplication } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import rateLimit from 'express-rate-limit';
import type { AppEnv } from './config/env.validation.js';

/** Apply the same HTTP policy in production and in gateway e2e tests. */
export function configureGateway(
  app: INestApplication,
  config: ConfigService<AppEnv, true>,
): void {
  const origins = config
    .get('CORS_ORIGINS', { infer: true })
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: origins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-correlation-id'],
  });

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

  // The documented alias and the service-specific route share one IP budget.
  app.use('/api/auth/login', loginLimiter);
  app.use('/api/identity/auth/login', loginLimiter);
}
