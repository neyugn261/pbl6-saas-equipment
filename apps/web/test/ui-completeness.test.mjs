import assert from "node:assert/strict";
import test from "node:test";
import { hooks, nodes, settle, webTab } from "./helpers/web-tab.mjs";
import { draftHook } from "./helpers/draft.mjs";
import { detailUI } from "./helpers/service-detail.mjs";

test("quantity entry and display preserve exact decimals and distinguish fractional units", () => {
  const tab = webTab(async () => {}),
    values = tab.load("features/workspace/ui-values.ts");
  assert.equal(values.quantityText("2.000"), "2");
  assert.equal(values.quantityText("2000.50"), "2.000,5");
  assert.equal(
    values.quantityText("123456789012345678.90"),
    "123.456.789.012.345.678,9",
  );
  assert.equal(values.quantityInput("2,5", true), "2.5");
  assert.equal(values.quantityInput(values.quantityEntry("2000.50")), "2000.5");
  assert.equal(values.quantityEntry("1000.000"), "1000");
  assert.equal(values.quantityInput("2,5", false), null);
  assert.equal(values.quantityInput("2.00", false), "2.00");
  for (const invalid of ["0", "-1", "2,500", "2.500.000", "NaN"])
    assert.equal(values.quantityInput(invalid), null);
  assert.equal(
    values.vietnamInstant("2026-11-09T09:30"),
    "2026-11-09T02:30:00.000Z",
  );
});

test("maintenance preview retains the anchor through short months and leap years", () => {
  const tab = webTab(async () => {}),
    { maintenanceDates } = tab.load("features/workspace/calendar-preview.ts");
  assert.deepEqual(Array.from(maintenanceDates("2027-01-31", "MONTH", 1)), [
    "2027-01-31",
    "2027-02-28",
    "2027-03-31",
    "2027-04-30",
  ]);
  assert.deepEqual(Array.from(maintenanceDates("2024-02-29", "YEAR", 1, 5)), [
    "2024-02-29",
    "2025-02-28",
    "2026-02-28",
    "2027-02-28",
    "2028-02-29",
  ]);
  for (const args of [
    ["2027-02-31", "MONTH", 1],
    ["2027-01-31", "MONTH", 0],
    ["2027-01-31", "MONTH", 1.5],
  ])
    assert.equal(maintenanceDates(...args).length, 0);
});

test("drafts are scoped, malformed records are rejected and unresolved submissions cannot expire into an unlocked form", () => {
  const tab = webTab(async () => {}),
    draft = tab.load("features/workspace/ui-draft.ts");
  const a = draft.draftKey(
    { id: "a", tenantId: "one", userType: "TENANT_STAFF" },
    "request:new",
  );
  const b = draft.draftKey(
    { id: "a", tenantId: "two", userType: "TENANT_STAFF" },
    "request:new",
  );
  const initial = { title: "", submissionPending: false };
  draft.storeDraft(a, { title: "PRIVATE", submissionPending: true });
  assert.equal(draft.loadDraft(b, initial).title, "");
  const saved = JSON.parse(tab.sessionStorage.getItem(a));
  saved.expiresAt = 1;
  tab.sessionStorage.setItem(a, JSON.stringify(saved));
  assert.equal(draft.loadDraft(a, initial).submissionPending, true);
  saved.values.submissionPending = false;
  tab.sessionStorage.setItem(a, JSON.stringify(saved));
  assert.equal(draft.loadDraft(a, initial).title, "");
  saved.expiresAt = Date.now() + 100000;
  saved.values.title = { unexpected: "value" };
  tab.sessionStorage.setItem(a, JSON.stringify(saved));
  assert.equal(draft.loadDraft(a, initial).title, "");
  draft.clearDraft(a);
  assert.equal(tab.sessionStorage.getItem(a), null);
});

test("form drafts survive remount and never render the previous account after a profile change", () => {
  const tab = webTab(async () => {});
  let profile = { id: "one", tenantId: "tenant", userType: "TENANT_STAFF" };
  const session = { useSession: () => ({ profile }) },
    a = hooks(),
    module = draftHook(tab, a, session);
  let form = a.render(() => module.useFormDraft("report:wo", { text: "" }));
  form[1]({ text: "Saved work" });
  const b = hooks(),
    second = draftHook(tab, b, session);
  assert.equal(
    b.render(() => second.useFormDraft("report:wo", { text: "" }))[0].text,
    "Saved work",
  );
  profile = { ...profile, id: "two" };
  assert.equal(
    a.render(() => module.useFormDraft("report:wo", { text: "" }))[0].text,
    "",
  );
});

test("sections deep-link, mount only visited panels and preserve a visited editor", () => {
  const h = hooks(),
    tab = webTab(async () => {});
  tab.window.location = { hash: "#section=parts" };
  tab.window.history = {
    replaceState: (_, __, value) => {
      tab.window.location.hash = value;
    },
  };
  const { ServiceSections } = detailUI(tab, h);
  const props = {
    items: [
      {
        key: "profile",
        label: "Profile",
        content: h.jsx.jsx("profile", { children: "Profile editor" }),
      },
      {
        key: "parts",
        label: "Parts",
        content: h.jsx.jsx("parts", { children: "Parts editor" }),
      },
    ],
  };
  let tree = h.render(ServiceSections, props);
  assert.equal(nodes(tree, (n) => n.type === "profile").length, 0);
  assert.equal(nodes(tree, (n) => n.type === "parts").length, 1);
  nodes(
    tree,
    (n) => n.type === "button" && n.props.children === "Profile",
  )[0].props.onClick();
  tree = h.render(ServiceSections, props);
  assert.equal(tab.window.location.hash, "#section=profile");
  assert.equal(nodes(tree, (n) => n.type === "profile").length, 1);
  assert.equal(nodes(tree, (n) => n.type === "parts").length, 1);
  assert.equal(
    nodes(tree, (n) => n.props.id?.endsWith("-parts"))[0].props.hidden,
    true,
  );
});

function estimatesFixture({ lose = false, readFails = false } = {}) {
  const h = hooks(),
    tab = webTab(async () => {}),
    calls = [],
    events = [];
  const session = {
    ...tab.session,
    useSession: () => ({
      profile: {
        id: "customer",
        tenantId: "t",
        customerId: "c",
        userType: "CUSTOMER",
        roles: ["CUSTOMER_ADMIN"],
      },
    }),
  };
  let changed = false,
    failRead = readFails;
  const rows = () => [
    {
      id: "e1",
      revisionNo: 1,
      status: changed ? "APPROVED" : "SENT",
      currency: "VND",
      totalAmount: "250000",
      items: [
        {
          itemType: "LABOR",
          description: "Kiểm tra",
          quantity: "1",
          unitPrice: "250000",
        },
      ],
    },
  ];
  const api = {
    requestsLive: async (path, options) => {
      calls.push({ path, options });
      if (options) {
        if (lose) throw new TypeError("Lost response");
        changed = true;
        return {};
      }
      if (changed && failRead) {
        failRead = false;
        throw new TypeError("Read unavailable");
      }
      return rows();
    },
  };
  const component = tab.load("routes/EstimatePanel.tsx", {
    react: h.react,
    "react/jsx-runtime": h.jsx,
    "../api/client": { ...tab.client, api },
    "../auth/session": session,
    "../features/workspace/service-detail-data": tab.load(
      "features/workspace/service-detail-data.ts",
    ),
    "../features/workspace/use-form-draft": draftHook(tab, h, session),
    "../features/workspace/EstimateReview": {
      __esModule: true,
      default: "estimate-review",
    },
  }).default;
  const props = {
    requestId: "sr1",
    requestNo: "SR-1",
    allowedActions: ["approve-estimate", "reject-estimate"],
    onChange: () => events.push("refresh"),
  };
  return { h, tab, calls, events, render: () => h.render(component, props) };
}

test("customer approval reads the exact revision before any POST and sends no forged actor", async () => {
  const s = estimatesFixture();
  s.render();
  await settle();
  let tree = s.render();
  nodes(
    tree,
    (n) => n.type === "button" && n.props.children === "Chấp nhận",
  )[0].props.onClick();
  assert.equal(s.calls.filter((call) => call.options).length, 0);
  tree = s.render();
  const review = nodes(tree, (n) => n.type === "estimate-review")[0];
  assert.equal(review.props.estimate.id, "e1");
  const dialog = nodes(tree, (n) => n.type === "dialog")[0];
  await nodes(dialog, (n) => n.type === "form")[0].props.onSubmit({
    preventDefault() {},
  });
  await settle();
  assert.deepEqual(
    JSON.parse(JSON.stringify(s.calls.find((call) => call.options))),
    {
      path: "/service-requests/estimates/e1/approve",
      options: { method: "POST" },
    },
  );
  assert.ok(JSON.stringify(s.render()).includes("Đã ghi nhận"));
});

test("uncertain estimate keeps the write lock while the recovery read remains enabled", async () => {
  const s = estimatesFixture({ lose: true });
  s.render();
  await settle();
  let tree = s.render();
  nodes(
    tree,
    (n) => n.type === "button" && n.props.children === "Chấp nhận",
  )[0].props.onClick();
  tree = s.render();
  await nodes(
    nodes(tree, (n) => n.type === "dialog")[0],
    (n) => n.type === "form",
  )[0].props.onSubmit({ preventDefault() {} });
  await settle();
  tree = s.render();
  const retry = nodes(
    tree,
    (n) =>
      n.type === "button" && n.props.children === "Kiểm tra phiên bản đã lưu",
  )[0];
  assert.equal(retry.props.disabled, false);
  const before = s.calls.length;
  retry.props.onClick();
  await settle();
  tree = s.render();
  assert.ok(s.calls.length > before);
  assert.equal(s.calls.filter((call) => call.options).length, 1);
  assert.equal(
    nodes(
      tree,
      (n) => n.type === "button" && n.props.children === "Chấp nhận",
    )[0].props.disabled,
    true,
  );
});

test("a confirmed estimate write followed by a failed read is recoverable without resending the write", async () => {
  const s = estimatesFixture({ readFails: true });
  s.render();
  await settle();
  let tree = s.render();
  nodes(
    tree,
    (n) => n.type === "button" && n.props.children === "Chấp nhận",
  )[0].props.onClick();
  tree = s.render();
  await nodes(
    nodes(tree, (n) => n.type === "dialog")[0],
    (n) => n.type === "form",
  )[0].props.onSubmit({ preventDefault() {} });
  await settle();
  tree = s.render();
  assert.ok(JSON.stringify(tree).includes("Thay đổi đã được ghi nhận"));
  nodes(
    tree,
    (n) =>
      n.type === "button" && n.props.children === "Kiểm tra phiên bản đã lưu",
  )[0].props.onClick();
  await settle();
  tree = s.render();
  assert.equal(s.calls.filter((call) => call.options).length, 1);
  assert.equal(
    nodes(
      tree,
      (n) =>
        n.type === "button" && n.props.children === "Kiểm tra phiên bản đã lưu",
    ).length,
    0,
  );
});

function requestFixture() {
  const h = hooks(),
    tab = webTab(async () => {}),
    calls = [],
    navigations = [];
  const row = {
    id: "eq-1",
    customerId: "c",
    customerSiteId: "site",
    assetCode: "TB-1",
    serialNumber: "S-1",
    status: "ACTIVE",
  };
  let results = [row];
  const session = {
    ...tab.session,
    useSession: () => ({
      profile: {
        id: "c-user",
        tenantId: "t",
        customerId: "c",
        userType: "CUSTOMER",
        roles: ["CUSTOMER_USER"],
      },
    }),
  };
  const api = {
    requestsLive: async (path, options) => {
      calls.push({ path, options });
      return { id: "created" };
    },
  };
  const { default: Component } = tab.load("routes/NewServiceRequest.tsx", {
    react: h.react,
    "react/jsx-runtime": h.jsx,
    "react-router-dom": {
      Link: "a",
      useLocation: () => ({ search: "?equipmentId=eq-1" }),
      useNavigate:
        () =>
        (...args) =>
          navigations.push(args),
    },
    "lucide-react": { Boxes: "Boxes" },
    "../api/client": { ...tab.client, api },
    "../auth/session": session,
    "./registration-data": {
      useDirectory: (_, path) => ({
        loading: false,
        error: "",
        value: path?.startsWith("/equipment?")
          ? { items: results, total: results.length }
          : row,
      }),
    },
    "./demo-request": { rememberDemoRequest() {} },
    "../components/Badges": { StatusBadge: "badge" },
    "../features/workspace/WorkspaceUI": {
      PageHeading: "heading",
      RelatedName: "related-name",
    },
    "../features/workspace/use-form-draft": draftHook(tab, h, session),
  });
  const render = () => h.render(Component);
  function edit(label, text) {
    const tree = render(),
      field = nodes(
        tree,
        (n) =>
          n.type === "label" &&
          Array.isArray(n.props.children) &&
          n.props.children[0]?.trim?.() === label,
      )[0];
    nodes(field, (n) =>
      ["input", "textarea"].includes(n.type),
    )[0].props.onChange({ target: { value: text } });
  }
  return {
    render,
    edit,
    calls,
    navigations,
    empty: () => {
      results = [];
    },
  };
}

test("selected equipment remains submittable when the search page is empty and context is sent in the description", async () => {
  const s = requestFixture();
  s.edit("Tiêu đề", "Máy rung");
  s.edit("Mô tả", "Rung khi tăng tải");
  s.empty();
  const tree = s.render(),
    send = nodes(
      tree,
      (n) => n.type === "button" && n.props.children === "Gửi yêu cầu dịch vụ",
    )[0];
  assert.equal(send.props.disabled, false);
  await nodes(tree, (n) => n.type === "form")[0].props.onSubmit({
    preventDefault() {},
  });
  await settle();
  assert.equal(s.calls[0].options.body.equipmentId, "eq-1");
  assert.equal(s.calls[0].options.body.customerId, undefined);
  assert.equal(s.navigations[0][0], "/portal/requests/created");
});

test("concurrent workspace reads deduplicate per session and a refresh starts a fresh request", async () => {
  const h = hooks(),
    tab = webTab(async () => {}),
    pending = [];
  const module = tab.load("features/workspace/workspace-data.ts", {
    react: h.react,
    "../../auth/session": tab.session,
    "../../api/client": {
      ...tab.client,
      api: { assetM2: () => new Promise((resolve) => pending.push(resolve)) },
    },
  });
  const render = (revision) =>
    h.render(() => [
      module.useWorkspaceData("assetM2", "/equipment/one", revision),
      module.useWorkspaceData("assetM2", "/equipment/one", revision),
    ]);
  render(0);
  assert.equal(pending.length, 1);
  render(1);
  assert.equal(pending.length, 2);
  pending[0]({ name: "OLD" });
  pending[1]({ name: "CURRENT" });
  await settle();
  assert.equal(render(1)[0].data.name, "CURRENT");
});

test("design journeys cover all roles, use anchored dates and reject actual time overlaps", () => {
  const tab = webTab(async () => {}),
    calendar = tab.load("features/workspace/calendar-preview.ts");
  const design = tab.load("features/design/design-data.ts", {
    "../workspace/calendar-preview": calendar,
  });
  assert.equal(design.journeys.length, 12);
  for (const role of Object.keys(design.designRoles))
    assert.ok(
      design.journeys.some((journey) => journey.roles.includes(role)),
      role,
    );
  assert.equal(
    design.overlaps(
      "2026-11-09T09:30",
      "2026-11-09T11:30",
      "2026-11-09T09:00",
      "2026-11-09T11:00",
    ),
    true,
  );
  assert.equal(
    design.overlaps(
      "2026-11-09T11:00",
      "2026-11-09T12:00",
      "2026-11-09T09:00",
      "2026-11-09T11:00",
    ),
    false,
  );
  assert.equal(
    design.decimalHundred("123456789012345678,90"),
    12345678901234567890n,
  );
});
