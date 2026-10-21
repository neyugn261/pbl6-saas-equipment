export const NODE_ENVS = ['development', 'test', 'production'] as const;
export type NodeEnv = (typeof NODE_ENVS)[number];

export interface IntOptions {
  default?: number;
  min: number;
  max: number;
}

/**
 * Collects every problem in the environment before failing, so a service
 * started with a bad `.env` reports all wrong variables at once.
 *
 * ```ts
 * export function validateEnv(raw: Record<string, unknown>): AssetEnv {
 *   const env = new EnvReader(raw);
 *   return env.done({
 *     NODE_ENV: env.nodeEnv(),
 *     PORT: env.port('ASSET_SERVICE_PORT', 3002),
 *     ASSET_DATABASE_URL: env.postgresUrl('ASSET_DATABASE_URL'),
 *   });
 * }
 * ```
 */
export class EnvReader {
  private readonly errors: string[] = [];

  constructor(private readonly raw: Record<string, unknown>) {}

  nodeEnv(): NodeEnv {
    const value = (this.raw.NODE_ENV ?? 'development') as NodeEnv;
    if (!NODE_ENVS.includes(value)) {
      this.fail(`NODE_ENV must be one of ${NODE_ENVS.join(', ')}`);
    }
    return value;
  }

  /** Required unless a default is given; blank values count as missing. */
  string(name: string, fallback?: string): string {
    const value = this.raw[name] ?? fallback;
    if (typeof value !== 'string' || value.trim() === '') {
      this.fail(`${name} is required`);
      return '';
    }
    return value;
  }

  optionalString(name: string): string | undefined {
    const value = this.raw[name];
    if (value === undefined || value === '') {
      return undefined;
    }
    if (typeof value !== 'string') {
      this.fail(`${name} must be a string`);
      return undefined;
    }
    return value;
  }

  int(name: string, options: IntOptions): number {
    const value = Number(this.raw[name] ?? options.default);
    if (!Number.isInteger(value) || value < options.min || value > options.max) {
      this.fail(
        `${name} must be an integer between ${options.min} and ${options.max}`,
      );
    }
    return value;
  }

  port(name: string, fallback: number): number {
    return this.int(name, { default: fallback, min: 1, max: 65535 });
  }

  oneOf<T extends string>(name: string, values: readonly T[], fallback: T): T {
    const value = (this.raw[name] ?? fallback) as T;
    if (!values.includes(value)) {
      this.fail(`${name} must be one of ${values.join(', ')}`);
    }
    return value;
  }

  postgresUrl(name: string): string {
    const value = this.string(name);
    if (value && !/^postgres(ql)?:\/\//.test(value)) {
      this.fail(`${name} must be a postgresql:// URL`);
    }
    return value;
  }

  /** An absolute URL whose scheme is one of `protocols` (e.g. ['http:', 'https:']). */
  url(name: string, protocols: string[], fallback?: string): string {
    const value = this.string(name, fallback);
    if (!value) {
      return value;
    }
    try {
      if (!protocols.includes(new URL(value).protocol)) {
        this.fail(`${name} must use ${protocols.join(' or ')}`);
      }
    } catch {
      this.fail(`${name} must be an absolute URL`);
    }
    return value;
  }

  /** Same as `url`, but the variable may be left unset. */
  optionalUrl(name: string, protocols: string[]): string | undefined {
    if (this.optionalString(name) === undefined) {
      return undefined;
    }
    return this.url(name, protocols);
  }

  /** Records a custom problem found by the caller. */
  fail(message: string): void {
    this.errors.push(message);
  }

  /** Returns `env` when no problem was recorded; throws with all of them otherwise. */
  done<T>(env: T): T {
    if (this.errors.length > 0) {
      throw new Error(
        `Invalid environment configuration:\n- ${this.errors.join('\n- ')}`,
      );
    }
    return env;
  }
}
