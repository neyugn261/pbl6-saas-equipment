import { applyTestEnv } from './test-env';

// Runs before each test file is imported: ConfigModule.forRoot validates the
// environment when AppModule is loaded, so it must already be in place.
applyTestEnv();
if (process.env.IDENTITY_MAILPIT_SMOKE === '1') {
  process.env.IDENTITY_ACTIVATION_ENCRYPTION_KEY = 'ab'.repeat(32);
  process.env.IDENTITY_ACTIVATION_URL_BASE =
    'http://localhost:8080/activate#token=';
  process.env.SMTP_HOST = '127.0.0.1';
  process.env.SMTP_PORT ??= '1025';
  process.env.SMTP_FROM = 'PBL6 Test <no-reply@pbl6.local>';
}
