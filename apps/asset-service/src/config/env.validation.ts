import { readJwtEnv, type JwtEnv } from '@pbl6/auth';
import { EnvReader, type NodeEnv } from '@pbl6/service-kit';

export interface AppEnv extends JwtEnv {
  NODE_ENV: NodeEnv;
  MODEL_POLICIES_ENABLED: 'true' | 'false';
  PORT: number;
  ASSET_DATABASE_URL: string;
  ORGANIZATION_SERVICE_URL: string;
  ASSET_QR_PORTAL_BASE_URL: string;
  RABBITMQ_URL?: string;
  SERVICE_REQUEST_SERVICE_URL?: string;
  WORKORDER_SERVICE_URL?: string;
  MAINTENANCE_SERVICE_URL?: string;
  INVENTORY_SERVICE_URL?: string;
  IDENTITY_SERVICE_URL?: string;
}

export const PORT_VARIABLE = 'ASSET_SERVICE_PORT';
const DEFAULT_PORT = 3002;

/**
 * Validates environment variables at startup. Used by ConfigModule.forRoot,
 * so the service refuses to start with an invalid configuration.
 */
export function validateEnv(raw: Record<string, unknown>): AppEnv {
  const env = new EnvReader(raw);
  return env.done({
    NODE_ENV: env.nodeEnv(),
    MODEL_POLICIES_ENABLED: env.oneOf(
      'MODEL_POLICIES_ENABLED',
      ['true', 'false'] as const,
      'true',
    ),
    IDENTITY_SERVICE_URL: env.optionalUrl('IDENTITY_SERVICE_URL', ['http:', 'https:']),
    PORT: env.port(PORT_VARIABLE, DEFAULT_PORT),
    ASSET_DATABASE_URL: env.postgresUrl('ASSET_DATABASE_URL'),
    ORGANIZATION_SERVICE_URL: env.url('ORGANIZATION_SERVICE_URL', [
      'http:',
      'https:',
    ]),
    ASSET_QR_PORTAL_BASE_URL: env.url('ASSET_QR_PORTAL_BASE_URL', [
      'http:',
      'https:',
    ]),
    RABBITMQ_URL: env.optionalUrl('RABBITMQ_URL', ['amqp:', 'amqps:']),
    SERVICE_REQUEST_SERVICE_URL: env.optionalUrl(
      'SERVICE_REQUEST_SERVICE_URL',
      ['http:', 'https:'],
    ),
    WORKORDER_SERVICE_URL: env.optionalUrl('WORKORDER_SERVICE_URL', [
      'http:',
      'https:',
    ]),
    MAINTENANCE_SERVICE_URL: env.optionalUrl('MAINTENANCE_SERVICE_URL', [
      'http:',
      'https:',
    ]),
    INVENTORY_SERVICE_URL: env.optionalUrl('INVENTORY_SERVICE_URL', [
      'http:',
      'https:',
    ]),
    ...readJwtEnv(env),
  });
}
