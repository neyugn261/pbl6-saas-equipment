-- ============================================================================
-- notification_db 0001_init
-- Source: docs/erd/pbl6-schema-v3.1.sql lines 1150-1185 (section "notification_db"),
-- copied verbatim. See docs/decisions/0001-database-v3.1.md.
--
-- PostgreSQL-specific objects that schema.prisma cannot represent (CHECK
-- constraints, partial/expression indexes, generated columns, triggers) are
-- kept here and MUST NOT be dropped by later migrations.
-- ============================================================================

CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NULL, -- NULL may represent a platform-level notification
    user_id UUID NOT NULL, -- Logical reference to identity_db.users.id
    source_event_id UUID,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(200) NOT NULL,
    content TEXT NOT NULL,
    payload JSONB,
    channel VARCHAR(20) NOT NULL CHECK (channel IN ('IN_APP', 'EMAIL', 'PUSH')),
    -- Delivery state is independent from whether an in-app notification was read.
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SENT', 'FAILED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    sent_at TIMESTAMPTZ,
    read_at TIMESTAMPTZ,
    CHECK (read_at IS NULL OR channel = 'IN_APP')
);
CREATE INDEX idx_notifications_user_unread
    ON notifications (user_id, created_at DESC)
    WHERE channel = 'IN_APP' AND read_at IS NULL;
CREATE INDEX idx_notifications_tenant_type
    ON notifications (tenant_id, type, created_at DESC);
CREATE INDEX idx_notifications_delivery_queue
    ON notifications (status, created_at)
    WHERE status IN ('PENDING', 'FAILED');
CREATE UNIQUE INDEX uq_notifications_event_user_channel
    ON notifications (source_event_id, user_id, channel)
    WHERE source_event_id IS NOT NULL;

CREATE TABLE processed_events (
    event_id UUID NOT NULL,
    consumer VARCHAR(100) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (event_id, consumer)
);
