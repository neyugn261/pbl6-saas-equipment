# Staff guide

> ADR 0022: demo mới dùng một tài khoản Service Manager để tiếp nhận và điều phối trong chi nhánh; xem [hướng dẫn chi nhánh](branch-service-management.md). Dispatcher chỉ giữ tương thích tài khoản cũ.

This guide covers internal tenant roles. A Tenant Admin, Service Manager, and
Dispatcher have different write permissions; a visible route does not grant a
mutation permission.

## Register and hand over equipment

1. Open **Hồ sơ bàn giao** (`/app/equipment-registrations`) and choose **Tạo hồ sơ**.
2. Select or create the customer, site, location, and equipment model. For an
   existing asset, choose **Máy có sẵn** and select the asset to resume its
   registration rather than creating a duplicate.
3. Enter the actual handover/installation dates and select a policy mode:
   - **KEEP** reuses the selected existing warranty or maintenance plan.
   - **CREATE** creates new coverage or a plan using the supplied details.
   - **NONE** records that no policy applies and requires a reason.
   - A draft may retain an **UNCONFIRMED** choice until an authorized Service
     Manager completes the decision.
4. Save or submit using the actions available to the signed-in role. Tenant
   Admin drafts that require manager confirmation must be handed to a Service
   Manager; do not share another user's credentials.
5. After completion, open the equipment dossier to verify customer/site,
   warranty, maintenance plan, service history, and QR. QR identifies equipment
   but does not grant access or replace authorization.

If a create request times out, use the wizard's reconciliation/reload path.
Do not submit a second registration until the first result has been checked.

## Service requests and Work Orders

- Review incoming requests at `/app/service-requests`. Open a request to inspect
  its server status, allowed actions, warranty decision, history, and estimate.
- Use only the actions displayed from `allowedActions`. A 409 means the record
  changed or the transition is no longer valid: refresh and decide again instead
  of repeating the old action.
- Create a Work Order only when the request allows it. Dispatchers assign the
  appropriate technician and schedule; technicians update operational status.
- The Work Order detail shows assignment/status history and a submitted Service
  Report. When completing a WO, provide the required report fields and a
  customer-facing summary.
- Upload evidence on the Work Order or submitted report. Files are private by
  default. A Service Manager can publish or hide a file from customers; the
  uploader can remove their own file when allowed by the server.
- For a 401, refresh/re-authenticate; 403 means the role lacks permission; 404
  means the resource is missing or outside scope; 409 requires refresh; 422
  means the submitted values or file verification need correction.

## Maintenance, history, and reports

- Use `/app/maintenance` for plans/tasks and `/app/maintenance-history` for
  history. Equipment dossier links provide equipment-scoped plans, tasks,
  maintenance history, and service timeline.
- Use `/app/reports` or the Work Order summary on the dashboard for the A5
  aggregate. Choose local dates in Asia/Ho_Chi_Minh; the end date is included.
  The report is returned by its dedicated summary endpoint, not computed from
  the current page of Work Orders.
- Use the notification bell/inbox for user-scoped events. Open links only when
  the destination is within your current role and tenant.
