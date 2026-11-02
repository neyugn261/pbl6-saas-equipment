import { PORT_VARIABLE, validateEnv } from './env.validation';

const validEnv = {
  JWT_ACCESS_SECRET: 'test-secret-with-more-than-thirty-two-characters',
  NOTIFICATION_DATABASE_URL: 'postgresql://localhost/notification_db',
};

describe('validateEnv', () => {
  it('uses the default port when none is configured', () => {
    expect(validateEnv(validEnv)).toEqual({
      NODE_ENV: 'development',
      PORT: 3005,
      NOTIFICATION_DATABASE_URL: validEnv.NOTIFICATION_DATABASE_URL,
      JWT_ACCESS_SECRET: validEnv.JWT_ACCESS_SECRET,
      JWT_ISSUER: 'pbl6-identity',
      JWT_AUDIENCE: 'pbl6',
    });
  });

  it('reads the service-specific port variable', () => {
    expect(validateEnv({ ...validEnv, [PORT_VARIABLE]: '4100' }).PORT).toBe(
      4100,
    );
  });

  it('rejects an invalid port', () => {
    expect(() =>
      validateEnv({ ...validEnv, [PORT_VARIABLE]: 'abc' }),
    ).toThrow(PORT_VARIABLE);
  });

  it('rejects an unknown NODE_ENV', () => {
    expect(() =>
      validateEnv({ ...validEnv, NODE_ENV: 'staging' }),
    ).toThrow('NODE_ENV');
  });
});
