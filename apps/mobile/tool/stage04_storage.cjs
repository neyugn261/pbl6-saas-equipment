// Disposable, private MinIO bucket + bounded fault proxies for native UAT.
// Never logs Authorization, URLs, storage credentials or file content.
const http = require('node:http');
const { randomUUID } = require('node:crypto');
module.exports = async function storageFixture(r, freePort) {
  const s3 = r('@aws-sdk/client-s3');
  const bucket = 'pbl6-test-mobile-stage04-' + randomUUID();
  const endpoint = `http://${process.env.MINIO_ENDPOINT || '127.0.0.1'}:${process.env.MINIO_PORT || 9000}`;
  const client = new s3.S3Client({ endpoint, region: process.env.MINIO_REGION || 'us-east-1', forcePathStyle: true,
    credentials: { accessKeyId: process.env.MINIO_ACCESS_KEY, secretAccessKey: process.env.MINIO_SECRET_KEY } });
  await client.send(new s3.CreateBucketCommand({Bucket: bucket}));
  const servers = [], stats = { prepare: [], complete: [], abort: 0, puts: 0, bearerToStorage: false };
  let fault = 'none';
  async function serve(handler) {
    const server = http.createServer(handler), port = await freePort();
    await new Promise(resolve => server.listen(port, '127.0.0.1', resolve)); servers.push(server);
    return port;
  }
  const storagePort = await serve((req, res) => {
    if (req.headers.authorization) stats.bearerToStorage = true;
    if (req.method === 'PUT') stats.puts++;
    const target = new URL(endpoint);
    const outgoing = () => {
      if (res.destroyed) return;
      const proxy = http.request({ hostname: target.hostname, port: target.port, method: req.method,
        path: req.url, headers: req.headers }, response => { res.writeHead(response.statusCode, response.headers); response.pipe(res); });
      proxy.on('error', () => { if (!res.destroyed) { res.writeHead(503); res.end(); } });
      res.on('close', () => { if (!res.writableEnded) proxy.destroy(); });
      req.pipe(proxy);
    };
    if (fault === 'slowPut' && req.method === 'PUT') setTimeout(outgoing, 8000).unref(); else outgoing();
  });
  Object.assign(process.env, { WORKORDER_ATTACHMENTS_ENABLED: 'true', WORKORDER_ATTACHMENT_WORKER_ENABLED: 'false',
    MINIO_USE_SSL: 'false', MINIO_REGION: process.env.MINIO_REGION || 'us-east-1',
    MINIO_PUBLIC_ENDPOINT: `http://10.0.2.2:${storagePort}`, WORKORDER_ATTACHMENT_BUCKET: bucket });
  return {
    bucket,
    async gateway(base) {
      const upstream = new URL(base);
      const port = await serve((req, res) => {
        if (req.url === '/__test/control') {
          let raw = ''; req.on('data', b => { raw += b; }); req.on('end', () => {
            try { fault = JSON.parse(raw).mode || 'none'; res.end(JSON.stringify({ok: true})); }
            catch { res.writeHead(400); res.end(); }
          }); return;
        }
        if (req.url === '/__test/stats') { res.setHeader('content-type','application/json'); res.end(JSON.stringify(stats)); return; }
        const prepare = req.method === 'POST' && /\/attachment-uploads$/.test(req.url);
        const complete = req.method === 'POST' && /\/attachment-uploads\/[^/]+\/complete$/.test(req.url);
        if (prepare) stats.prepare.push(req.headers['idempotency-key']);
        if (complete) stats.complete.push(req.headers['idempotency-key']);
        if (req.method === 'DELETE' && req.url.startsWith('/api/workorders/attachment-uploads/')) stats.abort++;
        const proxy = http.request({ hostname: upstream.hostname, port: upstream.port, path: req.url, method: req.method,
          headers: {...req.headers, host: upstream.host} }, response => {
          if (complete && fault === 'dropComplete' && response.statusCode === 200) {
            fault = 'none'; response.resume(); response.on('end', () => { res.writeHead(503, {'content-type':'application/json'}); res.end(JSON.stringify({code:'ATTACHMENT_SOURCE_UNAVAILABLE'})); });
          } else { res.writeHead(response.statusCode, response.headers); response.pipe(res); }
        });
        proxy.on('error', () => { res.writeHead(503); res.end(); }); req.pipe(proxy);
      });
      return `http://127.0.0.1:${port}`;
    },
    async close() {
      for (const server of servers) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
      if (!bucket.startsWith('pbl6-test-mobile-stage04-')) throw Error('Unsafe cleanup bucket');
      let token;
      do {
        const page = await client.send(new s3.ListObjectsV2Command({Bucket: bucket, ContinuationToken: token}));
        if (page.Contents?.length) await client.send(new s3.DeleteObjectsCommand({Bucket: bucket, Delete: {Objects: page.Contents.map(row => ({Key: row.Key}))}}));
        token = page.NextContinuationToken;
      } while (token);
      await client.send(new s3.DeleteBucketCommand({Bucket: bucket})); client.destroy();
    },
  };
};
