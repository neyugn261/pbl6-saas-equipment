import { readJwtEnv, type JwtEnv } from '@pbl6/auth';
import { EnvReader, type NodeEnv } from '@pbl6/service-kit';

export interface AppEnv extends JwtEnv {
  NODE_ENV: NodeEnv;
  PORT: number;
  INVENTORY_DATABASE_URL: string;
  ORGANIZATION_SERVICE_URL: string;
  WORKORDER_SERVICE_URL: string;
  ASSET_SERVICE_URL?: string;
  RABBITMQ_URL?: string;
}
export const PORT_VARIABLE = 'INVENTORY_SERVICE_PORT';
export function validateEnv(raw: Record<string, unknown>): AppEnv {
  const env = new EnvReader(raw);
  return env.done({
    NODE_ENV: env.nodeEnv(),
    PORT: env.port(PORT_VARIABLE, 3008),
    INVENTORY_DATABASE_URL: env.postgresUrl('INVENTORY_DATABASE_URL'),
    ORGANIZATION_SERVICE_URL: env.url('ORGANIZATION_SERVICE_URL', [
      'http:',
      'https:',
    ]),
    WORKORDER_SERVICE_URL: env.url('WORKORDER_SERVICE_URL', [
      'http:',
      'https:',
    ]),
    RABBITMQ_URL: env.optionalUrl('RABBITMQ_URL', ['amqp:', 'amqps:']),
    ASSET_SERVICE_URL: env.optionalUrl('ASSET_SERVICE_URL', [
      'http:',
      'https:',
    ]),
    ...readJwtEnv(env),
  });
}
