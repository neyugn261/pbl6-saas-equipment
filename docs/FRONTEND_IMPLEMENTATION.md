# PBL6 Web Frontend

The web client is a Vite + React + TypeScript single-page application in `apps/web`. It currently uses a local mock service and `localStorage`; the UI consumes the store rather than embedding mutable workflow data in pages, so the mock layer can later be replaced by REST clients.

## Route map

### Tenant admin and operations

- `/app/dashboard`
- `/app/customers`, `/app/customers/new`, `/app/customers/:id`
- `/app/equipment`, `/app/equipment/new`, `/app/equipment/:id`
- `/app/service-requests`, `/app/service-requests/new`, `/app/service-requests/:id`
- `/app/work-orders`, `/app/work-orders/:id`
- `/app/technicians`, `/app/technicians/:id`
- `/app/maintenance`, `/app/maintenance/:id`
- `/app/inventory/parts`, `/app/inventory/parts/:id`
- `/app/inventory/warehouses`, `/app/inventory/transactions`
- `/app/organization/branches`, `/app/organization/users`, `/app/organization/roles`
- `/app/reports`, `/app/settings`

### Platform administration

- `/admin`
- `/admin/tenants`, `/admin/tenants/new`, `/admin/tenants/:id`
- `/admin/audit-logs`, `/admin/settings`

### Customer portal

- `/portal`
- `/portal/equipment`, `/portal/equipment/:id`
- `/portal/requests`, `/portal/requests/new`, `/portal/requests/:id`
- `/portal/locations`, `/portal/notifications`, `/portal/profile`

## Role navigation

| Role | Primary access |
| --- | --- |
| Platform Admin | Platform dashboard, tenants, audit log, platform settings |
| Tenant Admin | All tenant modules, organization, inventory, reports, settings |
| Service Manager / Dispatcher | Dashboard, customers, equipment, requests, work orders, technicians, maintenance, reports |
| Inventory Staff | Dashboard, parts, warehouses, stock transactions |
| Customer Admin | Customer dashboard, all company equipment/requests, locations, notifications, profile |
| Customer User | Customer dashboard and assigned customer-scope data |

The role selector in the header is a prototype control that demonstrates navigation changes. Production authentication should derive role and scope from the identity service.

## Shared UI

- Responsive `AppShell`, role-aware sidebar, top bar and breadcrumbs
- `PageHeader`, `Section`, `MetricCard`, `InfoGrid`
- `Table`, toolbar controls and pagination
- Shared `StatusBadge` and `PriorityBadge` mappings
- `Tabs`, `Dialog`, `ActivityTimeline`, form fields
- Empty, error, loading/skeleton and toast states
- Customer/equipment summaries, location hierarchy, technician picker and upload area

## Mock workflows

1. Create a request at `/portal/requests/new`; it immediately appears in both customer and admin request lists.
2. Open the request in the admin portal and move it through review, acceptance, processing and resolution.
3. For an out-of-warranty request, display/send an estimate; the customer can approve or reject it.
4. After resolution, the customer can view the service report and confirm completion.
5. Switch roles from the header to demonstrate platform, tenant, dispatcher, inventory and customer navigation scopes.

Mutable request data is persisted in browser `localStorage` under the `pbl6.*` keys.

## Run and verify

```bash
pnpm install
pnpm dev:web
pnpm --filter web lint
pnpm --filter web build
```

## Future enhancements (not implemented)

- Real authentication/authorization guards and REST API integration
- Server-side pagination, upload storage and notification delivery
- Technician mobile application workflows
- Advanced checklist builder, SLA engine and realtime scheduling
- Billing, invoices, payment, accounting, GPS, IoT and AI features are intentionally outside scope
