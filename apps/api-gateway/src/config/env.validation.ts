import { EnvReader, type NodeEnv } from '@pbl6/service-kit/env';

export interface AppEnv {
  NODE_ENV: NodeEnv;
  PORT: number;
  // Service URLs
  IDENTITY_SERVICE_URL: string;
  ORGANIZATION_SERVICE_URL: string;
  ASSET_SERVICE_URL: string;
  SERVICE_REQUEST_SERVICE_URL: string;
  WORKORDER_SERVICE_URL: string;
  MAINTENANCE_SERVICE_URL: string;
  INVENTORY_SERVICE_URL: string;
  NOTIFICATION_SERVICE_URL: string;
  // CORS — comma-separated list of allowed origins
  CORS_ORIGINS: string;
  // Rate limiting for auth endpoints
  LOGIN_RATE_LIMIT: number;
  LOGIN_RATE_LIMIT_WINDOW_MS: number;
}

export const PORT_VARIABLE = 'API_GATEWAY_PORT';
const DEFAULT_PORT = 3000;

/**
 * Validates environment variables at startup. Used by ConfigModule.forRoot,
 * so the application refuses to start with an invalid configuration.
 */
export function validateEnv(raw: Record<string, unknown>): AppEnv {
  const env = new EnvReader(raw);
  const http = ['http:', 'https:'];
  return env.done({
    NODE_ENV: env.nodeEnv(),
    PORT: env.port(PORT_VARIABLE, DEFAULT_PORT),
    IDENTITY_SERVICE_URL: env.url('IDENTITY_SERVICE_URL', http),
    ORGANIZATION_SERVICE_URL: env.url('ORGANIZATION_SERVICE_URL', http),
    ASSET_SERVICE_URL: env.url('ASSET_SERVICE_URL', http),
    SERVICE_REQUEST_SERVICE_URL: env.url('SERVICE_REQUEST_SERVICE_URL', http),
    WORKORDER_SERVICE_URL: env.url('WORKORDER_SERVICE_URL', http),
    MAINTENANCE_SERVICE_URL: env.url('MAINTENANCE_SERVICE_URL', http),
    INVENTORY_SERVICE_URL: env.url('INVENTORY_SERVICE_URL', http),
    NOTIFICATION_SERVICE_URL: env.url('NOTIFICATION_SERVICE_URL', http),
    CORS_ORIGINS: env.string('CORS_ORIGINS', 'http://localhost:5173'),
    LOGIN_RATE_LIMIT: env.int('LOGIN_RATE_LIMIT', {
      default: 10,
      min: 1,
      max: 10000,
    }),
    LOGIN_RATE_LIMIT_WINDOW_MS: env.int('LOGIN_RATE_LIMIT_WINDOW_MS', {
      default: 15 * 60 * 1000,
      min: 1,
      max: 24 * 60 * 60 * 1000,
    }),
  });
}
