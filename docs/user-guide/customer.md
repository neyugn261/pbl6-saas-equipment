# Customer guide

Customer Users and Customer Admins see only their customer-scoped assets and
service requests. Customer Admins have additional customer-management actions;
neither role can access internal Work Order files or staff inventory.

## Equipment and service requests

1. Open the customer portal and review **Thiết bị**. Select an asset to see its
   dossier, timeline, maintenance information allowed for your role, and linked
   requests.
2. Create a request from an eligible equipment record. Provide an accurate
   description, request type, priority, and contact details. The server checks
   that the equipment belongs to the current customer.
3. Track the request in **Yêu cầu dịch vụ**. Review status changes and answer
   requests for more information. A refresh shows the current server state.

## Estimate, result, and files

- When a cost estimate is sent, review its line items and total, then approve or
  reject only if that action is offered for the current request. The server
  calculates monetary totals.
- After service is completed, review the resolution summary and result. Use the
  available confirmation action if the request allows it.
- The result's attachment list includes only files published for customers.
  Download creates a short-lived link when requested. A file that is not listed
  is not available through the customer projection.
- Use the notification bell to see the unread count; the inbox supports read
  filters, pages, and marking an item read.

If a link returns 403 or 404, do not try a different tenant's ID. Contact the
tenant's service team. A 409 means the request state changed; refresh it and
review the actions offered by the service.
