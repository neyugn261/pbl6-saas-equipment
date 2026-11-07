import test from "node:test";
import assert from "node:assert/strict";
import { hooks, nodes, settle, webTab } from "./helpers/web-tab.mjs";
import { detailUI, expand } from "./helpers/service-detail.mjs";

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
function setup(name, asset = dossier, kind = "plan") {
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
      return path.startsWith("/work-orders?")
        ? emptyPage
        : { workOrderNo: "WO-01" };
    },
  };
  const ui = detailUI(tab, h);
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
    "../auth/session": session,
    "../display-names": tab.load("display-names.ts"),
    "../features/attachments/AttachmentsPanel": {
      AttachmentsPanel: "attachments",
    },
    "./ModelPolicyPanels": {
      MaintenancePolicyDetails: "policy",
      WorkOrderChecklist: "checklist",
      AppliedPolicyPanel: "applied-policy",
    },
    "../features/workspace/ServiceDetailUI": ui,
    "../features/workspace/service-detail-data": tab.load(
      "features/workspace/service-detail-data.ts",
    ),
    "../features/workspace/WorkspaceUI": {
      EntityPicker: "picker",
      RelatedName: "related-name",
    },
  });
  return { calls, render: () => expand(h.render(mod[name])) };
}
function text(tree) {
  if (typeof tree === "string" || typeof tree === "number") return String(tree);
  if (Array.isArray(tree)) return tree.map(text).join(" ");
  return tree?.props ? text(tree.props.children) : "";
}
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
