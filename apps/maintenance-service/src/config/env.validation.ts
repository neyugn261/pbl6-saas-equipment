import { readJwtEnv, type JwtEnv } from '@pbl6/auth';
import { EnvReader, type NodeEnv } from '@pbl6/service-kit';

export interface AppEnv extends JwtEnv {
  NODE_ENV: NodeEnv;
  PORT: number;
  MAINTENANCE_DATABASE_URL: string;
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
    ...readJwtEnv(env),
  });
}
