# M2-H4: review request for ADR/ERD owner

Scope: Service Request migration `0005_work_order_lifecycle` only. No accepted
ADR, shared ERD, event catalog, Work Order producer or Gateway file was edited.

Proposed ERD addition: `service_request_db.work_order_lifecycles`, primary key
`(tenant_id, work_order_id)`, composite tenant-safe FK to
`service_requests(tenant_id, id)`, and a partial unique index for one row with
`applied_phase='CREATED'` per `(tenant_id, request_id)`. It stores canonical
Created/terminal receipt payloads and event IDs separately from `applied_phase`.
`work_order_lifecycle_conflicts` stores contradictory receipts with event
identity, semantic payload, time and reason. Neither table has a cross-DB FK.

Please review the SQL constraints, pending Created selection (oldest receipt
first), customer validation of pending Cancelled.v2 (the contract has no
customerId), indefinite M2 retention, and the absence of automatic legacy
backfill. Migration deployment outside the test database must follow ADR/ERD
approval. Existing `PROCESSING` rows without `active_work_order_id` need a
verified Work Order owner export or authorized API lookup and an audited
reconciliation plan. F12 estimate EXPIRED recovery is a separate decision.
