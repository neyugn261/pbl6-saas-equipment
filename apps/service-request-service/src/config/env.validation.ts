import { readJwtEnv, type JwtEnv } from '@pbl6/auth';
import { EnvReader, type NodeEnv } from '@pbl6/service-kit';

export interface AppEnv extends JwtEnv {
  NODE_ENV: NodeEnv;
  PORT: number;
  SERVICE_REQUEST_DATABASE_URL: string;
  ASSET_SERVICE_URL: string;
  RABBITMQ_URL?: string;
}

export const PORT_VARIABLE = 'SERVICE_REQUEST_SERVICE_PORT';
const DEFAULT_PORT = 3007;

/**
 * Validates environment variables at startup. Used by ConfigModule.forRoot,
 * so the service refuses to start with an invalid configuration.
 */
export function validateEnv(raw: Record<string, unknown>): AppEnv {
  const env = new EnvReader(raw);
  const nodeEnv = env.nodeEnv();
  const rabbitMqUrl = env.optionalUrl('RABBITMQ_URL', ['amqp:', 'amqps:']);
  if (nodeEnv === 'production' && !rabbitMqUrl) {
    env.fail('RABBITMQ_URL is required in production');
  }
  return env.done({
    NODE_ENV: nodeEnv,
    PORT: env.port(PORT_VARIABLE, DEFAULT_PORT),
    SERVICE_REQUEST_DATABASE_URL: env.postgresUrl(
      'SERVICE_REQUEST_DATABASE_URL',
    ),
    ASSET_SERVICE_URL: env.url('ASSET_SERVICE_URL', ['http:', 'https:']),
    ...(rabbitMqUrl ? { RABBITMQ_URL: rabbitMqUrl } : {}),
    ...readJwtEnv(env),
  });
}
