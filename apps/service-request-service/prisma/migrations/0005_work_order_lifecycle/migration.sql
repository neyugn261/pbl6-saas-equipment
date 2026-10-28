CREATE TABLE work_order_lifecycles (
    tenant_id UUID NOT NULL,
    work_order_id UUID NOT NULL,
    request_id UUID NOT NULL,
    equipment_id UUID NOT NULL,
    customer_id UUID,
    created_payload JSONB,
    terminal_payload JSONB,
    terminal_phase VARCHAR(20),
    applied_phase VARCHAR(20),
    created_event_id UUID,
    terminal_event_id UUID,
    created_version SMALLINT,
    terminal_version SMALLINT,
    created_occurred_at TIMESTAMPTZ(6),
    terminal_occurred_at TIMESTAMPTZ(6),
    created_correlation_id VARCHAR(100),
    terminal_correlation_id VARCHAR(100),
    received_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT work_order_lifecycles_pkey PRIMARY KEY (tenant_id, work_order_id),
    CONSTRAINT work_order_lifecycles_request_fkey FOREIGN KEY (tenant_id, request_id)
      REFERENCES service_requests (tenant_id, id) ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT work_order_lifecycles_terminal_check CHECK (terminal_phase IS NULL OR terminal_phase IN ('COMPLETED', 'CANCELLED')),
    CONSTRAINT work_order_lifecycles_applied_check CHECK (applied_phase IS NULL OR applied_phase IN ('CREATED', 'COMPLETED', 'CANCELLED')),
    CONSTRAINT work_order_lifecycles_created_check CHECK ((created_payload IS NULL) = (created_event_id IS NULL) AND (created_payload IS NULL) = (created_version IS NULL) AND (created_payload IS NULL) = (created_occurred_at IS NULL)),
    CONSTRAINT work_order_lifecycles_terminal_receipt_check CHECK ((terminal_payload IS NULL) = (terminal_event_id IS NULL) AND (terminal_payload IS NULL) = (terminal_phase IS NULL) AND (terminal_payload IS NULL) = (terminal_version IS NULL) AND (terminal_payload IS NULL) = (terminal_occurred_at IS NULL))
);
CREATE INDEX work_order_lifecycles_tenant_id_request_id_applied_phase_idx
  ON work_order_lifecycles (tenant_id, request_id, applied_phase);
CREATE INDEX work_order_lifecycles_created_event_id_idx ON work_order_lifecycles (created_event_id);
CREATE INDEX work_order_lifecycles_terminal_event_id_idx ON work_order_lifecycles (terminal_event_id);
CREATE UNIQUE INDEX work_order_lifecycles_one_active_idx
  ON work_order_lifecycles (tenant_id, request_id) WHERE applied_phase = 'CREATED';

CREATE TABLE work_order_lifecycle_conflicts (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    request_id UUID NOT NULL,
    work_order_id UUID NOT NULL,
    event_id UUID NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    event_version SMALLINT NOT NULL,
    reason VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL,
    occurred_at TIMESTAMPTZ(6) NOT NULL,
    received_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT work_order_lifecycle_conflicts_pkey PRIMARY KEY (id),
    CONSTRAINT work_order_lifecycle_conflicts_request_fkey FOREIGN KEY (tenant_id, request_id)
      REFERENCES service_requests (tenant_id, id) ON DELETE RESTRICT ON UPDATE NO ACTION
);
CREATE INDEX work_order_lifecycle_conflicts_tenant_id_request_id_received_at_idx
  ON work_order_lifecycle_conflicts (tenant_id, request_id, received_at);
CREATE UNIQUE INDEX work_order_lifecycle_conflicts_tenant_id_event_id_reason_key
  ON work_order_lifecycle_conflicts (tenant_id, event_id, reason);
