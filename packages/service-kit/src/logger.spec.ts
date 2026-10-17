import { runWithCorrelationId } from './correlation';
import { JsonLogger, redact } from './logger';

function capture(level?: 'log' | 'debug') {
  const lines: Record<string, unknown>[] = [];
  const logger = new JsonLogger('test-service', {
    level,
    write: (line) => lines.push(JSON.parse(line) as Record<string, unknown>),
  });
  return { logger, lines };
}

describe('redact', () => {
  it('hides sensitive keys at any depth', () => {
    expect(
      redact({
        email: 'a@b.c',
        password: 'p',
        nested: { refreshToken: 't', authorization: 'Bearer x', ok: 1 },
        list: [{ passwordHash: 'h' }],
      }),
    ).toEqual({
      email: 'a@b.c',
      password: '[REDACTED]',
      nested: { refreshToken: '[REDACTED]', authorization: '[REDACTED]', ok: 1 },
      list: [{ passwordHash: '[REDACTED]' }],
    });
  });
});

describe('JsonLogger', () => {
  it('writes one JSON line with service, level, context and message', () => {
    const { logger, lines } = capture();
    logger.log('started', 'Bootstrap');
    expect(lines).toEqual([
      expect.objectContaining({
        level: 'log',
        service: 'test-service',
        context: 'Bootstrap',
        msg: 'started',
      }),
    ]);
    expect(typeof lines[0].time).toBe('string');
  });

  it('adds the correlation id of the current request', () => {
    const { logger, lines } = capture();
    runWithCorrelationId('req-1', () => logger.warn('slow'));
    expect(lines[0]).toMatchObject({ level: 'warn', correlationId: 'req-1' });
  });

  it('merges redacted object messages', () => {
    const { logger, lines } = capture();
    logger.log({ msg: 'login failed', email: 'a@b.c', password: 'secret' });
    expect(lines[0]).toMatchObject({ msg: 'login failed', email: 'a@b.c', password: '[REDACTED]' });
  });

  it('separates stack and context for errors', () => {
    const { logger, lines } = capture();
    const error = new Error('boom');
    logger.error('request failed', error.stack, 'HttpErrorFilter');
    expect(lines[0]).toMatchObject({ level: 'error', msg: 'request failed', context: 'HttpErrorFilter' });
    expect(String(lines[0].stack)).toContain('boom');
    logger.error(error);
    expect(lines[1]).toMatchObject({ msg: 'boom' });
    expect(String(lines[1].stack)).toContain('Error: boom');
  });

  it('drops levels below the configured one', () => {
    const { logger, lines } = capture('log');
    logger.debug('hidden');
    logger.verbose('hidden');
    logger.log('shown');
    expect(lines.map((line) => line.msg)).toEqual(['shown']);
    logger.setLogLevels(['debug', 'log']);
    logger.debug('now shown');
    expect(lines).toHaveLength(2);
  });
});
