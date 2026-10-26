import { readJwtEnv, type JwtEnv } from '@pbl6/auth';
import { EnvReader, type NodeEnv } from '@pbl6/service-kit';

export interface AppEnv extends JwtEnv {
  NODE_ENV: NodeEnv;
  PORT: number;
  WORKORDER_DATABASE_URL: string;
  IDENTITY_SERVICE_URL: string;
  ORGANIZATION_SERVICE_URL: string;
  ASSET_SERVICE_URL: string;
  SERVICE_REQUEST_SERVICE_URL: string;
  RABBITMQ_URL?: string;
}
export const PORT_VARIABLE = 'WORKORDER_SERVICE_PORT';
export function validateEnv(raw: Record<string, unknown>): AppEnv {
  const env = new EnvReader(raw);
  const nodeEnv = env.nodeEnv();
  const broker = env.optionalUrl('RABBITMQ_URL', ['amqp:', 'amqps:']);
  if (nodeEnv === 'production' && !broker)
    env.fail('RABBITMQ_URL is required in production');
  return env.done({
    NODE_ENV: nodeEnv,
    PORT: env.port(PORT_VARIABLE, 3004),
    WORKORDER_DATABASE_URL: env.postgresUrl('WORKORDER_DATABASE_URL'),
    IDENTITY_SERVICE_URL: env.url('IDENTITY_SERVICE_URL', ['http:', 'https:']),
    ORGANIZATION_SERVICE_URL: env.url('ORGANIZATION_SERVICE_URL', [
      'http:',
      'https:',
    ]),
    ASSET_SERVICE_URL: env.url('ASSET_SERVICE_URL', ['http:', 'https:']),
    SERVICE_REQUEST_SERVICE_URL: env.url('SERVICE_REQUEST_SERVICE_URL', [
      'http:',
      'https:',
    ]),
    ...(broker ? { RABBITMQ_URL: broker } : {}),
    ...readJwtEnv(env),
  });
}
