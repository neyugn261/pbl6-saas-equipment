CREATE TABLE maintenance_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  plan_id UUID NOT NULL,
  task_id UUID,
  event_type VARCHAR(60) NOT NULL,
  actor_id UUID,
  actor_roles TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  source_event_id UUID,
  changes JSONB NOT NULL,
  context JSONB NOT NULL,
  occurred_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  recorded_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT maintenance_history_plan_fkey FOREIGN KEY (tenant_id, plan_id) REFERENCES maintenance_plans(tenant_id, id) ON DELETE RESTRICT ON UPDATE NO ACTION
);
CREATE INDEX maintenance_history_tenant_id_plan_id_occurred_at_idx ON maintenance_history(tenant_id, plan_id, occurred_at DESC);
CREATE INDEX maintenance_history_tenant_id_task_id_occurred_at_idx ON maintenance_history(tenant_id, task_id, occurred_at DESC);
