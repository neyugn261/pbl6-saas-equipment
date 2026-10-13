const NODE_ENVS = ['development', 'test', 'production'] as const;

export type NodeEnv = (typeof NODE_ENVS)[number];

export interface AppEnv {
  NODE_ENV: NodeEnv;
  PORT: number;
}

export const PORT_VARIABLE = 'IDENTITY_SERVICE_PORT';
const DEFAULT_PORT = 3001;

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

  return { NODE_ENV: nodeEnv, PORT: port };
}
