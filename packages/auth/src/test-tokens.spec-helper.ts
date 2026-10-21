import jwt from 'jsonwebtoken';

export const SECRET = 'unit-test-secret-unit-test-secret-0123';
export const OPTIONS = { secret: SECRET, issuer: 'pbl6-identity', audience: 'pbl6' };
export const TENANT = '11111111-1111-4111-8111-111111111111';
export const CUSTOMER = '22222222-2222-4222-8222-222222222222';
export const USER = '33333333-3333-4333-8333-333333333333';
export const SESSION = '44444444-4444-4444-8444-444444444444';

export function sign(
  claims: Record<string, unknown> = {},
  options: jwt.SignOptions = {},
  secret = SECRET,
): string {
  return jwt.sign(
    {
      sub: USER,
      sid: SESSION,
      tenant_id: TENANT,
      user_type: 'TENANT_STAFF',
      roles: ['DISPATCHER'],
      customer_id: null,
      ...claims,
    },
    secret,
    { algorithm: 'HS256', issuer: 'pbl6-identity', audience: 'pbl6', expiresIn: 900, ...options },
  );
}
