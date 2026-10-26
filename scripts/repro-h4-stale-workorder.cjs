// Manual diagnostic, intentionally exits 1 while H4 exists. No database writes.
// Build packages and service-request-service first. The real consumer is used
// with an explicit in-memory persistence double; this is not a DB/e2e test.
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { WorkOrderEventsConsumer } = require(
  path.resolve(
    "apps/service-request-service/dist/events/work-order-events.consumer.js",
  ),
);
const tenantId = randomUUID(),
  requestId = randomUUID(),
  equipmentId = randomUUID(),
  customerId = randomUUID();
let row = {
  id: requestId,
  tenantId,
  requestNo: "SR-H4",
  equipmentId,
  customerId,
  status: "ACCEPTED",
};
const tx = {
  $executeRawUnsafe: async () => 1,
  $queryRawUnsafe: async () => [{ id: requestId }],
  serviceRequest: {
    findFirst: async () => row,
    update: async ({ data }) => (row = { ...row, ...data }),
  },
  requestStatusHistory: { create: async () => ({}) },
};
const consumer = new WorkOrderEventsConsumer({
  $transaction: async (fn) => fn(tx),
});
function event(type, version, id, payload) {
  return {
    eventId: randomUUID(),
    eventType: type,
    eventVersion: version,
    producer: "workorder-service",
    tenantId,
    aggregateType: "WorkOrder",
    aggregateId: id,
    occurredAt: new Date().toISOString(),
    correlationId: "h4-repro",
    payload,
  };
}
async function main() {
  const oldId = randomUUID(),
    newId = randomUUID();
  await consumer.handle(
    event("WorkOrderCreated", 1, newId, {
      workOrderId: newId,
      workOrderNo: "WO-NEW",
      serviceRequestId: requestId,
      maintenanceTaskId: null,
      equipmentId,
      customerId,
      type: "REPAIR",
      priority: "NORMAL",
    }),
  );
  console.log("Created(new WO): " + row.status);
  await consumer.handle(
    event("WorkOrderCancelled", 2, oldId, {
      workOrderId: oldId,
      workOrderNo: "WO-OLD",
      serviceRequestId: requestId,
      maintenanceTaskId: null,
      equipmentId,
      reason: "Delayed old cancellation",
      cancelledAt: new Date().toISOString(),
      cancelServiceRequest: false,
    }),
  );
  console.log("Delayed Cancelled(old WO): " + row.status);
  if (row.status !== "PROCESSING") {
    console.error("H4 reproduced: old WO event changed the newer WO lifecycle");
    process.exitCode = 1;
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
