import { applyTestEnv } from './test-env';

// Runs before each test file is imported: ConfigModule.forRoot validates the
// environment when AppModule is loaded, so it must already be in place.
applyTestEnv();
