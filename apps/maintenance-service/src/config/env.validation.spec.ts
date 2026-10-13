import { PORT_VARIABLE, validateEnv } from './env.validation';

describe('validateEnv', () => {
  it('uses the default port when none is configured', () => {
    expect(validateEnv({})).toEqual({ NODE_ENV: 'development', PORT: 3003 });
  });

  it('reads the service-specific port variable', () => {
    expect(validateEnv({ [PORT_VARIABLE]: '4100' }).PORT).toBe(4100);
  });

  it('rejects an invalid port', () => {
    expect(() => validateEnv({ [PORT_VARIABLE]: 'abc' })).toThrow(
      PORT_VARIABLE,
    );
  });

  it('rejects an unknown NODE_ENV', () => {
    expect(() => validateEnv({ NODE_ENV: 'staging' })).toThrow('NODE_ENV');
  });
});
