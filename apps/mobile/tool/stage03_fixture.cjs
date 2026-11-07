// Full test stack, reusing previous stages and adding real scoped Inventory flows.
process.argv.push('--notifications', '--parts');
require('./stage01_fixture.cjs');
