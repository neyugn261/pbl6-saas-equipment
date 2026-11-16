import assert from "node:assert/strict";
import test from "node:test";
import { webTab } from "./helpers/web-tab.mjs";

const requestId = "c812e948-10b2-41f1-abe6-f50e6fc4e934";
const scope = "tenant:user";
const response = (status, body) =>
  new Response(JSON.stringify(body), { status });

test("inspection is offered only on routed reviewing requests with a verified empty active order list", () => {
  const tab = webTab(async () => {
    throw new Error("Unexpected fetch");
  });
  const { canCreateInspection } = tab.load(
    "features/workspace/request-intake.ts",
  );
  const routed = { status: "REVIEWING", branchId: "branch" };
  assert.equal(canCreateInspection(routed, 0), true);
  assert.equal(canCreateInspection(routed, 1), false);
  assert.equal(canCreateInspection(routed), false);
  assert.equal(canCreateInspection({ ...routed, branchId: null }, 0), false);
  assert.equal(
    canCreateInspection({ ...routed, status: "AWAITING_CUSTOMER_APPROVAL" }, 0),
    false,
  );
});

test("a timed-out part request survives navigation and reuses the same key and original lines", async () => {
  const calls = [];
  const tab = webTab(async (url, options) => {
    calls.push({
      url,
      key: options.headers["Idempotency-Key"],
      body: options.body,
    });
    if (calls.length === 1) throw new Error("lost response");
    return response(201, { id: requestId });
  });
  const body = {
    reason: "Thay linh kiện",
    lines: [{ partId: requestId, quantity: "1.25" }],
  };
  const intent = {
    mode: "REQUEST_PARTS",
    path: "/work-orders/" + requestId + "/part-requests",
    body,
  };
  const first = new tab.stock.StockMutation(scope, 0, "requests");
  await assert.rejects(first.execute(intent), /lost response/);
  const reopened = new tab.stock.StockMutation(scope, 0, "requests");
  await assert.rejects(reopened.execute(intent), /đang chờ/);
  await reopened.execute();
  assert.equal(reopened.pending, null);
  assert.deepEqual(calls[0], calls[1]);
  assert.deepEqual(JSON.parse(calls[1].body), body);
});

test("fulfillment checks for a committed stock movement after the POST response is lost", async () => {
  const calls = [];
  let key;
  const tab = webTab(async (url, options) => {
    calls.push(url);
    if (options.method === "POST") {
      key = options.headers["Idempotency-Key"];
      throw new Error("lost response");
    }
    return response(200, { key, operation: "ISSUE", state: "COMMITTED" });
  });
  const stock = new tab.stock.StockMutation(scope, 0, "requests");
  await stock.execute({
    mode: "FULFILL",
    path: "/part-requests/" + requestId + "/fulfillments",
    body: { expectedVersion: 2, quantity: "1", lineId: requestId },
  });
  assert.equal(stock.pending, null);
  assert.equal(calls.length, 2);
  assert.match(calls[1], /inventory-operations\//);
});

test("a pending fulfillment stays recoverable on a non-success response", async () => {
  let key;
  const tab = webTab(async (_url, options) => {
    if (options.method === "POST") {
      key = options.headers["Idempotency-Key"];
      return response(409, { code: "RESERVATION_CONFLICT" });
    }
    return response(200, { key, operation: "ISSUE", state: "PENDING" });
  });
  const stock = new tab.stock.StockMutation(scope, 0, "requests");
  await assert.rejects(
    stock.execute({
      mode: "FULFILL",
      path: "/part-requests/" + requestId + "/fulfillments",
      body: { expectedVersion: 2, quantity: "1", lineId: requestId },
    }),
    { code: "RESERVATION_CONFLICT" },
  );
  assert.equal(stock.pending.key, key);
});

test("a stale receipt refreshes the quantity instead of replaying with an edited version", async () => {
  const tab = webTab(async () =>
    response(409, { code: "REQUEST_VERSION_CONFLICT" }),
  );
  const stock = new tab.stock.StockMutation(scope, 0, "requests");
  await assert.rejects(
    stock.execute({
      mode: "RECEIPT",
      path: "/return-requests/" + requestId + "/receipts",
      body: {
        expectedVersion: 2,
        quantity: "1",
        condition: "DAMAGED",
        note: "Vỏ nứt",
      },
    }),
    { code: "REQUEST_VERSION_CONFLICT" },
  );
  assert.equal(stock.pending, null);
});
