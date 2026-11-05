INSERT INTO permissions(code,name) VALUES
('equipment_handover:respond','Accept or reject equipment handovers for own customer')
ON CONFLICT(code) DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM roles r CROSS JOIN permissions p
WHERE r.code='CUSTOMER_ADMIN' AND p.code='equipment_handover:respond'
ON CONFLICT DO NOTHING;
