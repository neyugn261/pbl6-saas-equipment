ALTER TABLE notifications
    ADD COLUMN customer_id UUID;

CREATE INDEX idx_notifications_in_app_scope
    ON notifications (tenant_id, user_id, customer_id, created_at DESC, id)
    WHERE channel = 'IN_APP';

CREATE INDEX idx_notifications_in_app_unread_scope
    ON notifications (tenant_id, user_id, customer_id)
    WHERE channel = 'IN_APP' AND read_at IS NULL;

CREATE TABLE recipient_snapshots (
    user_id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    user_type VARCHAR(20) NOT NULL
        CHECK (user_type IN ('TENANT_STAFF', 'CUSTOMER')),
    account_status VARCHAR(30) NOT NULL
        CHECK (account_status IN ('INVITED', 'ACTIVE', 'SUSPENDED', 'DISABLED')),
    role_codes JSONB NOT NULL
        CHECK (jsonb_typeof(role_codes) = 'array'),
    membership_id UUID,
    customer_id UUID,
    membership_status VARCHAR(20)
        CHECK (membership_status IN ('ACTIVE', 'INACTIVE')),
    membership_source_changed_at TIMESTAMPTZ,
    revision BIGINT NOT NULL CHECK (revision > 0),
    bootstrap_run_id UUID,
    source_occurred_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (
        (user_type = 'TENANT_STAFF' AND membership_id IS NULL
            AND customer_id IS NULL AND membership_status IS NULL
            AND membership_source_changed_at IS NULL)
        OR
        (user_type = 'CUSTOMER' AND (
            (membership_id IS NULL AND customer_id IS NULL
                AND membership_status IS NULL
                AND membership_source_changed_at IS NULL)
            OR
            (membership_id IS NOT NULL AND customer_id IS NOT NULL
                AND membership_status IS NOT NULL
                AND membership_source_changed_at IS NOT NULL)
        ))
    )
);
CREATE INDEX idx_recipient_snapshots_tenant_status
    ON recipient_snapshots (tenant_id, account_status, user_type);

CREATE TABLE recipient_bootstrap_runs (
    bootstrap_run_id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    expected_users INTEGER CHECK (expected_users >= 0),
    received_users INTEGER NOT NULL DEFAULT 0 CHECK (received_users >= 0),
    marker_received BOOLEAN NOT NULL DEFAULT false,
    status VARCHAR(20) NOT NULL DEFAULT 'RUNNING'
        CHECK (status IN ('RUNNING', 'COMPLETED', 'FAILED')),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (
        status <> 'COMPLETED'
        OR (marker_received AND expected_users IS NOT NULL
            AND received_users = expected_users AND completed_at IS NOT NULL)
    ),
    CONSTRAINT uq_recipient_bootstrap_runs_id_tenant
        UNIQUE (bootstrap_run_id, tenant_id)
);
CREATE INDEX idx_recipient_bootstrap_runs_tenant_status
    ON recipient_bootstrap_runs (tenant_id, status, created_at DESC);

CREATE TABLE recipient_bootstrap_receipts (
    bootstrap_run_id UUID NOT NULL
        REFERENCES recipient_bootstrap_runs (bootstrap_run_id)
        ON DELETE CASCADE,
    user_id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    applied_revision BIGINT NOT NULL CHECK (applied_revision > 0),
    received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (bootstrap_run_id, user_id),
    FOREIGN KEY (bootstrap_run_id, tenant_id)
        REFERENCES recipient_bootstrap_runs (bootstrap_run_id, tenant_id)
        ON DELETE CASCADE
);
CREATE INDEX idx_recipient_bootstrap_receipts_tenant_user
    ON recipient_bootstrap_receipts (tenant_id, user_id);

CREATE TABLE pending_notification_events (
    source_event_id UUID NOT NULL,
    consumer VARCHAR(100) NOT NULL,
    tenant_id UUID NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    event_version INTEGER NOT NULL CHECK (event_version > 0),
    payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
    payload_sha256 CHAR(64) NOT NULL
        CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'RETRYING', 'MANUAL_REVIEW', 'RESOLVED')),
    reason VARCHAR(80) NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_error_category VARCHAR(80),
    lease_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ,
    PRIMARY KEY (source_event_id, consumer)
);
CREATE INDEX idx_pending_notification_events_due
    ON pending_notification_events (next_attempt_at, created_at)
    WHERE status IN ('PENDING', 'RETRYING');

CREATE TABLE service_request_snapshots (
    tenant_id UUID NOT NULL,
    service_request_id UUID NOT NULL,
    request_no VARCHAR(50) NOT NULL,
    customer_id UUID NOT NULL,
    requester_id UUID NOT NULL,
    request_type VARCHAR(30) NOT NULL
        CHECK (request_type IN ('WARRANTY', 'REPAIR', 'MAINTENANCE', 'INSPECTION')),
    priority VARCHAR(20) NOT NULL
        CHECK (priority IN ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
    status VARCHAR(40) NOT NULL
        CHECK (status IN (
            'NEW', 'REVIEWING', 'AWAITING_INFO', 'AWAITING_CUSTOMER_APPROVAL',
            'ACCEPTED', 'PROCESSING', 'RESOLVED', 'CLOSED', 'REJECTED',
            'CANCELLED', 'COST_REJECTED'
        )),
    created_event_id UUID NOT NULL,
    latest_status_event_id UUID,
    source_occurred_at TIMESTAMPTZ NOT NULL,
    latest_status_changed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, service_request_id)
);
CREATE INDEX idx_service_request_snapshots_requester
    ON service_request_snapshots (tenant_id, requester_id);

CREATE TABLE pending_notification_deliveries (
    source_event_id UUID NOT NULL,
    consumer VARCHAR(100) NOT NULL,
    user_id UUID NOT NULL,
    customer_id UUID,
    channel VARCHAR(20) NOT NULL CHECK (channel = 'IN_APP'),
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'RETRYING', 'COMPLETED', 'MANUAL_REVIEW')),
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_error_category VARCHAR(80),
    lease_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    PRIMARY KEY (source_event_id, consumer, user_id, channel),
    FOREIGN KEY (source_event_id, consumer)
        REFERENCES pending_notification_events (source_event_id, consumer)
        ON DELETE CASCADE,
    CHECK (
        (status = 'COMPLETED' AND completed_at IS NOT NULL)
        OR (status <> 'COMPLETED' AND completed_at IS NULL)
    )
);
CREATE INDEX idx_pending_notification_deliveries_due
    ON pending_notification_deliveries (next_attempt_at, created_at)
    WHERE status IN ('PENDING', 'RETRYING');

CREATE TABLE notification_event_conflicts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_event_id UUID NOT NULL,
    consumer VARCHAR(100) NOT NULL,
    expected_sha256 CHAR(64) NOT NULL
        CHECK (expected_sha256 ~ '^[0-9a-f]{64}$'),
    observed_sha256 CHAR(64) NOT NULL
        CHECK (observed_sha256 ~ '^[0-9a-f]{64}$'),
    event_type VARCHAR(100) NOT NULL,
    detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    state VARCHAR(20) NOT NULL DEFAULT 'OPEN'
        CHECK (state IN ('OPEN', 'RESOLVED')),
    resolved_at TIMESTAMPTZ,
    resolved_by UUID,
    CHECK (
        (state = 'OPEN' AND resolved_at IS NULL)
        OR (state = 'RESOLVED' AND resolved_at IS NOT NULL)
    ),
    CONSTRAINT uq_notification_event_conflict_hashes
        UNIQUE (source_event_id, consumer, expected_sha256, observed_sha256)
);
CREATE INDEX idx_notification_event_conflicts_state
    ON notification_event_conflicts (state, detected_at);
