import { readJwtEnv, type JwtEnv } from '@pbl6/auth';
import { EnvReader, type NodeEnv } from '@pbl6/service-kit';

export interface IdentityEnv extends JwtEnv {
  NODE_ENV: NodeEnv;
  PORT: number;
  IDENTITY_DATABASE_URL: string;
  JWT_ACCESS_TTL_SECONDS: number;
  REFRESH_TOKEN_TTL_DAYS: number;
  BCRYPT_COST: number;
  IDENTITY_EXPOSE_ACTIVATION_TOKEN: boolean;
  /** Unset = event consumers disabled (e2e tests, running without RabbitMQ). */
  RABBITMQ_URL: string | undefined;
}

export const PORT_VARIABLE = 'IDENTITY_SERVICE_PORT';
const DEFAULT_PORT = 3001;

/**
 * Validates environment variables at startup. Used by ConfigModule.forRoot,
 * so the service refuses to start with a missing or weak configuration.
 */
export function validateEnv(raw: Record<string, unknown>): IdentityEnv {
  const env = new EnvReader(raw);
  const nodeEnv = env.nodeEnv();
  const database = env.postgresUrl('IDENTITY_DATABASE_URL');
  const jwt = readJwtEnv(env);
  // Low bcrypt costs are only allowed in tests, where they keep the suite fast.
  const minBcryptCost = nodeEnv === 'test' ? 4 : 10;
  const exposeValue = raw.IDENTITY_EXPOSE_ACTIVATION_TOKEN ?? 'false';
  if (exposeValue !== 'true' && exposeValue !== 'false') {
    env.fail('IDENTITY_EXPOSE_ACTIVATION_TOKEN must be true or false');
  }
  const exposeActivationToken = exposeValue === 'true';
  if (nodeEnv === 'production' && exposeActivationToken) {
    env.fail('IDENTITY_EXPOSE_ACTIVATION_TOKEN cannot be enabled in production');
  }

  return env.done({
    NODE_ENV: nodeEnv,
    PORT: env.port(PORT_VARIABLE, DEFAULT_PORT),
    IDENTITY_DATABASE_URL: database,
    ...jwt,
    JWT_ACCESS_TTL_SECONDS: env.int('JWT_ACCESS_TTL_SECONDS', {
      default: 900,
      min: 60,
      max: 3600,
    }),
    REFRESH_TOKEN_TTL_DAYS: env.int('REFRESH_TOKEN_TTL_DAYS', {
      default: 7,
      min: 1,
      max: 90,
    }),
    BCRYPT_COST: env.int('BCRYPT_COST', {
      default: 12,
      min: minBcryptCost,
      max: 15,
    }),
    IDENTITY_EXPOSE_ACTIVATION_TOKEN: exposeActivationToken,
    RABBITMQ_URL: env.optionalUrl('RABBITMQ_URL', ['amqp:', 'amqps:']),
  });
}
