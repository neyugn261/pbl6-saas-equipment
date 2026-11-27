ALTER TABLE inventory_operations DROP CONSTRAINT inventory_operations_operation_check;

ALTER TABLE inventory_operations ADD CONSTRAINT inventory_operations_operation_check
  CHECK (operation IN ('RECEIVE', 'RECEIVE_BATCH', 'ADJUST', 'ISSUE', 'RETURN', 'INSPECT', 'CONFIRM_USE', 'REVERSE_USE'));
