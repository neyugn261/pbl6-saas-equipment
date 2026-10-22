import { escapeLike } from './validation';

describe('escapeLike', () => {
  it('makes LIKE wildcards and the escape character literal', () => {
    expect(escapeLike('100%')).toBe('100\\%');
    expect(escapeLike('a_b')).toBe('a\\_b');
    expect(escapeLike('c:\\temp')).toBe('c:\\\\temp');
    expect(escapeLike('plain')).toBe('plain');
  });
});
