// Reuse stage 0's scoped test stack, adding Notification and Identity bootstrap.
process.argv.push('--notifications');
require('./stage01_fixture.cjs');
