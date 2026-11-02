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
  INVENTORY_SERVICE_URL?: string;
  RABBITMQ_URL?: string;
  WORKORDER_ATTACHMENTS_ENABLED: boolean;
  WORKORDER_ATTACHMENT_WORKER_ENABLED: boolean;
  MINIO_ENDPOINT?: string;
  MINIO_PORT?: number;
  MINIO_USE_SSL: boolean;
  MINIO_REGION?: string;
  MINIO_PUBLIC_ENDPOINT?: string;
  MINIO_ACCESS_KEY?: string;
  MINIO_SECRET_KEY?: string;
  WORKORDER_ATTACHMENT_BUCKET?: string;
}
export const PORT_VARIABLE = 'WORKORDER_SERVICE_PORT';
export function validateEnv(raw: Record<string, unknown>): AppEnv {
  const env = new EnvReader(raw);
  const nodeEnv = env.nodeEnv();
  const broker = env.optionalUrl('RABBITMQ_URL', ['amqp:', 'amqps:']);
  if (nodeEnv === 'production' && !broker)
    env.fail('RABBITMQ_URL is required in production');
  const enabled =
    env.oneOf('WORKORDER_ATTACHMENTS_ENABLED', ['true', 'false'], 'false') ===
    'true';
  const useSSL =
    env.oneOf('MINIO_USE_SSL', ['true', 'false'], 'false') === 'true';
  const worker =
    env.oneOf(
      'WORKORDER_ATTACHMENT_WORKER_ENABLED',
      ['true', 'false'],
      nodeEnv === 'test' ? 'false' : 'true',
    ) === 'true';
  const storage: Partial<AppEnv> = {};
  if (enabled) {
    storage.MINIO_ENDPOINT = env.string('MINIO_ENDPOINT');
    storage.MINIO_PORT = env.port('MINIO_PORT', useSSL ? 443 : 9000);
    storage.MINIO_REGION = env.string('MINIO_REGION');
    storage.MINIO_ACCESS_KEY = env.string('MINIO_ACCESS_KEY');
    storage.MINIO_SECRET_KEY = env.string('MINIO_SECRET_KEY');
    storage.MINIO_PUBLIC_ENDPOINT = env.url('MINIO_PUBLIC_ENDPOINT', [
      'http:',
      'https:',
    ]);
    storage.WORKORDER_ATTACHMENT_BUCKET = env.string(
      'WORKORDER_ATTACHMENT_BUCKET',
    );
    try {
      const internal = new URL(
        `${useSSL ? 'https' : 'http'}://${storage.MINIO_ENDPOINT}:${storage.MINIO_PORT}`,
      );
      const publicURL = new URL(storage.MINIO_PUBLIC_ENDPOINT);
      if (
        internal.hostname !== storage.MINIO_ENDPOINT ||
        internal.username ||
        internal.password ||
        internal.pathname !== '/' ||
        internal.search ||
        internal.hash
      )
        env.fail(
          'MINIO_ENDPOINT must be a hostname without credentials, path or scheme',
        );
      if (
        publicURL.username ||
        publicURL.password ||
        publicURL.pathname !== '/' ||
        publicURL.search ||
        publicURL.hash
      )
        env.fail(
          'MINIO_PUBLIC_ENDPOINT must be an origin without credentials, path or query',
        );
      if (
        nodeEnv === 'production' &&
        (!useSSL || publicURL.protocol !== 'https:')
      )
        env.fail('Attachment storage requires HTTPS in production');
    } catch {
      env.fail('Attachment storage endpoints must be valid');
    }
    if (
      !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(
        storage.WORKORDER_ATTACHMENT_BUCKET,
      ) ||
      storage.WORKORDER_ATTACHMENT_BUCKET.includes('..')
    )
      env.fail('WORKORDER_ATTACHMENT_BUCKET must be a valid S3 bucket name');
  }
  return env.done({
    ...storage,
    WORKORDER_ATTACHMENTS_ENABLED: enabled,
    WORKORDER_ATTACHMENT_WORKER_ENABLED: enabled && worker,
    MINIO_USE_SSL: useSSL,
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
    INVENTORY_SERVICE_URL: env.optionalUrl('INVENTORY_SERVICE_URL', [
      'http:',
      'https:',
    ]),
    ...(broker ? { RABBITMQ_URL: broker } : {}),
    ...readJwtEnv(env),
  });
}
