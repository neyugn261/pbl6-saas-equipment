import { readJwtEnv, type JwtEnv } from '@pbl6/auth';
import { EnvReader, type NodeEnv } from '@pbl6/service-kit';

export interface AppEnv extends JwtEnv {
  NODE_ENV: NodeEnv;
  PORT: number;
  ASSET_DATABASE_URL: string;
  ORGANIZATION_SERVICE_URL: string;
  ASSET_QR_PORTAL_BASE_URL: string;
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
    PORT: env.port(PORT_VARIABLE, DEFAULT_PORT),
    ASSET_DATABASE_URL: env.postgresUrl('ASSET_DATABASE_URL'),
    ORGANIZATION_SERVICE_URL: env.url('ORGANIZATION_SERVICE_URL', ['http:', 'https:']),
    ASSET_QR_PORTAL_BASE_URL: env.url('ASSET_QR_PORTAL_BASE_URL', ['http:', 'https:']),
    ...readJwtEnv(env),
  });
}
