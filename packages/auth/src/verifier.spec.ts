import jwt from 'jsonwebtoken';
import { AccessTokenVerifier, bearerToken, InvalidAccessTokenError } from './verifier';
import { CUSTOMER, OPTIONS, sign, TENANT, USER } from './test-tokens.spec-helper';

const verifier = new AccessTokenVerifier(OPTIONS);

describe('AccessTokenVerifier', () => {
  it('turns a valid token into a principal with derived permissions', () => {
    const token = sign();
    const principal = verifier.verify(token);
    expect(principal).toMatchObject({
      userId: USER,
      tenantId: TENANT,
      userType: 'TENANT_STAFF',
      roles: ['DISPATCHER'],
      customerId: null,
      accessToken: token,
    });
    expect(principal.permissions.has('work_order:assign')).toBe(true);
    expect(principal.permissions.has('work_order:manage')).toBe(false);
    expect(principal.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('accepts a customer account with its customer id', () => {
    const principal = verifier.verify(
      sign({ user_type: 'CUSTOMER', roles: ['CUSTOMER_USER'], customer_id: CUSTOMER }),
    );
    expect(principal.customerId).toBe(CUSTOMER);
  });

  it('treats a missing customer_id claim (older tokens) as null', () => {
    const principal = verifier.verify(sign({ customer_id: undefined }));
    expect(principal.customerId).toBeNull();
  });

  it.each([
    ['another secret', () => sign({}, {}, 'another-secret-another-secret-0123456')],
    ['wrong issuer', () => sign({}, { issuer: 'evil' })],
    ['wrong audience', () => sign({}, { audience: 'other' })],
    ['expired', () => sign({}, { expiresIn: -10 })],
    ['alg none', () => jwt.sign({ sub: USER }, '', { algorithm: 'none' })],
    ['HS512', () => sign({}, { algorithm: 'HS512' })],
    ['garbage', () => 'not.a.token'],
  ])('rejects a token with %s', (_name, make) => {
    expect(() => verifier.verify(make())).toThrow(InvalidAccessTokenError);
  });

  it.each([
    ['unknown role', { roles: ['SUPER_ADMIN'] }],
    ['unknown user type', { user_type: 'ROOT' }],
    ['platform staff with a tenant', { user_type: 'PLATFORM_STAFF', roles: ['PLATFORM_ADMIN'] }],
    ['tenant staff without a tenant', { tenant_id: null }],
    ['customer id on a staff account', { customer_id: CUSTOMER }],
    ['non-uuid customer id', { user_type: 'CUSTOMER', roles: ['CUSTOMER_USER'], customer_id: 'abc' }],
    ['non-uuid subject', { sub: 'admin' }],
  ])('rejects inconsistent claims: %s', (_name, claims) => {
    expect(() => verifier.verify(sign(claims))).toThrow(InvalidAccessTokenError);
  });
});

describe('bearerToken', () => {
  it('extracts only well-formed bearer headers', () => {
    expect(bearerToken('Bearer abc')).toBe('abc');
    expect(bearerToken('bearer abc')).toBeNull();
    expect(bearerToken('Bearer')).toBeNull();
    expect(bearerToken('Bearer a b')).toBeNull();
    expect(bearerToken(undefined)).toBeNull();
  });
});
