import test from "node:test";
import assert from "node:assert/strict";
import { hooks, nodes, settle, webTab } from "./helpers/web-tab.mjs";
import { detailUI, expand } from "./helpers/service-detail.mjs";
import { draftHook } from "./helpers/draft.mjs";

const available = (data) => ({ status: "AVAILABLE", data });
const emptyPage = { items: [], total: 0, page: 1, pageSize: 20 };
const unavailable = { status: "UNAVAILABLE", data: null };
const dossier = {
  equipment: {
    id: "equipment-id",
    assetCode: "EQ-01",
    serialNumber: "SER-01",
    displayName: "Máy bơm nước",
    status: "ACTIVE",
    technicalSpecifications: { "Công suất": "2 kW" },
  },
  warranties: [],
  calendarCoverage: { result: "IN_WARRANTY" },
  operationalCondition: { status: "UNKNOWN" },
  profileCompleteness: {
    missingFields: ["commissionedDate"],
    legacyHistoryMayBeIncomplete: false,
  },
  customer: available({ name: "Nhà máy A" }),
  site: available({ name: "Xưởng A" }),
  location: available({ name: "Tầng 1" }),
  contacts: available([]),
  requests: available(emptyPage),
  workOrders: unavailable,
  maintenance: unavailable,
  maintenanceHistory: available(emptyPage),
  timelinePreview: emptyPage,
  latestRecordedService: { entry: null },
  asOf: "2026-11-06T02:00:00Z",
};
function setup(name, asset = dossier, kind = "plan", overrides = {}) {
  const calls = [],
    h = hooks(),
    tab = webTab(async () => {}),
    session = {
      ...tab.session,
      useSession: () => ({
        profile: {
          id: "manager",
          tenantId: "tenant",
          roles: ["SERVICE_MANAGER"],
          userType: "TENANT_STAFF",
        },
      }),
    };
  tab.window.setInterval = () => 1;
  tab.window.clearInterval = () => {};
  const api = {
    assetM2: async (path) => {
      calls.push(path);
      return path.endsWith("/dossier")
        ? asset
        : { displayName: "Máy bơm nước", assetCode: "EQ-01" };
    },
    maintenance: async (path) => {
      calls.push(path);
      return path.includes("/history?")
        ? emptyPage
        : path.includes("/journey?")
          ? {
              history: emptyPage,
              replacements: [
                {
                  requestId: "request-id",
                  replacementWorkOrderId: "replacement-uuid",
                  status: "PENDING",
                },
              ],
              workOrders: [
                { workOrderId: "old-order-uuid", state: "CANCELLED" },
              ],
              allowedActions: [],
              waitingFor: "WORK_ORDER_SERVICE",
            }
          : {
              id: "record",
              name: "Bảo trì bơm",
              status: kind === "task" ? "PENDING" : "ACTIVE",
              equipmentId: "equipment-id",
              frequencyValue: 1,
              frequencyUnit: "MONTH",
              nextDueDate: "2026-12-31",
            };
    },
    workorders: async (path) => {
      calls.push(path);
      if (overrides.workorders) return overrides.workorders(path);
      return path.startsWith("/work-orders?")
        ? emptyPage
        : { workOrderNo: "WO-01" };
    },
  };
  const ui = { ...detailUI(tab, h), ServiceSections: ({items})=>h.jsx.jsx('sections',{children:items.map(item=>item.content)}) };
  const mod = tab.load("routes/M2Pages.tsx", {
    react: h.react,
    "react/jsx-runtime": h.jsx,
    "react-router-dom": {
      Link: "a",
      useParams: () => ({ id: "record" }),
      useLocation: () => ({
        pathname: "/app/maintenance/record",
        search: `?kind=${kind}`,
      }),
    },
    "../api/client": { ...tab.client, api },
    "../components/Badges": {
      StatusBadge: ({ status, label }) => h.jsx.jsx('span', { children: label ?? status }),
      PriorityBadge: ({ priority }) => h.jsx.jsx('span', { children: priority }),
    },
    "../auth/session": session,
    "../display-names": tab.load("display-names.ts"),
    "./DossierQr": { default: "dossier-qr" },
    "../features/attachments/AttachmentsPanel": {
      AttachmentsPanel: "attachments",
    },
    "./ModelPolicyPanels": {
      MaintenancePolicyDetails: "policy",
      WorkOrderChecklist: "checklist",
      AppliedPolicyPanel: "applied-policy",
    },
    "../features/workspace/ServiceDetailUI": ui,
    "../features/workspace/EquipmentPartsHistory": { default: "parts-history" },
    "../features/workspace/WorkOrderReadiness": { WorkOrderLocation: "work-location" },
    "../features/workspace/TechnicianOrderContext": { default: "technician-context" },
    "../features/workspace/use-form-draft": draftHook(tab,h,session),
    "../features/workspace/ui-values":tab.load('features/workspace/ui-values.ts'),
    "../features/workspace/service-detail-data": tab.load(
      "features/workspace/service-detail-data.ts",
    ),
    "../features/workspace/WorkspaceUI": {
      EmptyState: ({ title, description }) => h.jsx.jsx('div', { children: [title, description] }),
      EntityPicker: "picker",
      RelatedName: "related-name",
      Pagination: "pagination",
    },
  });
  return { calls, render: () => expand(h.render(mod[name])) };
}
function text(tree) {
  if (typeof tree === "string" || typeof tree === "number") return String(tree);
  if (Array.isArray(tree)) return tree.map(text).join(" ");
  return tree?.props ? text(tree.props.children) : "";
}

test('technician dossier retains scoped, paginated schedules with inclusive Vietnam dates and rejects invalid ranges', async () => {
  const s = setup('TechnicianPage', dossier, 'plan', { workorders: path => path.startsWith('/technicians/')
    ? { id: 'record', employeeCode: 'KT-01', fullName: 'Nguyễn Văn A', status: 'AVAILABLE', branchName: 'Chi nhánh HCM', branchCode: 'HCM', userId: 'PRIVATE_USER', branchId: 'PRIVATE_BRANCH', skills: [{ skillId: 'skill', name: 'Sửa bơm', level: 4 }] }
    : { items: [{ id: 'order', workOrderNo: 'WO-01', title: 'Kiểm tra bơm', type: 'INSPECTION', status: 'ASSIGNED' }], total: 41 } });
  s.render(); await settle(); s.render(); await settle();
  let tree = s.render();
  assert.match(text(tree), /Nguyễn Văn A/);
  assert.match(text(tree), /Chi nhánh HCM/);
  assert.match(text(tree), /Mức\s+4/);
  assert.doesNotMatch(text(tree), /PRIVATE_USER|PRIVATE_BRANCH/);
  assert.match(text(tree), /Chưa có lịch dự kiến/);
  nodes(tree, node => node.type === 'pagination')[0].props.onChange(2);
  s.render(); await settle(); tree = s.render();
  assert.equal(new URL(s.calls.filter(path => path.startsWith('/work-orders?')).at(-1), 'http://local').searchParams.get('page'), '2');
  nodes(tree, node => node.props['aria-label'] === 'Trạng thái công việc')[0].props.onChange({ target: { value: 'ASSIGNED,ACCEPTED,TRAVELLING,IN_PROGRESS,ON_HOLD' } });
  tree = s.render();
  nodes(tree, node => node.props['aria-label'] === 'Từ ngày dự kiến')[0].props.onChange({ target: { value: '2026-11-23' } });
  tree = s.render();
  nodes(tree, node => node.props['aria-label'] === 'Đến ngày dự kiến')[0].props.onChange({ target: { value: '2026-11-24' } });
  s.render(); await settle(); tree = s.render();
  const url = new URL(s.calls.filter(path => path.startsWith('/work-orders?')).at(-1), 'http://local');
  assert.equal(url.searchParams.get('technicianId'), 'record');
  assert.equal(url.searchParams.get('page'), '1');
  assert.equal(url.searchParams.get('sort'), 'scheduledStart');
  assert.equal(url.searchParams.get('scheduledFrom'), '2026-11-22T17:00:00.000Z');
  assert.equal(url.searchParams.get('scheduledTo'), '2026-11-24T16:59:59.999Z');
  assert.equal(url.searchParams.get('status'), 'ASSIGNED,ACCEPTED,TRAVELLING,IN_PROGRESS,ON_HOLD');
  const calls = s.calls.length;
  nodes(tree, node => node.props['aria-label'] === 'Đến ngày dự kiến')[0].props.onChange({ target: { value: '2026-11-22' } });
  tree = s.render(); await settle();
  assert.equal(s.calls.length, calls);
  assert.match(text(tree), /ngày kết thúc phải sau hoặc bằng ngày bắt đầu/);
  assert.equal(nodes(tree, node => node.type === 'table').length, 0);
  nodes(tree, node => node.type === 'button' && node.props.children === 'Xóa bộ lọc')[0].props.onClick();
  s.render(); await settle(); tree = s.render();
  assert.equal(nodes(tree, node => node.props['aria-label'] === 'Từ ngày dự kiến')[0].props.value, '');
  assert.ok(nodes(tree, node => node.type === 'a' && node.props.to === '/app/work-orders/order').length);
  assert.equal(new URL(s.calls.filter(path => path.startsWith('/work-orders?')).at(-1), 'http://local').searchParams.has('scheduledFrom'), false);
});

test('a denied technician profile never reads assignments or renders a false empty schedule', async () => {
  const s = setup('TechnicianPage', dossier, 'plan', { workorders: () => { throw new Error('Không có quyền xem hồ sơ'); } });
  s.render(); await settle(); const tree = s.render();
  assert.match(text(tree), /Không có quyền xem hồ sơ/);
  assert.equal(s.calls.filter(path => path.startsWith('/work-orders?')).length, 0);
  assert.doesNotMatch(text(tree), /Chưa có công việc phù hợp|0 lệnh/);
});
test("equipment dossier keeps partial failures visible, translates missing fields, and never uses equipment ID as a Work Order attachment ID", async () => {
  const s = setup("DossierPage");
  s.render();
  await settle();
  const tree = s.render(),
    visible = text(tree);
  assert.ok(visible.includes("Nhà máy A"));
  assert.ok(visible.includes("Nguồn dữ liệu tạm thời không phản hồi"));
  assert.ok(visible.includes("Ngày vận hành"));
  assert.equal(visible.includes("commissionedDate"), false);
  assert.equal(
    nodes(
      tree,
      (n) => n.type === "attachments" && n.props.kind === "WORK_ORDER",
    ).length,
    0,
  );
  assert.equal(visible.includes("(JSON)"), false);
});
test("maintenance replacement remains pending, links recorded orders and never presents provisional ID as a created order", async () => {
  const s = setup("MaintenanceRecordPage", dossier, "task");
  s.render();
  await settle();
  s.render();
  await settle();
  const tree = s.render(),
    visible = text(tree);
  assert.ok(visible.includes("Đang chờ xác nhận tạo lệnh thay thế"));
  assert.equal(visible.includes("replacement-uuid"), false);
  assert.equal(visible.includes("old-order-uuid"), false);
  assert.equal(
    nodes(
      tree,
      (n) =>
        n.type === "a" && n.props.to === "/app/work-orders/replacement-uuid",
    ).length,
    0,
  );
  assert.ok(
    nodes(
      tree,
      (n) => n.type === "a" && n.props.to === "/app/work-orders/old-order-uuid",
    ).length,
  );
});
