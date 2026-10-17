import type { EnvReader } from '@pbl6/service-kit';

/** Settings every service needs to verify Identity access tokens. */
export interface JwtVerificationOptions {
  secret: string;
  issuer: string;
  audience: string;
}

export const MIN_JWT_SECRET_LENGTH = 32;
const PLACEHOLDER_SECRETS = new Set(['CHANGE_ME', 'changeme', 'secret']);

export interface JwtEnv {
  JWT_ACCESS_SECRET: string;
  JWT_ISSUER: string;
  JWT_AUDIENCE: string;
}

/**
 * Reads and validates the JWT variables; a service refuses to start with a
 * missing, placeholder or short secret.
 */
export function readJwtEnv(env: EnvReader): JwtEnv {
  const secret = env.string('JWT_ACCESS_SECRET');
  if (
    secret &&
    (secret.length < MIN_JWT_SECRET_LENGTH || PLACEHOLDER_SECRETS.has(secret))
  ) {
    env.fail(
      `JWT_ACCESS_SECRET must be a random value of at least ${MIN_JWT_SECRET_LENGTH} characters`,
    );
  }
  return {
    JWT_ACCESS_SECRET: secret,
    JWT_ISSUER: env.string('JWT_ISSUER', 'pbl6-identity'),
    JWT_AUDIENCE: env.string('JWT_AUDIENCE', 'pbl6'),
  };
}

/** Anything with `get(key)`, e.g. Nest's ConfigService. */
export interface ConfigLike {
  get(key: string): unknown;
}

export function jwtOptionsFromConfig(config: ConfigLike): JwtVerificationOptions {
  return {
    secret: String(config.get('JWT_ACCESS_SECRET')),
    issuer: String(config.get('JWT_ISSUER')),
    audience: String(config.get('JWT_AUDIENCE')),
  };
}
