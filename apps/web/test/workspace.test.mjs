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
      './TableToolbar': { default: 'table-toolbar' },
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
      "./ServiceDetailUI": { BusinessChanges: "BusinessChanges" },
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
    './TableToolbar': { __esModule: true, default: 'table-toolbar' },
    react: h.react, "react/jsx-runtime": h.jsx,
    "react-router-dom": { Link: "a", useSearchParams: () => [params, next => { params = typeof next === "function" ? next(params) : next; }] },
    "lucide-react": Object.fromEntries(icons.map(name => [name, name])),
    "../../auth/session": session, "../../api/client": local.client,
    "../../components/Badges": { PriorityBadge: "PriorityBadge" },
    "./WorkspaceUI": Object.fromEntries(names.map(name => [name, name])),
    "./ServiceDetailUI": { BusinessChanges: "BusinessChanges" },
    "./service-detail-data": local.load("features/workspace/service-detail-data.ts"),
    "./calendar-preview":local.load("features/workspace/calendar-preview.ts"),
    "./workspace-data": { ...data, useWorkspaceData: (area, path) => { calls.push({ area, path }); return { loading: false, data: response }; } },
  });
  return { render: (name, props) => h.render(module[name], props), calls, params: () => params };
}

test("Technician work list always requests own assignments; manager list does not force mine", () => {
  for (const roles of [["TECHNICIAN"], ["SERVICE_MANAGER"], ["TECHNICIAN", "SERVICE_MANAGER"]]) {
    const fixture = operationsFixture({ roles, userType: "TENANT_STAFF" }, "status=ASSIGNED&page=2&mine=false", { items: [], total: 25 });
    fixture.render("WorkspaceWorkOrdersPage");
    const url = new URL(fixture.calls[0].path, "http://local");
    assert.equal(url.searchParams.get("mine"), roles.length === 1 && roles[0] === "TECHNICIAN" ? "true" : null);
    assert.equal(url.searchParams.get("page"), "2");
    assert.equal(url.searchParams.get("status"), "ASSIGNED");
  }
});

test('technician directory keeps server filters and totals, replaces quick view with detail links and resets all criteria', () => {
  const fixture = operationsFixture({ roles: ['SERVICE_MANAGER'], userType: 'TENANT_STAFF' }, 'page=3&q=KT-01&status=AVAILABLE&branchId=branch&skillId=skill&preview=tech', {
    items: [{ id: 'tech', fullName: 'Nguyễn Văn A', employeeCode: 'KT-01', branchName: 'HCM', status: 'AVAILABLE', skills: [{ skillId: 'skill', name: 'Sửa bơm', level: 3 }] }], total: 45,
  });
  let tree = fixture.render('WorkspaceTechniciansPage');
  const url = new URL(fixture.calls[0].path, 'http://local');
  for (const [key, expected] of Object.entries({ q: 'KT-01', status: 'AVAILABLE', branchId: 'branch', skillId: 'skill', page: '3' })) assert.equal(url.searchParams.get(key), expected);
  assert.equal(url.searchParams.has('preview'), false);
  assert.equal(nodes(tree, node => node.type === 'Pagination')[0].props.total, 45);
  assert.equal(nodes(tree, node => node.type === 'button' && String(node.props.children).includes('Xem nhanh')).length, 0);
  assert.equal(nodes(tree, node => node.type === 'technician-quick-view').length, 0);
  assert.equal(nodes(tree, node => node.type === 'a' && node.props.children === 'Xem chi tiết')[0].props.to, '/app/technicians/tech');
  assert.ok(JSON.stringify(nodes(tree, node => node.type === 'td')).includes('Mức '));
  nodes(tree, node => node.type === 'EntityPicker' && node.props.label === 'Chi nhánh')[0].props.onChange('other-branch');
  tree = fixture.render('WorkspaceTechniciansPage');
  assert.equal(fixture.params().get('branchId'), 'other-branch');
  assert.equal(fixture.params().has('page'), false);
  nodes(tree, node => node.type === 'table-toolbar')[0].props.onReset();
  assert.equal(fixture.params().toString(), '');
  tree = fixture.render('WorkspaceTechniciansPage');
  assert.equal(nodes(tree, node => node.type === 'table-toolbar')[0].props.onReset, undefined);
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

test('request filter reset clears search, status, priority and sorting, and returns to the first page', () => {
  const fixture = operationsFixture({ roles: ['CUSTOMER_USER'], userType: 'CUSTOMER' }, 'page=3&q=pump&status=NEW&priority=HIGH&sort=createdAt&preview=request', { items: [], total: 79 });
  const tree = fixture.render('WorkspaceRequestsPage');
  nodes(tree, node => node.type === 'table-toolbar')[0].props.onReset();
  for (const key of ['q', 'status', 'priority', 'sort', 'page', 'preview']) {
    assert.equal(fixture.params().has(key), false);
  }
});

test('handover filters preserve the customer endpoint and clear the active search and status together', () => {
  const fixture = operationsFixture({ roles: ['CUSTOMER_USER'], userType: 'CUSTOMER' }, 'page=2&q=serial&status=ACTIVATED', { items: [], total: 21 });
  const tree = fixture.render('WorkspaceHandoverPage');
  assert.ok(fixture.calls[0].path.startsWith('/my/equipment-handovers?'));
  const toolbar = nodes(tree, node => node.type === 'table-toolbar')[0];
  assert.equal(toolbar.props.query, 'serial');
  toolbar.props.onReset();
  assert.equal(fixture.params().toString(), '');
  const resetTree = fixture.render('WorkspaceHandoverPage');
  assert.equal(nodes(resetTree, node => node.type === 'table-toolbar')[0].props.onReset, undefined);
});

test('request list and empty state offer creation only to customer accounts', () => {
  for (const role of ['SERVICE_MANAGER', 'CUSTOMER_ADMIN', 'CUSTOMER_USER']) {
    const customer = role !== 'SERVICE_MANAGER';
    const fixture = operationsFixture({ roles: [role], userType: customer ? 'CUSTOMER' : 'TENANT_STAFF' }, '', { items: [], total: 0 });
    const tree = fixture.render('WorkspaceRequestsPage');
    const heading = nodes(tree, node => node.type === 'PageHeading')[0];
    const actions = nodes(heading.props.actions, node => typeof node.props.to === 'string' && node.props.to.endsWith('/new'));
    assert.equal(actions.length, customer ? 1 : 0);
    const empty = nodes(tree, node => node.type === 'EmptyState')[0];
    assert.equal(Boolean(empty.props.action), customer);
    if (customer) assert.equal(actions[0].props.to, '/portal/requests/new');
  }
});

test('request lists expose a concise summary and full-detail links without any quick view, including old preview URLs', () => {
  const description = 'Bơm bị mất nguồn, cần kiểm tra tại cơ sở. '.repeat(10);
  for (const role of ['SERVICE_MANAGER', 'TENANT_ADMIN', 'CUSTOMER_ADMIN', 'CUSTOMER_USER']) {
    const customer = role.startsWith('CUSTOMER_');
    const fixture = operationsFixture({ roles: [role], userType: customer ? 'CUSTOMER' : 'TENANT_STAFF' }, 'page=2&q=pump&status=RESOLVED&preview=request', {
      items: [{ id: 'request', requestNo: 'SR-001', title: 'Máy bơm mất nguồn', type: 'REPAIR', description, status: 'RESOLVED', resolutionResult: 'PARTIALLY_RESOLVED', equipmentId: 'machine', customerId: 'customer', customerName: 'Nhà máy A', createdAt: '2026-11-12T13:13:00Z', internalNote: 'PRIVATE_NOTE', followUp: { responsibleRole: 'SERVICE_MANAGER', nextAction: 'INTERNAL_FOLLOW_UP' } }], total: 30,
    });
    const tree = fixture.render('WorkspaceRequestsPage');
    assert.equal(nodes(tree, node => node.type === 'record-quick-view').length, 0);
    assert.equal(nodes(tree, node => node.type === 'button' && node.props.children === 'Xem nhanh').length, 0);
    const detail = nodes(tree, node => node.type === 'a' && node.props.children === 'Xem chi tiết')[0];
    assert.equal(detail.props.to, `${customer ? '/portal/requests' : '/app/service-requests'}/request`);
    assert.equal(detail.props['aria-label'], 'Xem chi tiết yêu cầu SR-001');
    const excerpt = nodes(tree, node => node.props.className === 'ws-request-description')[0].props.children;
    assert.ok(excerpt.length <= 141);
    assert.ok(excerpt.endsWith('…'));
    assert.equal(nodes(tree, node => node.props.className === 'ws-request-title')[0].props.children, 'Máy bơm mất nguồn');
    assert.equal(nodes(tree, node => node.props.className === 'ws-request-type')[0].props.children, 'Sửa chữa');
    assert.equal(nodes(tree, node => node.props.className === 'ws-request-result')[0].props.children, 'Xử lý một phần');
    assert.equal(nodes(tree, node => node.props.className === 'ws-request-customer').length, customer ? 0 : 1);
    const visibleCells = JSON.stringify(nodes(tree, node => node.type === 'td'));
    assert.equal(visibleCells.includes('INTERNAL_FOLLOW_UP'), !customer);
    assert.equal(visibleCells.includes('PRIVATE_NOTE'), false);
    assert.equal(nodes(tree, node => node.type === 'time')[0].props.dateTime, '2026-11-12T13:13:00Z');
    assert.equal(fixture.params().get('page'), '2');
    assert.equal(fixture.params().get('q'), 'pump');
    assert.equal(new URL(fixture.calls[0].path, 'http://local').searchParams.has('preview'), false);
  }
});

test('request table avoids duplicate descriptions and hides age for a closed request', () => {
  const fixture = operationsFixture({ roles: ['CUSTOMER_USER'], userType: 'CUSTOMER' }, '', { items: [{ id: 'request', requestNo: 'SR-001', title: 'Máy bơm mất nguồn', description: 'Máy bơm mất nguồn', status: 'CLOSED', createdAt: '2026-11-12T13:13:00Z' }], total: 1 });
  const tree = fixture.render('WorkspaceRequestsPage');
  assert.equal(nodes(tree, node => node.props.className === 'ws-request-description').length, 0);
  assert.equal(JSON.stringify(tree).includes('Tuổi hồ sơ:'), false);
});

test('work orders use one list with dispatch facts, recorded job site and full-detail links even for legacy board URLs', () => {
  for (const role of ['SERVICE_MANAGER', 'TENANT_ADMIN', 'DISPATCHER', 'TECHNICIAN']) {
    const fixture = operationsFixture({ roles: [role], userType: 'TENANT_STAFF' }, 'page=2&q=pump&status=ASSIGNED&view=board&preview=order', {
      items: [{ id: 'order', workOrderNo: 'WO-001', title: 'Kiểm tra máy bơm', type: 'INSPECTION', status: 'ASSIGNED', priority: 'HIGH', equipmentId: 'machine', customerId: 'customer', customerName: 'Nhà máy A', customerSiteId: 'recorded-site', currentTechnicianId: 'tech', currentTechnicianName: 'Nguyễn Văn A', scheduledStart: '2026-11-23T02:00:00Z', scheduledEnd: '2026-11-23T04:00:00Z' }], total: 30,
    });
    const tree = fixture.render('WorkspaceWorkOrdersPage');
    assert.equal(nodes(tree, node => node.type === 'table').length, 1);
    assert.equal(nodes(tree, node => node.type === 'table')[0].props.className, 'ws-table ws-workorder-table');
    assert.equal(nodes(tree, node => node.type === 'th').length, 7);
    assert.equal(nodes(tree, node => node.type === 'button' && node.props.children === 'Xem nhanh').length, 0);
    assert.equal(nodes(tree, node => node.props.className === 'workshop-view-switch').length, 0);
    assert.equal(nodes(tree, node => node.type === 'record-quick-view' || node.type === 'WorkOrderBoard').length, 0);
    const detail = nodes(tree, node => node.type === 'a' && node.props.children === 'Xem chi tiết')[0];
    assert.equal(detail.props.to, '/app/work-orders/order');
    assert.equal(detail.props['aria-label'], 'Xem chi tiết lệnh WO-001');
    assert.equal(nodes(tree, node => node.props.className === 'ws-order-title')[0].props.children, 'Kiểm tra máy bơm');
    assert.equal(nodes(tree, node => node.type === 'PriorityBadge')[0].props.priority, 'HIGH');
    assert.equal(nodes(tree, node => node.type === 'RelatedName' && node.props.path === '/technicians/tech')[0].props.initial, 'Nguyễn Văn A');
    assert.equal(nodes(tree, node => node.type === 'RelatedName' && node.props.path === '/sites/recorded-site').length, 1);
    assert.equal(nodes(tree, node => node.type === 'EquipmentIdentity')[0].props.showCurrentSite, undefined);
    assert.equal(nodes(tree, node => node.props.className === 'ws-order-schedule')[0].props.children.includes('23/11/2026'), true);
    const url = new URL(fixture.calls[0].path, 'http://local');
    for (const key of ['view', 'preview']) assert.equal(url.searchParams.has(key), false);
    assert.equal(url.searchParams.get('q'), 'pump');
    assert.equal(url.searchParams.get('page'), '2');
    assert.equal(nodes(tree, node => node.type === 'Pagination')[0].props.total, 30);
  }
});

test('work-order filters preserve deep-link conditions, can clear each context and reset all criteria without changing technician scope', () => {
  const search = 'page=3&q=pump&status=ACCEPTED,TRAVELLING,IN_PROGRESS&priority=HIGH&type=INSPECTION&sort=scheduledStart&technicianId=tech&customerId=customer&equipmentId=machine&serviceRequestId=request&branchId=branch&unallocated=true&scheduledFrom=2026-11-23T00:00:00Z&scheduledTo=2026-11-24T00:00:00Z&view=board&preview=order';
  const fixture = operationsFixture({ roles: ['TECHNICIAN'], userType: 'TENANT_STAFF' }, search, { items: [], total: 0 });
  let tree = fixture.render('WorkspaceWorkOrdersPage');
  const url = new URL(fixture.calls[0].path, 'http://local');
  for (const key of ['technicianId', 'customerId', 'equipmentId', 'serviceRequestId', 'branchId', 'scheduledFrom', 'scheduledTo', 'unallocated', 'type']) {
    assert.equal(url.searchParams.get(key), new URLSearchParams(search).get(key));
  }
  const status = nodes(tree, node => typeof node.type === 'function' && node.type.name === 'StatusSelect')[0];
  assert.ok(status.props.options.includes('ACCEPTED,TRAVELLING,IN_PROGRESS'));
  nodes(tree, node => node.props['aria-label'] === 'Bỏ điều kiện Khách hàng đã chọn')[0].props.onClick();
  assert.equal(fixture.params().has('customerId'), false);
  assert.equal(fixture.params().get('equipmentId'), 'machine');
  assert.equal(fixture.params().get('status'), 'ACCEPTED,TRAVELLING,IN_PROGRESS');
  assert.equal(fixture.params().has('preview'), false);
  assert.equal(fixture.params().has('view'), false);
  tree = fixture.render('WorkspaceWorkOrdersPage');
  nodes(tree, node => node.type === 'select' && node.props['aria-label'] === 'Loại công việc')[0].props.onChange({ target: { value: 'REPAIR' } });
  assert.equal(fixture.params().get('type'), 'REPAIR');
  tree = fixture.render('WorkspaceWorkOrdersPage');
  nodes(tree, node => node.type === 'table-toolbar')[0].props.onReset();
  assert.equal(fixture.params().toString(), '');
  tree = fixture.render('WorkspaceWorkOrdersPage');
  assert.equal(nodes(tree, node => node.type === 'table-toolbar')[0].props.onReset, undefined);
  assert.equal(new URL(fixture.calls.at(-1).path, 'http://local').searchParams.get('mine'), 'true');
});

test('work orders distinguish unknown schedules, actual completion and historical assignees', () => {
  const fixture = operationsFixture({ roles: ['SERVICE_MANAGER'], userType: 'TENANT_STAFF' }, '', {
    items: [{ id: 'pending', status: 'CREATED' }, { id: 'done', status: 'COMPLETED', completedAt: '2026-11-23T04:00:00Z' }], total: 2,
  });
  const tree = fixture.render('WorkspaceWorkOrdersPage');
  const assignees = nodes(tree, node => node.type === 'td' && node.props['data-label'] === 'Phụ trách');
  assert.equal(assignees[0].props.children, 'Chưa phân công');
  assert.equal(assignees[1].props.children, 'Xem lịch sử phân công');
  assert.equal(nodes(tree, node => node.props.className === 'ws-order-schedule')[0].props.children, 'Chưa có lịch dự kiến');
  assert.ok(JSON.stringify(nodes(tree, node => node.props.className === 'ws-order-actual')).includes('Hoàn tất'));
});

test('equipment identity uses the model name when needed and does not repeat the same equipment code', () => {
  for (const model of [{ name: 'Máy bơm tuần hoàn' }, null]) {
    const tab = webTab(async () => {}), h = hooks();
    const data = tab.load('features/workspace/workspace-data.ts', { react: h.react, '../../api/client': tab.client, '../../auth/session': tab.session });
    const { EquipmentIdentity } = tab.load('features/workspace/WorkspaceUI.tsx', {
      react: h.react, 'react/jsx-runtime': h.jsx, 'react-router-dom': { Link: 'a' },
      'lucide-react': { AlertCircle: 'icon', ArrowRight: 'icon', Inbox: 'icon', RefreshCw: 'icon', Search: 'icon' }, './workspace.css': {},
      './workspace-data': { ...data, useWorkspaceData: () => ({ loading: false, data: { displayName: null, assetCode: 'MB-001', serialNumber: '000123', model } }) },
    });
    const tree = h.render(EquipmentIdentity, { equipmentId: 'machine' });
    assert.equal(nodes(tree, node => node.type === 'strong')[0].props.children, model?.name ?? 'MB-001');
    assert.equal((JSON.stringify(tree).match(/MB-001/g) ?? []).length, 1);
    assert.ok(JSON.stringify(tree).includes('000123'));
  }
});

test("customer maintenance history never renders internal notes and uses inclusive Vietnam date bounds", () => {
  const fixture = operationsFixture({ roles: ["CUSTOMER_ADMIN"], userType: "CUSTOMER" }, "from=2026-11-01&to=2026-11-06", {
    items: [{ id: "history", eventType: "PLAN_UPDATED", reasonInternal: "PRIVATE_REASON", actorId: "PRIVATE_ACTOR_ID", customerNote: "Public explanation", changes: {
      status: { before: "ACTIVE", after: "PAUSED" },
      nextDueDate: { before: "2026-11-12", after: "2027-02-12" },
      reasonInternal: { before: null, after: "PRIVATE_CHANGE_REASON" },
    } }], total: 1,
  });
  const tree = fixture.render("WorkspaceMaintenanceHistoryPage");
  const text = JSON.stringify(nodes(tree, n => ["p", "h3", "time", "dd"].includes(n.type)));
  assert.equal(text.includes("PRIVATE_REASON"), false);
  assert.equal(text.includes("PRIVATE_ACTOR_ID"), false);
  assert.equal(text.includes("Public explanation"), true);
  const comparison = nodes(tree, n => n.type === "BusinessChanges")[0];
  assert.deepEqual(Object.keys(comparison.props.data), ["status", "nextDueDate"]);
  assert.equal(JSON.stringify(comparison.props.data).includes("PRIVATE_CHANGE_REASON"), false);
  const history = fixture.calls.find(call => call.path?.startsWith("/maintenance-history?"));
  const url = new URL(history.path, "http://local");
  assert.equal(url.searchParams.get("from"), "2026-11-01T00:00:00+07:00");
  assert.equal(url.searchParams.get("to"), "2026-11-06T23:59:59.999+07:00");
});
