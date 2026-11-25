-- Service Managers process customer requests but do not submit new requests.
-- Keep the permission in the catalog for customer roles and remove only this grant.
DELETE FROM role_permissions rp
USING roles r, permissions p
WHERE rp.role_id = r.id
  AND rp.permission_id = p.id
  AND r.code = 'SERVICE_MANAGER'
  AND p.code = 'service_request:create';
