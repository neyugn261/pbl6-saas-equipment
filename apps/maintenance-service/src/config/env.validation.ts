import { readJwtEnv, type JwtEnv } from '@pbl6/auth';
import { EnvReader, type NodeEnv } from '@pbl6/service-kit';

export interface AppEnv extends JwtEnv {
  NODE_ENV: NodeEnv;
  PORT: number;
  MAINTENANCE_DATABASE_URL: string;
  ASSET_SERVICE_URL: string;
  RABBITMQ_URL?: string;
  MAINTENANCE_SCHEDULER_ENABLED: 'true' | 'false';
  MAINTENANCE_SCHEDULER_INTERVAL_MS: number;
}

export const PORT_VARIABLE = 'MAINTENANCE_SERVICE_PORT';
const DEFAULT_PORT = 3003;

/**
 * Validates environment variables at startup. Used by ConfigModule.forRoot,
 * so the application refuses to start with an invalid configuration.
 */
export function validateEnv(raw: Record<string, unknown>): AppEnv {
  const env = new EnvReader(raw);
  return env.done({
    NODE_ENV: env.nodeEnv(),
    PORT: env.port(PORT_VARIABLE, DEFAULT_PORT),
    MAINTENANCE_DATABASE_URL: env.postgresUrl('MAINTENANCE_DATABASE_URL'),
    ASSET_SERVICE_URL: env.url('ASSET_SERVICE_URL', ['http:', 'https:']),
    RABBITMQ_URL: env.optionalUrl('RABBITMQ_URL', ['amqp:', 'amqps:']),
    MAINTENANCE_SCHEDULER_ENABLED: env.oneOf('MAINTENANCE_SCHEDULER_ENABLED', ['true', 'false'] as const, 'true'),
    MAINTENANCE_SCHEDULER_INTERVAL_MS: env.int('MAINTENANCE_SCHEDULER_INTERVAL_MS', { min: 1000, max: 3600000, default: 60000 }),
    ...readJwtEnv(env),
  });
}
