-- Legacy reference costs retain an explicitly unknown currency.
ALTER TABLE work_order_parts ADD COLUMN unit_cost_currency CHAR(3),
  ADD CONSTRAINT work_order_parts_cost_currency CHECK
    (unit_cost_currency IS NULL OR (unit_cost IS NOT NULL AND unit_cost_currency ~ '^[A-Z]{3}$'));
