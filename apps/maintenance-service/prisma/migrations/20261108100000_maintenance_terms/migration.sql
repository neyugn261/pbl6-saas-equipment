-- Existing Plans keep their unlimited schedule. No historical policy JSON is rewritten.
ALTER TABLE maintenance_plans
  ADD COLUMN term_mode VARCHAR(20) NOT NULL DEFAULT 'UNLIMITED',
  ADD COLUMN term_years INTEGER,
  ADD COLUMN end_date DATE;

ALTER TABLE maintenance_plans ADD CONSTRAINT maintenance_plan_term_check CHECK (
  (term_mode = 'UNLIMITED' AND term_years IS NULL AND end_date IS NULL)
  OR (term_mode = 'YEARS' AND term_years IS NOT NULL AND term_years BETWEEN 1 AND 100 AND end_date IS NOT NULL)
  OR (term_mode = 'WARRANTY_END' AND term_years IS NULL AND end_date IS NOT NULL)
);
