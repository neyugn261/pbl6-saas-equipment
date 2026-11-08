# Web user guides

- [Equipment delivery methods](./equipment-delivery-methods.md) — store completion and customer-site confirmation.
- [Staff](./staff.md) — Tenant Admin, Service Manager, and Dispatcher workflows.
- [Inventory Staff](./inventory-staff.md) — catalog, stock, and Work Order parts.
- [Technician](./technician.md) — assigned work, service report, and evidence.
- [Customer](./customer.md) — equipment, service requests, estimates, and results.
- [End-to-end demo](./end-to-end-demo.md) — handover through customer confirmation.

The pages use live service APIs. If a service is unavailable, the Web app reports
the error; it does not switch to sample records. Routes and actions are still
subject to backend tenant scope, role permissions, and each record's
`allowedActions`.

## Workshop UI status — 08/11/2026

The operational pages above use live APIs. The separate DEV-only route
`/design/workshop` reviews 12 proposed journeys with sample data and makes no API
writes; its role selector does not change the authenticated account. New studio
fields are not evidence that corresponding backend APIs exist.

See the [current implementation](../FRONTEND_IMPLEMENTATION.md) and
[Workshop handoff, API gaps and next tasks](../reports/2026-11-08-workshop-ui-handoff.md).
