import { execFileSync } from 'node:child_process';
import { Client } from 'pg';
import { resolve } from 'node:path';
import { testDatabaseUrl } from './test-env';

export default async function globalSetup(): Promise<void> {
  const url = testDatabaseUrl();
  const client = new Client({ connectionString: url });
  try {
    await client.connect();
    const result = await client.query('SELECT current_database() AS name');
    if (result.rows[0]?.name !== 'notification_test_db') {
      throw new Error(
        'Refusing to migrate a database other than notification_test_db',
      );
    }
  } finally {
    await client.end();
  }
  execFileSync(
    process.execPath,
    [
      resolve(__dirname, '../../../node_modules/prisma/build/index.js'),
      'migrate',
      'deploy',
    ],
    {
      stdio: 'inherit',
      env: { ...process.env, NOTIFICATION_DATABASE_URL: url },
    },
  );
}
