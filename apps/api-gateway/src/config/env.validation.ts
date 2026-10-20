const NODE_ENVS = ['development', 'test', 'production'] as const;

export type NodeEnv = (typeof NODE_ENVS)[number];

export interface AppEnv {
  NODE_ENV: NodeEnv;
  PORT: number;
  // Service URLs
  IDENTITY_SERVICE_URL: string;
  ORGANIZATION_SERVICE_URL: string;
  ASSET_SERVICE_URL: string;
  SERVICE_REQUEST_SERVICE_URL: string;
  WORKORDER_SERVICE_URL: string;
  MAINTENANCE_SERVICE_URL: string;
  INVENTORY_SERVICE_URL: string;
  NOTIFICATION_SERVICE_URL: string;
  // CORS — comma-separated list of allowed origins
  CORS_ORIGINS: string;
  // Rate limiting for auth endpoints
  LOGIN_RATE_LIMIT: number;
  LOGIN_RATE_LIMIT_WINDOW_MS: number;
}

export const PORT_VARIABLE = 'API_GATEWAY_PORT';
const DEFAULT_PORT = 3000;

/**
 * Validates environment variables at startup. Used by ConfigModule.forRoot,
 * so the application refuses to start with an invalid configuration.
 */
export function validateEnv(raw: Record<string, unknown>): AppEnv {
  const errors: string[] = [];

  const nodeEnv = (raw.NODE_ENV ?? 'development') as NodeEnv;
  if (!NODE_ENVS.includes(nodeEnv)) {
    errors.push(`NODE_ENV must be one of ${NODE_ENVS.join(', ')}`);
  }

  const rawPort = raw[PORT_VARIABLE] ?? String(DEFAULT_PORT);
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    errors.push(`${PORT_VARIABLE} must be an integer between 1 and 65535`);
  }

  if (errors.length > 0) {
    throw new Error(
      `Invalid environment configuration:\n- ${errors.join('\n- ')}`,
    );
  }

  return {
    NODE_ENV: nodeEnv,
    PORT: port,
    // Service URLs — defaults to localhost for local development
    IDENTITY_SERVICE_URL: String(
      raw.IDENTITY_SERVICE_URL ?? 'http://localhost:3001',
    ),
    ORGANIZATION_SERVICE_URL: String(
      raw.ORGANIZATION_SERVICE_URL ?? 'http://localhost:3006',
    ),
    ASSET_SERVICE_URL: String(
      raw.ASSET_SERVICE_URL ?? 'http://localhost:3002',
    ),
    SERVICE_REQUEST_SERVICE_URL: String(
      raw.SERVICE_REQUEST_SERVICE_URL ?? 'http://localhost:3007',
    ),
    WORKORDER_SERVICE_URL: String(
      raw.WORKORDER_SERVICE_URL ?? 'http://localhost:3004',
    ),
    MAINTENANCE_SERVICE_URL: String(
      raw.MAINTENANCE_SERVICE_URL ?? 'http://localhost:3003',
    ),
    INVENTORY_SERVICE_URL: String(
      raw.INVENTORY_SERVICE_URL ?? 'http://localhost:3008',
    ),
    NOTIFICATION_SERVICE_URL: String(
      raw.NOTIFICATION_SERVICE_URL ?? 'http://localhost:3005',
    ),
    // CORS
    CORS_ORIGINS: String(raw.CORS_ORIGINS ?? 'http://localhost:3000'),
    // Rate limit: 10 requests per 15 minutes for auth endpoints
    LOGIN_RATE_LIMIT: Number(raw.LOGIN_RATE_LIMIT ?? 10),
    LOGIN_RATE_LIMIT_WINDOW_MS: Number(
      raw.LOGIN_RATE_LIMIT_WINDOW_MS ?? 15 * 60 * 1000,
    ),
  };
}
