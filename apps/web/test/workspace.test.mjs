import assert from "node:assert/strict";
import test from "node:test";
import { hooks, nodes, settle, webTab } from "./helpers/web-tab.mjs";

const tab = webTab(async () => {
  throw new Error("Unexpected request");
});
const roles = tab.load("features/workspace/role-workspace.ts");

test("customer workspaces stay in the portal and Customer User has no people administration", () => {
  for (const role of ["CUSTOMER_ADMIN", "CUSTOMER_USER"]) {
    const nav = roles.navigationFor([role]);
    assert.ok(nav.length > 3);
    assert.ok(nav.every((item) => item.path.startsWith("/portal/")));
    assert.equal(
      nav.some(
        (item) =>
          item.path.includes("inventory") || item.path.startsWith("/admin/"),
      ),
      false,
    );
  }
  assert.equal(
    roles
      .navigationFor(["CUSTOMER_USER"])
      .some((item) => item.path === "/portal/users"),
    false,
  );
  assert.equal(
    roles
      .navigationFor(["CUSTOMER_ADMIN"])
      .some((item) => item.path === "/portal/users"),
    true,
  );
});
test("all eight roles have a workspace; platform administration and stock mutations are not added to unrelated roles", () => {
  for (const role of Object.keys(roles.roleNames)) {
    assert.equal(roles.primaryRole([role]), role);
    assert.ok(roles.navigationFor([role]).length > 1);
  }
  assert.ok(
    roles
      .navigationFor(["PLATFORM_ADMIN"])
      .every((item) => item.path.startsWith("/admin/")),
  );
  assert.equal(
    roles
      .navigationFor(["DISPATCHER"])
      .some((item) => item.path.startsWith("/app/organization/")),
    false,
  );
  assert.equal(
    roles
      .navigationFor(["SERVICE_MANAGER"])
      .some((item) => item.path === "/app/inventory/transactions"),
    false,
  );
  assert.equal(
    roles
      .navigationFor(["TECHNICIAN"])
      .find((item) => item.path === "/app/work-orders").label,
    "Công việc của tôi",
  );
  const combined = roles.navigationFor(["SERVICE_MANAGER", "TECHNICIAN"]);
  assert.equal(
    combined.find((item) => item.path === "/app/work-orders").label,
    "Lệnh công việc",
  );
  assert.equal(
    new Set(combined.map((item) => item.path)).size,
    combined.length,
  );
});
test("workspace reads immediately hide the previous session and discard its late response", async () => {
  const h = hooks(),
    pending = [];
  const local = webTab(async () => {
    throw new Error("Unexpected request");
  });
  const data = local.load("features/workspace/workspace-data.ts", {
    react: h.react,
    "../../api/client": {
      ...local.client,
      api: {
        maintenance: () => new Promise((resolve) => pending.push(resolve)),
      },
    },
    "../../auth/session": local.session,
  });
  const render = () =>
    h.render(() =>
      data.useWorkspaceData("maintenance", "/maintenance-history"),
    );
  assert.equal(render().loading, true);
  local.changeSession();
  assert.equal(render().data, undefined);
  pending[0]({ items: [{ privateTenant: "old" }], total: 1 });
  await settle();
  assert.equal(render().data, undefined);
  pending[1]({ items: [], total: 0 });
  await settle();
  assert.equal(render().data.total, 0);
});
test("workspace errors remain unavailable instead of becoming a false zero", async () => {
  const h = hooks();
  const data = tab.load("features/workspace/workspace-data.ts", {
    react: h.react,
    "../../api/client": {
      ...tab.client,
      api: {
        workorders: async () => {
          throw new tab.client.ApiError(403, "DENIED", "private details");
        },
      },
    },
    "../../auth/session": tab.session,
  });
  const render = () =>
    h.render(() => data.useWorkspaceData("workorders", "/work-orders"));
  render();
  await settle();
  const state = render();
  assert.equal(state.data, undefined);
  assert.match(state.error, /chưa có quyền/);
  assert.equal(state.error.includes("private details"), false);
});

test("plan creation submits one intent; an unknown result never reports saved or blindly retries", async () => {
  const h = hooks(),
    calls = [];
  let rejectPost,
    saved = 0,
    checked = 0;
  const local = webTab(async () => {
    throw new Error("Unexpected request");
  });
  const componentNames = [
    "Badge",
    "DataState",
    "EmptyState",
    "EntityPicker",
    "EquipmentIdentity",
    "NextStep",
    "PageHeading",
    "Pagination",
    "RelatedName",
    "SearchField",
  ];
  const ui = Object.fromEntries(componentNames.map((name) => [name, name]));
  const iconNames = [
    "ArrowRight",
    "CalendarDays",
    "CheckCircle2",
    "Clock3",
    "Info",
    "Plus",
    "RefreshCw",
    "Users",
    "Wrench",
  ];
  const { PlanCreate } = local.load(
    "features/workspace/OperationsPages.tsx",
    {
      react: h.react,
      "react/jsx-runtime": h.jsx,
      "react-router-dom": {
        Link: "a",
        useSearchParams: () => [new URLSearchParams(), () => {}],
      },
      "lucide-react": Object.fromEntries(iconNames.map((name) => [name, name])),
      "../../auth/session": local.session,
      "../../api/client": {
        ...local.client,
        api: {
          maintenance: (path, input) => {
            calls.push({ path, input });
            return new Promise((_, reject) => {
              rejectPost = reject;
            });
          },
        },
      },
      "../../components/Badges": { PriorityBadge: "PriorityBadge" },
      "./WorkspaceUI": ui,
      "./WorkOrderBoard": { default: "WorkOrderBoard" },
      "./service-detail-data": local.load("features/workspace/service-detail-data.ts"),
      "./calendar-preview":local.load("features/workspace/calendar-preview.ts"),
      "./workspace-data": { formatDate: String },
    },
    {
      FormData: class {
        constructor(fields) {
          this.fields = fields;
        }
        get(key) {
          return this.fields[key];
        }
      },
    },
  );
  const props = {
    onClose: () => {},
    onSaved: () => saved++,
    onCheck: () => checked++,
  };
  let tree = h.render(PlanCreate, props);
  nodes(tree, (n) => n.type === "EntityPicker")[0].props.onChange(
    "equipment-1",
  );
  tree = h.render(PlanCreate, props);
  const submit = nodes(tree, (n) => n.type === "form")[0].props.onSubmit;
  const event = {
    preventDefault() {},
    currentTarget: {
      name: "Routine",
      frequencyUnit: "MONTH",
      frequencyValue: "3",
      nextDueDate: "2027-01-31",
    },
  };
  const flight = submit(event);
  await submit(event);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].input.body.equipmentId, "equipment-1");
  rejectPost(new TypeError("connection lost after commit"));
  await flight;
  tree = h.render(PlanCreate, props);
  assert.equal(saved, 0);
  await nodes(tree, (n) => n.type === "form")[0].props.onSubmit(event);
  assert.equal(calls.length, 1);
  nodes(
    tree,
    (n) =>
      n.type === "button" && n.props.children === "Kiểm tra danh sách kế hoạch",
  )[0].props.onClick();
  assert.equal(checked, 1);
  assert.equal(saved, 0);
});

function operationsFixture(profile, search, response) {
  const h = hooks(), calls = [];
  const local = webTab(async () => { throw new Error("Unexpected request"); });
  const session = { ...local.session, useSession: () => ({ profile }) };
  const data = local.load("features/workspace/workspace-data.ts", {
    react: h.react, "../../api/client": local.client, "../../auth/session": session,
  });
  const names = ["Badge", "DataState", "EmptyState", "EntityPicker", "EquipmentIdentity", "NextStep", "PageHeading", "Pagination", "RelatedName", "SearchField"];
  const icons = ["ArrowRight", "CalendarDays", "CheckCircle2", "Clock3", "Info", "Plus", "RefreshCw", "Users", "Wrench"];
  let params = new URLSearchParams(search);
  const module = local.load("features/workspace/OperationsPages.tsx", {
    react: h.react, "react/jsx-runtime": h.jsx,
    "react-router-dom": { Link: "a", useSearchParams: () => [params, next => { params = typeof next === "function" ? next(params) : next; }] },
    "lucide-react": Object.fromEntries(icons.map(name => [name, name])),
    "../../auth/session": session, "../../api/client": local.client,
    "../../components/Badges": { PriorityBadge: "PriorityBadge" },
    "./WorkspaceUI": Object.fromEntries(names.map(name => [name, name])),
    "./WorkOrderBoard": { default: "WorkOrderBoard" },
    "./service-detail-data": local.load("features/workspace/service-detail-data.ts"),
    "./calendar-preview":local.load("features/workspace/calendar-preview.ts"),
    "./workspace-data": { ...data, useWorkspaceData: (area, path) => { calls.push({ area, path }); return { loading: false, data: response }; } },
  });
  return { render: (name, props) => h.render(module[name], props), calls };
}

test("Technician work list always requests own assignments; manager list does not force mine", () => {
  for (const role of ["TECHNICIAN", "SERVICE_MANAGER"]) {
    const fixture = operationsFixture({ roles: [role], userType: "TENANT_STAFF" }, "status=ASSIGNED&page=2&view=list", { items: [], total: 25 });
    fixture.render("WorkspaceWorkOrdersPage");
    const url = new URL(fixture.calls[0].path, "http://local");
    assert.equal(url.searchParams.get("mine"), role === "TECHNICIAN" ? "true" : null);
    assert.equal(url.searchParams.get("page"), "2");
    assert.equal(url.searchParams.get("status"), "ASSIGNED");
  }
});

test("request filtering and totals come from the server, including later pages and pending approval", () => {
  const fixture = operationsFixture({ roles: ["CUSTOMER_USER"], userType: "CUSTOMER" }, "page=3&q=pump&status=AWAITING_CUSTOMER_APPROVAL", { items: [], total: 79 });
  const tree = fixture.render("WorkspaceRequestsPage");
  const url = new URL(fixture.calls[0].path, "http://local");
  assert.equal(url.searchParams.get("page"), "3");
  assert.equal(url.searchParams.get("pageSize"), "20");
  assert.equal(url.searchParams.get("q"), "pump");
  assert.equal(url.searchParams.get("status"), "AWAITING_CUSTOMER_APPROVAL");
  assert.equal(nodes(tree, n => n.type === "Pagination")[0].props.total, 79);
});

test("customer maintenance history never renders internal notes and uses inclusive Vietnam date bounds", () => {
  const fixture = operationsFixture({ roles: ["CUSTOMER_ADMIN"], userType: "CUSTOMER" }, "from=2026-11-01&to=2026-11-06", {
    items: [{ id: "history", eventType: "PLAN_UPDATED", reasonInternal: "PRIVATE_REASON", actorId: "PRIVATE_ACTOR_ID", customerNote: "Public explanation" }], total: 1,
  });
  const tree = fixture.render("WorkspaceMaintenanceHistoryPage");
  const text = JSON.stringify(nodes(tree, n => ["p", "h3", "time", "dd"].includes(n.type)));
  assert.equal(text.includes("PRIVATE_REASON"), false);
  assert.equal(text.includes("PRIVATE_ACTOR_ID"), false);
  assert.equal(text.includes("Public explanation"), true);
  const history = fixture.calls.find(call => call.path?.startsWith("/maintenance-history?"));
  const url = new URL(history.path, "http://local");
  assert.equal(url.searchParams.get("from"), "2026-11-01T00:00:00+07:00");
  assert.equal(url.searchParams.get("to"), "2026-11-06T23:59:59.999+07:00");
});
