import { EnvReader } from './env';

describe('EnvReader', () => {
  it('returns values and defaults when everything is valid', () => {
    const env = new EnvReader({
      NODE_ENV: 'test',
      X_PORT: '4000',
      X_DATABASE_URL: 'postgresql://u:p@localhost:5432/x_db',
    });
    expect(
      env.done({
        NODE_ENV: env.nodeEnv(),
        PORT: env.port('X_PORT', 3000),
        DB: env.postgresUrl('X_DATABASE_URL'),
        NAME: env.string('X_NAME', 'fallback'),
        TTL: env.int('X_TTL', { default: 60, min: 1, max: 100 }),
      }),
    ).toEqual({
      NODE_ENV: 'test',
      PORT: 4000,
      DB: 'postgresql://u:p@localhost:5432/x_db',
      NAME: 'fallback',
      TTL: 60,
    });
  });

  it('reports every problem at once', () => {
    const env = new EnvReader({ NODE_ENV: 'staging', X_PORT: 'abc', X_DB: 'mysql://h/db' });
    env.nodeEnv();
    env.port('X_PORT', 3000);
    env.postgresUrl('X_DB');
    env.string('X_REQUIRED');
    expect(() => env.done({})).toThrow(
      /NODE_ENV must be one of[\s\S]*X_PORT must be an integer between 1 and 65535[\s\S]*X_DB must be a postgresql:\/\/ URL[\s\S]*X_REQUIRED is required/,
    );
  });

  it('treats blank strings as missing', () => {
    const env = new EnvReader({ X: '   ' });
    env.string('X');
    expect(() => env.done({})).toThrow('X is required');
  });

  it('validates URLs and their scheme', () => {
    const env = new EnvReader({ A: 'amqp://h:5672', B: 'not a url', C: 'ftp://h' });
    expect(env.url('A', ['amqp:', 'amqps:'])).toBe('amqp://h:5672');
    env.url('B', ['http:']);
    env.url('C', ['http:', 'https:']);
    expect(env.optionalUrl('D', ['http:'])).toBeUndefined();
    expect(() => env.done({})).toThrow(/B must be an absolute URL[\s\S]*C must use http: or https:/);
  });

  it('checks enumerations', () => {
    const env = new EnvReader({ LEVEL: 'loud' });
    expect(env.oneOf('MODE', ['a', 'b'], 'a')).toBe('a');
    env.oneOf('LEVEL', ['log', 'warn'], 'log');
    expect(() => env.done({})).toThrow('LEVEL must be one of log, warn');
  });
});
