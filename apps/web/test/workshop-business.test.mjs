import assert from "node:assert/strict";
import test from "node:test";
import { hooks, nodes, webTab } from "./helpers/web-tab.mjs";

function fixture(
  file,
  responses,
  userType = "TENANT_STAFF",
  roles = ["SERVICE_MANAGER"],
) {
  const h = hooks(),
    calls = [],
    tab = webTab(async () => {
      throw new Error("Unexpected fetch");
    });
  const session = { useSession: () => ({ profile: { userType, roles } }) };
  const realData = tab.load("features/workspace/workspace-data.ts", {
    react: h.react,
    "../../api/client": tab.client,
    "../../auth/session": session,
  });
  const component = tab.load(`features/workspace/${file}.tsx`, {
    react: h.react,
    "react/jsx-runtime": h.jsx,
    "react-router-dom": { Link: "a" },
    "../../auth/session": session,
    "./WorkspaceUI": {
      DataState: "DataState",
      EmptyState: "EmptyState",
      Pagination: "Pagination",
      RelatedName: "RelatedName",
    },
    "./ServiceDetailUI": { ServiceCard: "ServiceCard" },
    "./WorkOrderReadiness": { default: "WorkOrderReadiness" },
    "./service-detail-data": tab.load(
      "features/workspace/service-detail-data.ts",
    ),
    "./workspace-data": {
      ...realData,
      useWorkspaceData: (area, path) => {
        calls.push({ area, path });
        return responses(path);
      },
    },
  });
  return {
    ...component,
    h,
    calls,
    tab,
    render: (props) => h.render(component.default, props),
  };
}
const ready = (data) => ({ loading: false, data });
const confirmed = {
  id: "confirmation",
  equipmentId: "machine",
  workOrderId: "order",
  workOrderNo: "WO-15",
  kind: "CONFIRM",
  quantity: "1.000",
  effectiveQuantity: "1.000",
  reason: "Ổ bi hỏng",
  removedPartDisposition: "RETURNED_TO_CUSTOMER",
  part: { sku: "P-01", name: "Ổ bi", unit: "cái" },
};

test("technician sees a moved-machine warning only when both site IDs are known; missing work location stays unknown", () => {
  for (const site of ["site-current", "site-original", undefined]) {
    const s = fixture("TechnicianOrderContext", (path) =>
      ready(
        path?.includes("/parts")
          ? []
          : {
              customerSiteId: "site-current",
              displayName: "Bơm tuần hoàn",
              serialNumber: "SER-42",
            },
      ),
    );
    const tree = s.render({
      order: { id: "order", equipmentId: "equipment", customerSiteId: site },
      revision: 0,
    });
    const text = JSON.stringify(nodes(tree, (n) => n.type === "p"));
    assert.equal(
      text.includes("Thiết bị hiện ở địa điểm khác với lệnh"),
      site === "site-original",
    );
    assert.equal(text.includes("Lệnh chưa ghi nhận địa điểm phục vụ"), !site);
    assert.ok(text.includes("SER-42"));
  }
});

test("equipment parts use the scoped asset source, retain correction meaning and never link customers to internal work orders", () => {
  for (const customer of [true, false]) {
    const s = fixture(
      "EquipmentPartsHistory",
      () =>
        ready({
          status: "AVAILABLE",
          data: {
            items: [
              { ...confirmed, isReversed: true },
              {
                ...confirmed,
                id: "correction",
                kind: "REVERSE",
                correctsConfirmationId: "confirmation",
                effectiveQuantity: "0.000",
              },
            ],
            total: 12,
            legacyHistoryMayBeIncomplete: true,
          },
        }),
      customer ? "CUSTOMER" : "TENANT_STAFF",
    );
    let tree = s.render({ equipmentId: "machine" });
    assert.equal(s.calls[0].area, "assetM2");
    assert.equal(
      s.calls[0].path,
      "/equipment/machine/service-parts?page=1&pageSize=10",
    );
    assert.equal(
      nodes(tree, (n) => n.props.to === "/app/work-orders/order").length > 0,
      !customer,
    );
    assert.match(JSON.stringify(tree), /Xác nhận đã được đảo/);
    assert.match(JSON.stringify(tree), /Điều chỉnh xác nhận trước/);
    assert.match(JSON.stringify(tree), /không tự gia hạn bảo hành/);
    nodes(tree, (n) => n.type === "Pagination")[0].props.onChange(2);
    tree = s.render({ equipmentId: "machine" });
    assert.ok(s.calls.at(-1).path.includes("page=2&"));
  }
});

test("restricted parts history is explicitly unavailable instead of proving the machine never needed a replacement", () => {
  const s = fixture(
    "EquipmentPartsHistory",
    () => ready({ status: "RESTRICTED", data: null }),
    "CUSTOMER",
  );
  const tree = s.render({ equipmentId: "machine" });
  const state = nodes(tree, (n) => n.type === "DataState")[0];
  assert.match(state.props.error, /chưa có quyền/);
  assert.equal(nodes(tree, (n) => n.type === "li").length, 0);
});

test("work order location uses its stored site and location even if equipment has since moved", () => {
  const s = fixture("WorkOrderReadiness", (path) =>
    ready(
      path?.endsWith("/locations")
        ? [{ id: "location-a", name: "Khu A" }]
        : { address: "Địa chỉ A" },
    ),
  );
  const tree = s.h.render(s.WorkOrderLocation, {
    order: {
      customerSiteId: "site-a",
      locationId: "location-a",
      equipment: { customerSiteId: "site-b" },
    },
  });
  assert.deepEqual(
    s.calls.map((call) => call.path),
    ["/sites/site-a", "/sites/site-a/locations"],
  );
  assert.match(JSON.stringify(tree), /Địa chỉ A/);
  assert.match(JSON.stringify(tree), /Khu A/);
  assert.match(
    JSON.stringify(tree),
    /không tự chứng minh địa chỉ tại thời điểm lịch sử/,
  );
});

test("completed work, partial repair, operational status and customer confirmation remain distinct", () => {
  const s = fixture("WorkOrderReadiness", (path) =>
    ready(
      path?.endsWith("/service-report")
        ? {
            result: "PARTIALLY_RESOLVED",
            customerSummary: "Còn chờ xử lý bộ điều khiển",
          }
        : { status: "RESOLVED" },
    ),
  );
  const tree = s.render({
    order: { id: "order", status: "COMPLETED", serviceRequestId: "request" },
    equipment: { status: "ACTIVE", operationalStatus: "UNKNOWN" },
    parts: [{ quantityUnreconciled: "0.000000000000000001" }],
  });
  const text = JSON.stringify(tree);
  for (const value of [
    "Đã kết thúc công việc",
    "Mới xử lý một phần",
    "Chưa xác nhận tình trạng",
    "Đang chờ xác nhận kết quả",
    "1 dòng phụ tùng còn lượng chưa đối soát",
  ])
    assert.ok(text.includes(value), value);
  assert.equal(
    nodes(tree, (n) => n.props.to?.startsWith("/app/inventory/transactions"))
      .length,
    0,
  );
});

test("reservation holds explain stock coordination; other conflicts retain stale-data handling", () => {
  const tab = webTab(async () => {}),
    data = tab.load("features/workspace/service-detail-data.ts");
  const message = data.workOrderActionError({
    status: 409,
    code: "INVENTORY_RESERVATION_HELD",
  });
  assert.match(message, /đối soát giao dịch kho/);
  assert.match(message, /làm mới trang không tự giải quyết/);
  assert.match(
    data.workOrderActionError({ status: 409, code: "STALE_VERSION" }),
    /Hồ sơ vừa thay đổi/,
  );
  assert.equal(data.isPositiveQuantity("0.000000000000000001"), true);
  assert.equal(data.isPositiveQuantity("0.000"), false);
});

test("schedule preserves technician/status filters and never presents an empty preview as guaranteed availability", () => {
  const s = fixture("TechnicianSchedule", () => ready({ items: [], total: 0 }));
  const tree = s.render({ technicianId: "tech-1" });
  const url = new URL(s.calls[0].path, "http://local");
  assert.equal(url.searchParams.get("technicianId"), "tech-1");
  assert.equal(url.searchParams.get("sort"), "scheduledStart");
  assert.ok(url.searchParams.get("status").includes("ON_HOLD"));
  assert.match(
    nodes(tree, (n) => n.type === "EmptyState")[0].props.description,
    /Chưa đủ để khẳng định/,
  );
  assert.match(JSON.stringify(tree), /chưa tự chặn lịch trùng/);
});

test("closeout uses approved server totals exactly and retains a partial-result warning for customers", () => {
  const s = fixture(
    "RequestCloseoutSummary",
    () =>
      ready([
        {
          id: "approved",
          revisionNo: 2,
          status: "APPROVED",
          totalAmount: "123456789012345678.90",
          currency: "VND",
          items: [{ description: "Thay ổ bi", quantity: "1" }],
        },
        {
          id: "draft",
          revisionNo: 3,
          status: "DRAFT",
          totalAmount: "100",
          items: [{ description: "UNAPPROVED_ITEM" }],
        },
      ]),
    "CUSTOMER",
    ["CUSTOMER_ADMIN"],
  );
  const tree = s.render({
    request: {
      id: "request",
      equipmentId: "machine",
      resolutionResult: "PARTIALLY_RESOLVED",
      resolutionSummary: "Còn phần việc cần thực hiện",
    },
  });
  const text = JSON.stringify(
    nodes(tree, (n) => ["li", "strong", "p"].includes(n.type)),
  );
  assert.ok(text.includes("123.456.789.012.345.678,9 VND"));
  assert.equal(text.includes("UNAPPROVED_ITEM"), false);
  assert.match(text, /Mới xử lý một phần/);
  assert.ok(
    nodes(tree, (n) => n.props.to === "/portal/equipment/machine").length,
  );
});

test("handover warranty information is current reference, separate from the sent acceptance snapshot", () => {
  const s = fixture("HandoverServiceContext", () =>
    ready({
      warranties: [
        {
          id: "w",
          startDate: "2026-01-01",
          endDate: "2027-01-01",
          terms: "Điều khoản thực tế",
        },
      ],
      maintenance: { status: "RESTRICTED", data: null },
    }),
  );
  const tree = s.render({ equipmentId: "machine", customer: true });
  assert.match(JSON.stringify(tree), /Điều khoản thực tế/);
  assert.match(JSON.stringify(tree), /không tự thay đổi ngày hiệu lực/);
  assert.match(
    nodes(tree, (n) => n.type === "ServiceCard")[0].props.description,
    /phân biệt với nội dung biên bản/,
  );
  assert.ok(
    nodes(tree, (n) => n.props.to === "/portal/equipment/machine").length,
  );
});

test("customer dashboard switches focus to named equipment records and uses the equipment route instead of handover", () => {
  const h = hooks(),
    tab = webTab(async () => {}),
    calls = [];
  const session = {
    useSession: () => ({
      profile: {
        roles: ["CUSTOMER_USER"],
        userType: "CUSTOMER",
        fullName: "Khách hàng",
      },
    }),
  };
  const data = tab.load("features/workspace/workspace-data.ts", {
    react: h.react,
    "../../api/client": tab.client,
    "../../auth/session": session,
  });
  const { default: Dashboard } = tab.load(
    "features/workspace/RoleDashboard.tsx",
    {
      react: h.react,
      "react/jsx-runtime": h.jsx,
      "react-router-dom": { Link: "a" },
      "lucide-react": Object.fromEntries(
        [
          "ArrowRight",
          "Bell",
          "Boxes",
          "CheckCircle2",
          "ClipboardList",
          "Clock3",
          "Info",
          "Plus",
          "RefreshCw",
          "ShieldCheck",
          "Wrench",
        ].map((name) => [name, name]),
      ),
      "../../auth/session": session,
      "./ServiceManagerDashboard": { default: "ServiceManagerDashboard" },
      "./role-workspace": tab.load("features/workspace/role-workspace.ts"),
      "./service-detail-data": tab.load(
        "features/workspace/service-detail-data.ts",
      ),
      "./WorkspaceUI": {
        Badge: "Badge",
        DataState: "DataState",
        EmptyState: "EmptyState",
        PageHeading: "PageHeading",
      },
      "./workspace-data": {
        ...data,
        useWorkspaceData: (area, path) => {
          calls.push({ area, path });
          return ready({
            items: path.startsWith("/equipment?")
              ? [
                  {
                    id: "eq",
                    assetCode: "TB-042",
                    displayName: "Bơm tuần hoàn",
                    status: "ACTIVE",
                  },
                ]
              : [],
            total: 1,
          });
        },
      },
    },
  );
  const root = Dashboard(),
    render = () => h.render(root.type, root.props);
  let tree = render();
  const metric = nodes(
    tree,
    (n) =>
      typeof n.type === "function" &&
      n.props.metric?.path.startsWith("/equipment?"),
  )[0];
  metric.props.onSelect();
  tree = render();
  assert.equal(calls.at(-1).area, "assetM2");
  assert.ok(calls.at(-1).path.startsWith("/equipment?"));
  assert.ok(
    nodes(
      tree,
      (n) =>
        n.type === "a" &&
        n.props.to === "/portal/equipment/eq" &&
        n.props.children === "TB-042",
    ).length,
  );
  assert.ok(
    nodes(
      tree,
      (n) => n.type === "small" && n.props.children === "Bơm tuần hoàn",
    ).length,
  );
  assert.equal(
    nodes(tree, (n) => n.props.to === "/portal/equipment-handovers/eq").length,
    0,
  );
  assert.equal(
    nodes(tree, (n) => n.type === "Badge")[0].props.label,
    "Đã đưa vào dịch vụ",
  );
});
