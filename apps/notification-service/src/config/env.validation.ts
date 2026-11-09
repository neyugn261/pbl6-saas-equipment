import { readJwtEnv, type JwtEnv } from '@pbl6/auth';
import { EnvReader, type NodeEnv } from '@pbl6/service-kit';

export interface AppEnv extends JwtEnv {
  NODE_ENV: NodeEnv;
  PORT: number;
  NOTIFICATION_DATABASE_URL: string;
  ORGANIZATION_SERVICE_URL: string;
  RABBITMQ_URL?: string;
}

export const PORT_VARIABLE = 'NOTIFICATION_SERVICE_PORT';
const DEFAULT_PORT = 3005;

export function validateEnv(raw: Record<string, unknown>): AppEnv {
  const env = new EnvReader(raw);
  const nodeEnv = env.nodeEnv();
  const rabbitMqUrl = env.optionalUrl('RABBITMQ_URL', ['amqp:', 'amqps:']);
  if (nodeEnv === 'production' && !rabbitMqUrl) {
    env.fail('RABBITMQ_URL is required in production');
  }
  return env.done({
    NODE_ENV: nodeEnv,
    ORGANIZATION_SERVICE_URL: env.url('ORGANIZATION_SERVICE_URL', [
      'http:',
      'https:',
    ]),
    PORT: env.port(PORT_VARIABLE, DEFAULT_PORT),
    NOTIFICATION_DATABASE_URL: env.postgresUrl('NOTIFICATION_DATABASE_URL'),
    ...(rabbitMqUrl ? { RABBITMQ_URL: rabbitMqUrl } : {}),
    ...readJwtEnv(env),
  });
}
