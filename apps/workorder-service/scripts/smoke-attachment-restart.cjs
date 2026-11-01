const assert = require('node:assert/strict');
const { randomUUID, createHash } = require('node:crypto');
const { fork } = require('node:child_process');
const { once } = require('node:events');
const { resolve } = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');
const { config } = require('dotenv');
const {
  requireTestDatabaseUrl,
  testJwtEnv,
  signTestAccessToken,
} = require('@pbl6/testing');
const {
  S3Client,
  CreateBucketCommand,
  DeleteBucketCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
  HeadObjectCommand,
} = require('@aws-sdk/client-s3');
config({ path: '.env', quiet: true });
config({ path: '../../.env', quiet: true });

async function main() {
  const testURL = requireTestDatabaseUrl('WORKORDER_TEST_DATABASE_URL');
  Object.assign(process.env, testJwtEnv(), {
    NODE_ENV: 'test',
    WORKORDER_DATABASE_URL: testURL,
    RABBITMQ_URL: '',
    WORKORDER_ATTACHMENTS_ENABLED: 'true',
    WORKORDER_ATTACHMENT_WORKER_ENABLED: 'false',
    WORKORDER_ATTACHMENT_BUCKET: `pbl6-wo-test-${randomUUID()}`,
    IDENTITY_SERVICE_URL: 'http://identity.test',
    ORGANIZATION_SERVICE_URL: 'http://organization.test',
    ASSET_SERVICE_URL: 'http://asset.test',
    SERVICE_REQUEST_SERVICE_URL: 'http://requests.test',
  });
  const { ConfigService } = require('@nestjs/config');
  const { validateEnv } = require('../dist/config/env.validation');
  const { PrismaService } = require('../dist/prisma/prisma.service');
  const env = validateEnv(process.env);
  const db = new PrismaService(new ConfigService(env));
  const admin = new S3Client({
    endpoint: `${env.MINIO_USE_SSL ? 'https' : 'http'}://${env.MINIO_ENDPOINT}:${env.MINIO_PORT}`,
    region: env.MINIO_REGION,
    forcePathStyle: true,
    credentials: {
      accessKeyId: env.MINIO_ACCESS_KEY,
      secretAccessKey: env.MINIO_SECRET_KEY,
    },
  });
  const Bucket = env.WORKORDER_ATTACHMENT_BUCKET;
  const tenantId = randomUUID();
  const children = new Set();
  let createdBucket = false;
  function message(child, accept) {
    return new Promise((resolveMessage, reject) => {
      const timeout = setTimeout(
        () => finish(new Error('Worker IPC timed out')),
        15000,
      );
      const received = (value) => {
        if (value.failed) finish(new Error('Worker claim failed'));
        else if (accept(value)) finish(null, value);
      };
      const exited = () =>
        finish(new Error('Worker exited before IPC response'));
      function finish(error, value) {
        clearTimeout(timeout);
        child.off('message', received);
        child.off('exit', exited);
        child.off('error', finish);
        if (error) reject(error);
        else resolveMessage(value);
      }
      child.on('message', received);
      child.once('exit', exited);
      child.once('error', finish);
    });
  }
  async function start(worker) {
    const child = fork(
      resolve('test/support/attachment-worker-process.cjs'),
      [],
      {
        env: {
          ...process.env,
          WORKORDER_ATTACHMENT_WORKER_ENABLED: String(worker),
        },
        stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
      },
    );
    children.add(child);
    const ready = await message(child, (value) => value.ready);
    return { child, url: ready.url };
  }
  async function kill(child) {
    if (child.pid && child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGKILL');
      await exited;
    }
    children.delete(child);
  }
  async function until(check) {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (await check()) return;
      await delay(100);
    }
    throw new Error('Restarted worker did not converge');
  }
  try {
    await db.$connect();
    await admin.send(new CreateBucketCommand({ Bucket }));
    createdBucket = true;
    const order = await db.workOrder.create({
      data: {
        tenantId,
        workOrderNo: `WO-A6-${randomUUID()}`,
        serviceRequestId: randomUUID(),
        equipmentId: randomUUID(),
        customerId: randomUUID(),
        type: 'REPAIR',
        title: 'A6 process restart fixture',
        status: 'IN_PROGRESS',
      },
    });
    const first = await start(false);
    const token = signTestAccessToken({ role: 'SERVICE_MANAGER', tenantId });
    const bytes = Buffer.from('%PDF-1.7\nA6 durable cleanup\n%%EOF');
    async function api(base, path, method = 'GET', body, key, expected = 200) {
      const result = await fetch(base + path, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...(key ? { 'Idempotency-Key': key } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      assert.equal(
        result.status,
        expected,
        `Unexpected response for ${method} ${path}`,
      );
      return expected === 204 ? null : result.json();
    }
    async function upload(finalize = true) {
      const ticket = await api(
        first.url,
        `/work-orders/${order.id}/attachment-uploads`,
        'POST',
        {
          fileName: 'restart.pdf',
          mimeType: 'application/pdf',
          sizeBytes: bytes.length,
          checksumSha256: createHash('sha256').update(bytes).digest('hex'),
        },
        randomUUID(),
        201,
      );
      assert.equal(
        (
          await fetch(ticket.uploadUrl, {
            method: 'PUT',
            headers: ticket.headers,
            body: bytes,
          })
        ).status,
        200,
      );
      const key = randomUUID();
      const file = finalize
        ? await api(
            first.url,
            `/attachment-uploads/${ticket.uploadId}/complete`,
            'POST',
            {},
            key,
          )
        : null;
      return { ticket, key, file };
    }
    const deleted = await upload();
    const live = await upload();
    const abandoned = await upload(false);
    await api(
      first.url,
      `/attachments/${deleted.file.id}`,
      'DELETE',
      undefined,
      undefined,
      204,
    );
    const deletedRow = await db.workOrderAttachment.findUniqueOrThrow({
      where: { id: deleted.file.id },
    });
    const job = await db.attachmentCleanupJob.update({
      where: { objectKey: deletedRow.storageKey },
      data: { notBefore: new Date(0) },
    });
    const claimedMessage = message(first.child, (value) => 'claimed' in value);
    first.child.send('claim');
    assert.equal((await claimedMessage).claimed, job.id);
    await kill(first.child); // No shutdown hook or in-memory retry can help.
    const crashed = await db.attachmentCleanupJob.findUniqueOrThrow({
      where: { id: job.id },
    });
    assert.equal(crashed.status, 'CLAIMED');
    assert.equal(crashed.attemptCount, 1);
    await admin.send(
      new HeadObjectCommand({ Bucket, Key: deletedRow.storageKey }),
    );

    // Advance only fixture deadlines instead of waiting for production leases/TTL.
    await db.attachmentCleanupJob.update({
      where: { id: job.id },
      data: { leaseExpiresAt: new Date(0) },
    });
    await db.attachmentUploadIntent.update({
      where: { id: abandoned.ticket.uploadId },
      data: { createdAt: new Date(0), expiresAt: new Date(1_000) },
    });
    await db.attachmentCleanupJob.updateMany({
      where: { uploadId: abandoned.ticket.uploadId },
      data: { notBefore: new Date(0) },
    });
    const liveRow = await db.workOrderAttachment.findUniqueOrThrow({
      where: { id: live.file.id },
    });
    await db.attachmentCleanupJob.update({
      where: { objectKey: liveRow.storageKey },
      data: { status: 'PENDING', completedAt: null, notBefore: new Date(0) },
    });
    const second = await start(true); // Actual onModuleInit worker startup.
    assert.notEqual(second.child.pid, first.child.pid);
    await until(
      async () =>
        (
          await db.attachmentCleanupJob.findUniqueOrThrow({
            where: { id: job.id },
          })
        ).status === 'DONE',
    );
    await until(
      async () =>
        (
          await db.attachmentUploadIntent.findUniqueOrThrow({
            where: { id: abandoned.ticket.uploadId },
          })
        ).status === 'EXPIRED',
    );
    await until(
      async () =>
        (
          await db.attachmentCleanupJob.findFirstOrThrow({
            where: { uploadId: abandoned.ticket.uploadId, kind: 'STAGING' },
          })
        ).status === 'DONE',
    );
    await until(
      async () =>
        (
          await db.attachmentCleanupJob.findUniqueOrThrow({
            where: { objectKey: liveRow.storageKey },
          })
        ).status === 'DONE',
    );
    const recovered = await db.attachmentCleanupJob.findUniqueOrThrow({
      where: { id: job.id },
    });
    assert.equal(recovered.attemptCount, 2);
    await assert.rejects(
      admin.send(new HeadObjectCommand({ Bucket, Key: deletedRow.storageKey })),
      (error) => error.$metadata?.httpStatusCode === 404,
    );
    const staged = await db.attachmentUploadIntent.findUniqueOrThrow({
      where: { id: abandoned.ticket.uploadId },
    });
    await assert.rejects(
      admin.send(new HeadObjectCommand({ Bucket, Key: staged.stagingKey })),
      (error) => error.$metadata?.httpStatusCode === 404,
    );
    const replay = await api(
      second.url,
      `/attachment-uploads/${live.ticket.uploadId}/complete`,
      'POST',
      {},
      live.key,
    );
    assert.equal(replay.id, live.file.id);
    assert.equal(
      await db.workOrderAttachment.count({ where: { tenantId } }),
      2,
    );
    const list = await api(second.url, `/work-orders/${order.id}/attachments`);
    assert.equal(list.total, 1);
    const link = await api(second.url, `/attachments/${live.file.id}/download`);
    assert.deepEqual(
      Buffer.from(await (await fetch(link.downloadUrl)).arrayBuffer()),
      bytes,
    );
    console.log(
      JSON.stringify({
        status: 'PASS',
        processCrash: 'SIGKILL',
        reclaimedCleanup: true,
        expiredStagingRemoved: true,
        liveFinalPreserved: true,
        finalizeReplayAfterRestart: true,
      }),
    );
  } finally {
    try {
      for (const child of children) await kill(child);
      for (const model of [
        'attachmentCleanupJob',
        'attachmentIdempotency',
        'attachmentUploadIntent',
        'workOrderAttachment',
        'workLog',
        'workOrder',
      ])
        await db[model].deleteMany({ where: { tenantId } });
    } finally {
      await db.$disconnect();
      if (createdBucket) {
        const page = await admin.send(new ListObjectsV2Command({ Bucket }));
        if (page.Contents?.length)
          await admin.send(
            new DeleteObjectsCommand({
              Bucket,
              Delete: {
                Objects: page.Contents.map(({ Key }) => ({ Key })),
                Quiet: true,
              },
            }),
          );
        await admin.send(new DeleteBucketCommand({ Bucket }));
      }
      admin.destroy();
    }
  }
}
main().catch(() => {
  console.error(
    'A6_RESTART_SMOKE_FAILED: inspect test-only PostgreSQL/MinIO and worker checks',
  );
  process.exitCode = 1;
});
