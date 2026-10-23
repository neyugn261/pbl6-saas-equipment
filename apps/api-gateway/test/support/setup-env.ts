// AppModule validates configuration when imported. The e2e suite overrides
// its ConfigService with local mock upstreams after creating them.
for (const name of [
  'IDENTITY_SERVICE_URL',
  'ORGANIZATION_SERVICE_URL',
  'ASSET_SERVICE_URL',
  'SERVICE_REQUEST_SERVICE_URL',
  'WORKORDER_SERVICE_URL',
  'MAINTENANCE_SERVICE_URL',
  'INVENTORY_SERVICE_URL',
  'NOTIFICATION_SERVICE_URL',
]) {
  process.env[name] = 'http://127.0.0.1:1';
}
