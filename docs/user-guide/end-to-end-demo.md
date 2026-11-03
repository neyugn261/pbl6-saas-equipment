# End-to-end demo: handover to customer confirmation

For the full Vietnamese setup, demo accounts, exact routes, rehearsal cases and
Notification deployment/bootstrap readiness gate, use the
[M3 complete runbook for Khương](../demo/m3-complete-runbook.md).
This shorter walkthrough does not replace the readiness gate in that runbook.

## Demo preparation

- Start the supported local stack and verify Gateway, Identity, Organization,
  Asset, Service Request, Work Order, Maintenance, Inventory, and Notification
  health endpoints before presenting.
- Prepare separate accounts for Tenant Admin, Service Manager, Dispatcher,
  Inventory Staff, Technician, and Customer. Use test-only accounts and data;
  never place real credentials in this guide, source control, or screenshots.
- Prepare an active branch, customer/contact, equipment model, warehouse, and
  stock part. Ensure customer and staff accounts belong to the intended tenant.

## Walkthrough

1. **Tenant Admin — save a handover draft.** Create the customer equipment
   registration, choose KEEP/CREATE/NONE as appropriate, enter reasons for
   NONE, and save. Show that draft-only choices remain unconfirmed when the role
   cannot complete manager-only steps.
2. **Service Manager — confirm handover.** Resume the same draft, complete
   allowed warranty/maintenance choices, and submit. Open the dossier and show
   the equipment record, warranty/plan, history, and QR. Refresh once to show
   the committed record survives navigation.
3. **Customer — create a request.** Sign in as the linked customer, open the
   equipment, create a service request, and verify it appears in the customer
   request list and notification inbox.
4. **Service Manager — review and create work.** Review the request and its
   warranty snapshot, accept it, and create a Work Order only when offered.
   Assign a technician and schedule the work.
5. **Inventory Staff — issue the part.** Select the actual Work Order, issue a
   test quantity, and show the ledger entry. If the service reports an
   uncertain result, demonstrate recovery using the same operation key; do not
   generate a duplicate issue.
6. **Technician — complete the job.** Open the assigned WO, advance through
   allowed transitions, complete the required report, and attach internal
   evidence. If applicable, record the return of unused parts with their
   condition.
7. **Service Manager — publish customer evidence.** Inspect the submitted
   report and change only approved attachments to CUSTOMER visibility. Confirm
   that unrelated internal files remain hidden.
8. **Customer — review and confirm.** Reopen the SR, refresh its result, inspect
   the customer-facing summary and published attachments, download a file, and
   use the available confirmation action. Verify the final SR status/history
   and notification unread/read state.

## Demo acceptance checks

- IDs are never used as a substitute for authorization; each role uses its own
  account and tenant/customer scope.
- No stage is announced as complete until its API response and refreshed detail
  agree. A 409 triggers refresh and a new decision.
- A timeout is handled by reconciliation/recovery with the original operation
  identity, never by creating a second registration, WO, attachment, or stock
  issue.
- The customer view contains no INTERNAL attachment, staff-only Work Order
  navigation, or inventory details.
- If an API is unavailable, stop at that step and show the real error. Do not
  use fixtures or present sample data as live workflow output.
