const NODE_ENVS = ['development', 'test', 'production'] as const;

export type NodeEnv = (typeof NODE_ENVS)[number];

export interface IdentityEnv {
  NODE_ENV: NodeEnv;
  PORT: number;
  IDENTITY_DATABASE_URL: string;
  JWT_ACCESS_SECRET: string;
  JWT_ACCESS_TTL_SECONDS: number;
  JWT_ISSUER: string;
  JWT_AUDIENCE: string;
  REFRESH_TOKEN_TTL_DAYS: number;
  BCRYPT_COST: number;
}

export const PORT_VARIABLE = 'IDENTITY_SERVICE_PORT';
const DEFAULT_PORT = 3001;
const MIN_SECRET_LENGTH = 32;
const PLACEHOLDER_SECRETS = new Set(['CHANGE_ME', 'changeme', 'secret']);

function readInt(
  raw: Record<string, unknown>,
  name: string,
  fallback: number,
  min: number,
  max: number,
  errors: string[],
): number {
  const value = Number(raw[name] ?? fallback);
  if (!Number.isInteger(value) || value < min || value > max) {
    errors.push(`${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function readString(
  raw: Record<string, unknown>,
  name: string,
  errors: string[],
  fallback?: string,
): string {
  const value = raw[name] ?? fallback;
  if (typeof value !== 'string' || value.trim() === '') {
    errors.push(`${name} is required`);
    return '';
  }
  return value;
}

/**
 * Validates environment variables at startup. Used by ConfigModule.forRoot,
 * so the service refuses to start with a missing or weak configuration.
 */
export function validateEnv(raw: Record<string, unknown>): IdentityEnv {
  const errors: string[] = [];

  const nodeEnv = (raw.NODE_ENV ?? 'development') as NodeEnv;
  if (!NODE_ENVS.includes(nodeEnv)) {
    errors.push(`NODE_ENV must be one of ${NODE_ENVS.join(', ')}`);
  }

  const databaseUrl = readString(raw, 'IDENTITY_DATABASE_URL', errors);
  if (databaseUrl && !/^postgres(ql)?:\/\//.test(databaseUrl)) {
    errors.push('IDENTITY_DATABASE_URL must be a postgresql:// URL');
  }

  const secret = readString(raw, 'JWT_ACCESS_SECRET', errors);
  if (
    secret &&
    (secret.length < MIN_SECRET_LENGTH || PLACEHOLDER_SECRETS.has(secret))
  ) {
    errors.push(
      `JWT_ACCESS_SECRET must be a random value of at least ${MIN_SECRET_LENGTH} characters`,
    );
  }

  // Low bcrypt costs are only allowed in tests, where they keep the suite fast.
  const minBcryptCost = nodeEnv === 'test' ? 4 : 10;

  const env: IdentityEnv = {
    NODE_ENV: nodeEnv,
    PORT: readInt(raw, PORT_VARIABLE, DEFAULT_PORT, 1, 65535, errors),
    IDENTITY_DATABASE_URL: databaseUrl,
    JWT_ACCESS_SECRET: secret,
    JWT_ACCESS_TTL_SECONDS: readInt(
      raw,
      'JWT_ACCESS_TTL_SECONDS',
      900,
      60,
      3600,
      errors,
    ),
    JWT_ISSUER: readString(raw, 'JWT_ISSUER', errors, 'pbl6-identity'),
    JWT_AUDIENCE: readString(raw, 'JWT_AUDIENCE', errors, 'pbl6'),
    REFRESH_TOKEN_TTL_DAYS: readInt(
      raw,
      'REFRESH_TOKEN_TTL_DAYS',
      7,
      1,
      90,
      errors,
    ),
    BCRYPT_COST: readInt(raw, 'BCRYPT_COST', 12, minBcryptCost, 15, errors),
  };

  if (errors.length > 0) {
    throw new Error(
      `Invalid environment configuration:\n- ${errors.join('\n- ')}`,
    );
  }
  return env;
}
