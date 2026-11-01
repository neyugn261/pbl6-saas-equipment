const { config } = require('dotenv');
const {
  S3Client,
  HeadBucketCommand,
  CreateBucketCommand,
  GetBucketPolicyCommand,
  GetBucketAclCommand,
  PutBucketCorsCommand,
} = require('@aws-sdk/client-s3');
config({ path: '.env', quiet: true });
config({ path: '../../.env', quiet: true });
async function main() {
  const { validateEnv } = require('../dist/config/env.validation');
  const env = validateEnv(process.env);
  if (!env.WORKORDER_ATTACHMENTS_ENABLED)
    throw new Error('Enable WORKORDER_ATTACHMENTS_ENABLED before provisioning');
  const client = new S3Client({
    endpoint: `${env.MINIO_USE_SSL ? 'https' : 'http'}://${env.MINIO_ENDPOINT}:${env.MINIO_PORT}`,
    region: env.MINIO_REGION,
    forcePathStyle: true,
    maxAttempts: 1,
    credentials: {
      accessKeyId: env.MINIO_ACCESS_KEY,
      secretAccessKey: env.MINIO_SECRET_KEY,
    },
  });
  const Bucket = env.WORKORDER_ATTACHMENT_BUCKET;
  try {
    try {
      await client.send(new HeadBucketCommand({ Bucket }));
    } catch (error) {
      if (error.$metadata?.httpStatusCode !== 404) throw error;
      await client.send(new CreateBucketCommand({ Bucket }));
    }
    try {
      const policy = await client.send(new GetBucketPolicyCommand({ Bucket }));
      const statements = JSON.parse(policy.Policy || '{}').Statement || [];
      if (
        statements.some(
          (row) =>
            row.Effect === 'Allow' &&
            JSON.stringify(row.Principal).includes('*'),
        )
      )
        throw new Error('Public bucket policy is not permitted');
    } catch (error) {
      if (!['NoSuchBucketPolicy', 'NoSuchPolicy'].includes(error.name))
        throw error;
    }
    const acl = await client.send(new GetBucketAclCommand({ Bucket }));
    if (
      (acl.Grants || []).some(
        (grant) =>
          grant.Grantee?.URI?.includes('AllUsers') ||
          grant.Grantee?.URI?.includes('AuthenticatedUsers'),
      )
    )
      throw new Error('Public bucket ACL is not permitted');
    const origins = (process.env.CORS_ORIGINS || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    if (
      !origins.length ||
      origins.includes('*') ||
      origins.some((value) => {
        try {
          return new URL(value).origin !== value;
        } catch {
          return true;
        }
      })
    )
      throw new Error('CORS_ORIGINS must contain explicit web origins');
    await client.send(
      new PutBucketCorsCommand({
        Bucket,
        CORSConfiguration: {
          CORSRules: [
            {
              AllowedOrigins: origins,
              AllowedMethods: ['PUT', 'GET', 'HEAD'],
              AllowedHeaders: ['Content-Type'],
              ExposeHeaders: ['ETag'],
              MaxAgeSeconds: 300,
            },
          ],
        },
      }),
    );
    console.log(
      JSON.stringify({
        status: 'READY',
        privateBucket: true,
        corsConfigured: true,
      }),
    );
  } finally {
    client.destroy();
  }
}
main().catch(() => {
  console.error(
    'ATTACHMENT_PROVISIONING_FAILED: check validated environment, private bucket policy/ACL and explicit CORS origins',
  );
  process.exitCode = 1;
});
