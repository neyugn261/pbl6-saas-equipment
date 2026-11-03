# Technician guide

## Work your assigned jobs

1. Open **Lệnh công việc** (`/app/work-orders`) and select a WO assigned to you.
   A Work Order ID alone does not grant access; assignment and tenant scope are
   checked by the service.
2. Use the transition controls shown by the server: accept/reject, travel,
   start, hold/resume, or complete. Only valid `allowedActions` are displayed.
3. Before completion, enter the problem description, solution, result, and
   customer-facing summary. Submit the report with the completion action.
4. Add JPEG, PNG, or PDF evidence within the displayed size limit. Technician
   uploads are INTERNAL; a Service Manager controls publication to customers.
   Report evidence is attached after the WO is completed and its report exists.
5. If an action returns 409, refresh the WO and use the new available actions.
   Do not repeat a transition based on a stale screen. A network timeout is not
   proof that the action failed; reload the WO and report before retrying.

Do not add customer personal data, credentials, or internal-only investigation
notes to the customer-facing report summary. The customer portal exposes only
the service result and attachments published through the approved projection.
