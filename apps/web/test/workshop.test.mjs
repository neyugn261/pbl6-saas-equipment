import assert from "node:assert/strict";
import test from "node:test";
import { hooks, nodes, webTab } from "./helpers/web-tab.mjs";

const icons = Object.fromEntries(
  [
    "ArrowRight",
    "ArrowUpRight",
    "CalendarDays",
    "ChevronRight",
    "ClipboardList",
    "LogOut",
    "Plus",
    "RefreshCw",
    "Search",
    "UserRound",
    "Wrench",
  ].map((name) => [name, name]),
);
const ui = Object.fromEntries(
  [
    "Badge",
    "DataState",
    "EmptyState",
    "PageHeading",
    "RelatedName",
    "EquipmentIdentity",
  ].map((name) => [name, name]),
);

test("Workshop board passes server filters into each independent lane and links the full filtered list", () => {
  const tab = webTab(async () => {
    throw new Error("Unexpected request");
  });
  const h = hooks(),
    calls = [];
  const { default: Board } = tab.load("features/workspace/WorkOrderBoard.tsx", {
    "react/jsx-runtime": h.jsx,
    "react-router-dom": { Link: "a" },
    "lucide-react": icons,
    "../../components/Badges": { PriorityBadge: "PriorityBadge" },
    "./WorkspaceUI": ui,
    "./service-detail-data": {
      workOrderNextStep: () => ["Kiểm tra công việc"],
      recordAge: () => "2 ngày",
    },
    "./workspace-data": {
      value: String,
      asRow: (value) => value ?? {},
      formatDate: String,
      useWorkspaceData: (area, path) => {
        calls.push({ area, path });
        return { loading: false, data: { items: [], total: 12 } };
      },
    },
  });
  const filters = new URLSearchParams(
    "q=pump&priority=HIGH&type=REPAIR&page=8",
  );
  const tree = Board({ filters, revision: 2, refresh() {} });
  const lanes = nodes(tree, (n) => typeof n.type === "function");
  assert.equal(lanes.length, 4);
  for (const lane of lanes) {
    const rendered = lane.type(lane.props);
    const url = new URL(calls.at(-1).path, "http://local");
    assert.equal(url.searchParams.get("page"), "1");
    assert.equal(url.searchParams.get("pageSize"), "4");
    assert.equal(url.searchParams.get("q"), "pump");
    assert.equal(url.searchParams.get("priority"), "HIGH");
    assert.equal(url.searchParams.get("type"), "REPAIR");
    assert.equal(url.searchParams.get("status"), lane.props.status);
    const href = nodes(rendered, (n) => n.type === "a")[0].props.to;
    const list = new URL(href, "http://local");
    assert.equal(list.searchParams.get("view"), "list");
    assert.equal(list.searchParams.get("q"), "pump");
    assert.equal(list.searchParams.get("status"), lane.props.status);
    assert.equal(list.searchParams.has("pageSize"), false);
  }
  const completed = Board({
    filters: new URLSearchParams("status=COMPLETED"),
    revision: 0,
    refresh() {},
  });
  assert.equal(nodes(completed, (n) => typeof n.type === "function").length, 1);
});

test("Field Desk covers responsibility queues and never sends unsupported sort to handovers or tasks", () => {
  const tab = webTab(async () => {});
  const { decisionGroups, decisionQueues, queuePath, queueListPath } = tab.load(
    "features/workspace/decision-queues.ts",
  );
  assert.equal(decisionGroups.length, 4);
  for (const status of [
    "ACCEPTED",
    "AWAITING_INFO",
    "AWAITING_CUSTOMER_APPROVAL",
    "RESOLVED",
    "PENDING_CUSTOMER_CONFIRMATION",
    "FAILED",
  ]) {
    assert.ok(decisionQueues.some((queue) => queue.status === status));
  }
  for (const queue of decisionQueues) {
    const url = new URL(queuePath(queue, "createdAt"), "http://local");
    assert.equal(
      url.searchParams.get("sort"),
      ["request", "order"].includes(queue.kind) ? "createdAt" : null,
    );
    assert.equal(url.searchParams.get("status"), queue.status);
    const list = new URL(queueListPath(queue, "createdAt"), "http://local");
    assert.equal(list.searchParams.get("status"), queue.status);
    if (queue.kind === "task")
      assert.equal(list.searchParams.get("tab"), "tasks");
  }
});

test("Field Desk selection is scoped to current queue rows and unavailable responses hide stale source links", () => {
  const tab = webTab(async () => {}),
    h = hooks();
  const queues = tab.load("features/workspace/decision-queues.ts");
  let state = {
    loading: false,
    data: {
      items: [
        { id: "one", requestNo: "SR-1", title: "One", status: "NEW" },
        { id: "two", requestNo: "SR-2", title: "Two", status: "NEW" },
      ],
      total: 23,
    },
  };
  const { QueueContents } = tab.load(
    "features/workspace/ServiceDecisionDesk.tsx",
    {
      react: h.react,
      "react/jsx-runtime": h.jsx,
      "react-router-dom": { Link: "a" },
      "lucide-react": icons,
      "../../auth/session": tab.session,
      "../../components/Badges": { PriorityBadge: "PriorityBadge" },
      "./WorkspaceUI": ui,
      "./RequestCoveragePreview": { default: "coverage" },
      "./decision-queues": queues,
      "./service-detail-data": tab.load(
        "features/workspace/service-detail-data.ts",
      ),
      "./workspace-data": {
        asRow: (input) => input ?? {},
        value: (input, fallback = "—") => input ?? fallback,
        formatDate: String,
        useWorkspaceData: () => state,
      },
    },
  );
  const render = () =>
    h.render(QueueContents, {
      queue: queues.decisionQueues[0],
      sort: "createdAt",
      revision: 0,
      refresh() {},
    });
  let tree = render();
  nodes(tree, (n) => n.type === "button")[1].props.onClick();
  tree = render();
  assert.ok(
    nodes(tree, (n) => n.props.to === "/app/service-requests/two").length,
  );
  assert.match(JSON.stringify(tree), /23 hồ sơ/);
  state = {
    loading: false,
    data: { items: [{ id: "three", status: "NEW" }], total: 1 },
  };
  tree = render();
  assert.equal(
    nodes(tree, (n) => n.props.to === "/app/service-requests/two").length,
    0,
  );
  assert.ok(
    nodes(tree, (n) => n.props.to === "/app/service-requests/three").length,
  );
  state = { loading: false, error: "Unavailable", data: state.data };
  tree = render();
  assert.equal(
    nodes(tree, (n) => n.props.to === "/app/service-requests/three").length,
    0,
  );
  assert.ok(
    nodes(
      tree,
      (n) => n.type === "DataState" && n.props.error === "Unavailable",
    ).length,
  );
});

test("Workshop shell preserves role navigation and highlights a child record's group", () => {
  const tab = webTab(async () => {
      throw new Error("Unexpected request");
    }),
    h = hooks();
  const roles = tab.load("features/workspace/role-workspace.ts");
  const profile = { fullName: "Nguyễn Minh", roles: ["SERVICE_MANAGER"] };
  const { default: Shell } = tab.load(
    "features/workspace/ServiceManagerShell.tsx",
    {
      "react/jsx-runtime": h.jsx,
      "react-router-dom": {
        Link: "a",
        NavLink: "NavLink",
        useLocation: () => ({ pathname: "/app/maintenance/plan-1" }),
        useNavigate: () => () => {},
      },
      "lucide-react": icons,
      "../../auth/session": {
        useSession: () => ({ profile, clear() {} }),
        logout: async () => {},
      },
      "../notifications/NotificationInbox": {
        NotificationBell: "NotificationBell",
      },
      "./role-workspace": roles,
      "./BranchManagement": { BranchScopeNotice: "BranchScopeNotice" },
    },
  );
  const tree = Shell({ children: "Actual route content" });
  const selected = nodes(
    tree,
    (n) => n.type === "a" && n.props["aria-current"] === "true",
  );
  assert.equal(selected[0].props.children, "Dịch vụ kỹ thuật");
  assert.ok(
    nodes(
      tree,
      (n) => n.type === "NavLink" && n.props.to === "/app/maintenance",
    ).length,
  );
  assert.equal(
    nodes(tree, (n) => n.props.to === "/app/inventory/transactions").length,
    0,
  );
  const main = nodes(tree, (n) => n.type === "main")[0];
  assert.ok(JSON.stringify(main).includes("Actual route content"));
});

test("Workshop shell keeps customer links in portal and hides tenant notifications from platform administration", () => {
  const tab = webTab(async () => {}),
    h = hooks();
  const roles = tab.load("features/workspace/role-workspace.ts");
  for (const role of Object.keys(roles.roleNames)) {
    const customer = role.startsWith("CUSTOMER"),
      platform = role === "PLATFORM_ADMIN";
    const { default: Shell } = tab.load(
      "features/workspace/ServiceManagerShell.tsx",
      {
        "react/jsx-runtime": h.jsx,
        "react-router-dom": {
          Link: "a",
          NavLink: "NavLink",
          useLocation: () => ({ pathname: "/dashboard" }),
          useNavigate: () => () => {},
        },
        "lucide-react": icons,
        "../../auth/session": {
          useSession: () => ({
            profile: {
              fullName: "Nguyễn Minh",
              roles: [role],
              userType: customer
                ? "CUSTOMER"
                : platform
                  ? "PLATFORM_STAFF"
                  : "TENANT_STAFF",
            },
          }),
          logout: async () => {},
        },
        "../notifications/NotificationInbox": {
          NotificationBell: "NotificationBell",
        },
        "./role-workspace": roles,
        "./BranchManagement": { BranchScopeNotice: "BranchScopeNotice" },
      },
    );
    const tree = Shell({ children: "Route" });
    const links = nodes(tree, (n) => n.type === "a" || n.type === "NavLink")
      .map((n) => n.props.to)
      .filter(Boolean);
    const prefix = customer ? "/portal/" : platform ? "/admin/" : "/app/";
    assert.ok(
      links.every((path) => path === "/dashboard" || path.startsWith(prefix)),
      role,
    );
    const bells = nodes(tree, (n) => n.type === "NotificationBell");
    assert.equal(bells.length, platform ? 0 : 1);
    if (customer) assert.equal(bells[0].props.href, "/portal/notifications");
    assert.equal(links.includes("/admin/audit-logs"), false);
  }
});
