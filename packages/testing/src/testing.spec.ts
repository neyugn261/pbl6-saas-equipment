import { AccessTokenVerifier } from '@pbl6/auth';
import { requireTestDatabaseUrl } from './test-database';
import { signTestAccessToken, TEST_JWT_SECRET } from './tokens';

const verifier = new AccessTokenVerifier({
  secret: TEST_JWT_SECRET,
  issuer: 'pbl6-identity',
  audience: 'pbl6',
});
const TENANT = '11111111-1111-4111-8111-111111111111';
const CUSTOMER = '22222222-2222-4222-8222-222222222222';

describe('signTestAccessToken', () => {
  it('creates tokens the shared verifier accepts', () => {
    const staff = verifier.verify(signTestAccessToken({ role: 'DISPATCHER', tenantId: TENANT }));
    expect(staff).toMatchObject({ tenantId: TENANT, userType: 'TENANT_STAFF', customerId: null });

    const customer = verifier.verify(
      signTestAccessToken({ role: 'CUSTOMER_USER', tenantId: TENANT, customerId: CUSTOMER }),
    );
    expect(customer).toMatchObject({ userType: 'CUSTOMER', customerId: CUSTOMER });

    const platform = verifier.verify(signTestAccessToken({ role: 'PLATFORM_ADMIN' }));
    expect(platform.tenantId).toBeNull();
  });

  it('can create expired tokens and requires a tenant for tenant roles', () => {
    expect(() =>
      verifier.verify(signTestAccessToken({ role: 'TECHNICIAN', tenantId: TENANT, expiresIn: -5 })),
    ).toThrow();
    expect(() => signTestAccessToken({ role: 'TECHNICIAN' })).toThrow('tenantId');
  });
});

describe('requireTestDatabaseUrl', () => {
  afterEach(() => {
    delete process.env.ASSET_TEST_DATABASE_URL;
  });

  it('accepts only the owning service test database', () => {
    process.env.ASSET_TEST_DATABASE_URL = 'postgresql://u:p@localhost:5432/asset_test_db';
    expect(requireTestDatabaseUrl('ASSET_TEST_DATABASE_URL')).toContain('asset_test_db');
    process.env.ASSET_TEST_DATABASE_URL = 'postgresql://u:p@localhost:5432/asset_db';
    expect(() => requireTestDatabaseUrl('ASSET_TEST_DATABASE_URL')).toThrow('expected "asset_test_db"');
    process.env.ASSET_TEST_DATABASE_URL = 'postgresql://u:p@localhost:5432/other_test_db';
    expect(() => requireTestDatabaseUrl('ASSET_TEST_DATABASE_URL')).toThrow('expected "asset_test_db"');
    process.env.ASSET_TEST_DATABASE_URL = 'postgresql://u:p@localhost:5432/asset_test_db_backup';
    expect(() => requireTestDatabaseUrl('ASSET_TEST_DATABASE_URL')).toThrow('expected "asset_test_db"');
    process.env.ASSET_TEST_DATABASE_URL = 'https://localhost/asset_test_db';
    expect(() => requireTestDatabaseUrl('ASSET_TEST_DATABASE_URL')).toThrow('not a valid URL');
    delete process.env.ASSET_TEST_DATABASE_URL;
    expect(() => requireTestDatabaseUrl('ASSET_TEST_DATABASE_URL')).toThrow('is not set');
  });
});
