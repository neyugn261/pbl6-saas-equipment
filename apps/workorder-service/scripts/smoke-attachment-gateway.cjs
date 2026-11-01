const { randomUUID, createHash } = require('node:crypto');
const { resolve } = require('node:path');
const { execFileSync } = require('node:child_process');
const assert = require('node:assert/strict');
const { config } = require('dotenv');
const {
  requireTestDatabaseUrl,
  testJwtEnv,
  signTestAccessToken,
} = require('@pbl6/testing');
const {
  S3Client,
  CreateBucketCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
  DeleteBucketCommand,
} = require('@aws-sdk/client-s3');
config({ path: '.env', quiet: true });
config({ path: '../../.env', quiet: true });

async function main() {
  const testURL = requireTestDatabaseUrl('WORKORDER_TEST_DATABASE_URL');
  const tenantId = randomUUID();
  Object.assign(process.env, testJwtEnv(), {
    NODE_ENV: 'test',
    WORKORDER_DATABASE_URL: testURL,
    RABBITMQ_URL: '',
    WORKORDER_ATTACHMENTS_ENABLED: 'true',
    WORKORDER_ATTACHMENT_WORKER_ENABLED: 'false',
    WORKORDER_ATTACHMENT_BUCKET: `pbl6-wo-test-${randomUUID()}`,
  });
  for (const name of [
    'IDENTITY',
    'ORGANIZATION',
    'ASSET',
    'SERVICE_REQUEST',
    'MAINTENANCE',
    'INVENTORY',
    'NOTIFICATION',
  ])
    process.env[`${name}_SERVICE_URL`] =
      `http://${name.toLowerCase().replaceAll('_', '-')}.test`;
  execFileSync(
    process.execPath,
    ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
    { stdio: 'inherit', env: process.env },
  );
  const { validateEnv } = require('../dist/config/env.validation');
  const env = validateEnv(process.env);
  const admin = new S3Client({
    endpoint: `${env.MINIO_USE_SSL ? 'https' : 'http'}://${env.MINIO_ENDPOINT}:${env.MINIO_PORT}`,
    forcePathStyle: true,
    region: env.MINIO_REGION,
    credentials: {
      accessKeyId: env.MINIO_ACCESS_KEY,
      secretAccessKey: env.MINIO_SECRET_KEY,
    },
  });
  const Bucket = env.WORKORDER_ATTACHMENT_BUCKET;
  const { NestFactory } = require('@nestjs/core');
  const { ConfigService } = require('@nestjs/config');
  const {
    configureApp,
    createLogger,
    ServiceHttpClient,
    runWithCorrelationId,
  } = require('@pbl6/service-kit');
  let wo, gateway, db;
  try {
    await admin.send(new CreateBucketCommand({ Bucket }));
    const { AppModule } = require('../dist/app.module');
    const { PrismaService } = require('../dist/prisma/prisma.service');
    wo = await NestFactory.create(AppModule, { logger: false });
    configureApp(wo, { logger: createLogger('attachment-gateway-smoke') });
    await wo.listen(0, '127.0.0.1');
    db = wo.get(PrismaService);
    process.env.WORKORDER_SERVICE_URL = await wo.getUrl();
    const { AppModule: GatewayModule } = require(
      resolve('../api-gateway/dist/app.module'),
    );
    const { configureGateway } = require(
      resolve('../api-gateway/dist/gateway.setup'),
    );
    gateway = await NestFactory.create(GatewayModule, { logger: false });
    configureGateway(gateway, gateway.get(ConfigService));
    await gateway.listen(0, '127.0.0.1');
    const base = await gateway.getUrl();
    const order = await db.workOrder.create({
      data: {
        tenantId,
        workOrderNo: `WO-SMOKE-${randomUUID()}`,
        serviceRequestId: randomUUID(),
        equipmentId: randomUUID(),
        customerId: randomUUID(),
        type: 'REPAIR',
        title: 'Attachment Gateway test fixture',
        status: 'IN_PROGRESS',
      },
    });
    const token = signTestAccessToken({ role: 'SERVICE_MANAGER', tenantId });
    async function api(
      path,
      method = 'GET',
      body,
      key,
      expected = 200,
      bearer = token,
    ) {
      const response = await fetch(base + '/api/workorders' + path, {
        method,
        headers: {
          Authorization: `Bearer ${bearer}`,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...(key ? { 'Idempotency-Key': key } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      assert.equal(
        response.status,
        expected,
        `Unexpected HTTP status for ${method} ${path}`,
      );
      assert.ok(response.headers.get('x-correlation-id'));
      return expected === 204 ? null : response.json();
    }
    const preflight = await fetch(
      base + `/api/workorders/work-orders/${order.id}/attachment-uploads`,
      {
        method: 'OPTIONS',
        headers: {
          Origin: 'http://localhost:5173',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers':
            'content-type,authorization,idempotency-key',
        },
      },
    );
    assert.ok(
      preflight.headers
        .get('access-control-allow-headers')
        .toLowerCase()
        .includes('idempotency-key'),
    );
    const bytes = Buffer.from(
      '%PDF-1.7\nPBL6 attachment Gateway integration fixture\n%%EOF',
    );
    const ticket = await api(
      `/work-orders/${order.id}/attachment-uploads`,
      'POST',
      {
        fileName: 'service-evidence.pdf',
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
    const file = await api(
      `/attachment-uploads/${ticket.uploadId}/complete`,
      'POST',
      {},
      key,
    );
    assert.equal(
      (
        await api(
          `/attachment-uploads/${ticket.uploadId}/complete`,
          'POST',
          {},
          key,
        )
      ).id,
      file.id,
    );
    assert.equal((await api(`/work-orders/${order.id}/attachments`)).total, 1);
    assert.equal(file.storageKey, undefined);
    const link = await api(`/attachments/${file.id}/download`);
    assert.deepEqual(
      Buffer.from(await (await fetch(link.downloadUrl)).arrayBuffer()),
      bytes,
    );
    await api(`/attachments/${file.id}`, 'PATCH', { visibility: 'CUSTOMER' });
    const customer = signTestAccessToken({
      role: 'CUSTOMER_USER',
      tenantId,
      customerId: order.customerId,
    });
    // This is the caller contract for Huy's SR composition, not an SR public
    // controller fixture. The original customer token goes directly to WO.
    const projection = new ServiceHttpClient({
      name: 'workorder-service',
      baseUrl: await wo.getUrl(),
    });
    const projectionPath = `/internal/service-request-attachments/${order.serviceRequestId}`;
    const published = await runWithCorrelationId('a4-smoke-correlation', () =>
      projection.get(projectionPath, { accessToken: customer }),
    );
    assert.equal(published.total, 1);
    assert.equal(published.items[0].id, file.id);
    assert.deepEqual(Object.keys(published.items[0]).sort(), [
      'createdAt',
      'fileName',
      'id',
      'mimeType',
      'sizeBytes',
    ]);
    const customerLink = await projection.get(
      `${projectionPath}/${file.id}/download`,
      { accessToken: customer },
    );
    assert.deepEqual(
      Buffer.from(await (await fetch(customerLink.downloadUrl)).arrayBuffer()),
      bytes,
    );
    for (const path of [
      projectionPath,
      `/api/workorders${projectionPath}`,
      `/api/workorders/%69nternal/service-request-attachments/${order.serviceRequestId}`,
      `/api/workorders${projectionPath}/${file.id}/download`,
    ]) {
      assert.equal(
        (
          await fetch(base + path, {
            headers: { Authorization: `Bearer ${customer}` },
          })
        ).status,
        404,
      );
    }
    await api(
      `/attachments/${file.id}/download`,
      'GET',
      undefined,
      undefined,
      403,
      customer,
    );
    await api(`/attachments/${file.id}`, 'DELETE', undefined, undefined, 204);
    assert.equal(
      (await projection.get(projectionPath, { accessToken: customer })).total,
      0,
    );
    await assert.rejects(
      projection.get(`${projectionPath}/${file.id}/download`, {
        accessToken: customer,
      }),
      (error) => error.status === 404 && error.code === 'ATTACHMENT_NOT_FOUND',
    );
    await api(
      `/attachment-uploads/${ticket.uploadId}/complete`,
      'POST',
      {},
      key,
      404,
    );
    assert.equal(
      (await fetch(base + `/api/workorders/internal/work-orders/${order.id}`))
        .status,
      404,
    );
    console.log(
      JSON.stringify({
        status: 'PASS',
        dependencies: ['Gateway', 'WorkOrder', 'PostgreSQL', 'MinIO'],
        preparePutFinalizeDownload: true,
        replay: true,
        visibilityDelete: true,
        customerDenied: true,
        internalBlocked: true,
        corsIdempotency: true,
        publishedCustomerProjection: true,
        customerSignedDownload: true,
        identityAndSR:
          'test JWT and shared caller client; no live Identity/SR public composition',
      }),
    );
  } finally {
    if (db) {
      for (const model of [
        'attachmentCleanupJob',
        'attachmentIdempotency',
        'attachmentUploadIntent',
        'workOrderAttachment',
        'workLog',
        'workOrder',
      ])
        await db[model].deleteMany({ where: { tenantId } });
    }
    await gateway?.close();
    await wo?.close();
    const objects = await admin.send(new ListObjectsV2Command({ Bucket }));
    if (objects.Contents?.length)
      await admin.send(
        new DeleteObjectsCommand({
          Bucket,
          Delete: {
            Objects: objects.Contents.map((row) => ({ Key: row.Key })),
            Quiet: true,
          },
        }),
      );
    await admin.send(new DeleteBucketCommand({ Bucket }));
    admin.destroy();
  }
}
main().catch(() => {
  console.error(
    'ATTACHMENT_GATEWAY_SMOKE_FAILED: inspect service checks and test-only infrastructure; no credentials or signed URLs logged',
  );
  process.exitCode = 1;
});
