import test from "node:test";
import assert from "node:assert/strict";
import { hooks, nodes, webTab } from "./helpers/web-tab.mjs";
import { detailUI, expand } from "./helpers/service-detail.mjs";

function setup(order, mutation = async () => ({})) {
  const calls = [],
    h = hooks(),
    tab = webTab(async () => {
      throw new Error("Unexpected fetch");
    });
  const data = tab.load("features/workspace/service-detail-data.ts");
  const module = tab.load("features/workspace/ServiceManagerWorkOrder.tsx", {
    react: h.react,
    "react/jsx-runtime": h.jsx,
    "react-router-dom": { Link: "a", useParams: () => ({ id: "order" }) },
    "lucide-react": {
      CalendarDays: "icon",
      CircleAlert: "icon",
      UserRound: "icon",
      Wrench: "icon",
    },
    "../../api/client": {
      ...tab.client,
      api: {
        workorders: async (path, options) => {
          calls.push({ path, options });
          return mutation(path, options);
        },
      },
    },
    "../../auth/session": tab.session,
    "../../display-names": tab.load("display-names.ts"),
    "../../routes/ModelPolicyPanels": { WorkOrderChecklist: "checklist" },
    "../attachments/AttachmentsPanel": { AttachmentsPanel: "attachments" },
    "../inventory/PartRequests": { WorkOrderPartRequests: "part-requests" },
    "./WorkspaceUI": {
      Badge: "badge",
      DataState: "data-state",
      EmptyState: "empty-state",
      RelatedName: "related-name",
    },
    "./workspace-data": {
      ...tab.load("features/workspace/workspace-data.ts", {
        react: h.react,
        "../../api/client": tab.client,
        "../../auth/session": tab.session,
      }),
      useWorkspaceData: () => ({
        data: {
          items: [
            {
              id: "technician",
              fullName: "Nguyễn A",
              employeeCode: "T01",
              status: "AVAILABLE",
            },
          ],
          total: 1,
        },
        loading: false,
      }),
    },
    "./ServiceDetailUI": detailUI(tab, h),
    "./WorkOrderReadiness": { default: "readiness", WorkOrderLocation: "work-location" },
    "./TechnicianSchedule": { default: "technician-schedule" },
    "./service-detail-data": data,
  });
  let refreshes = 0;
  return {
    calls,
    tab,
    data,
    h,
    refreshes: () => refreshes,
    render: () =>
      h.render(module.ManagerOrderActions, {
        order,
        id: "order",
        refresh: () => refreshes++,
      }),
  };
}
const prevent = { preventDefault() {} };
const editable = {
  status: "CREATED",
  allowedActions: ["assign", "update", "cancel"],
  serviceRequestId: "request",
};
test("Service Manager actions submit one intent on a double click and retain server action authority", async () => {
  let release;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  const s = setup(editable, () => pending);
  let tree = s.render();
  nodes(tree, (n) => n.type === "select")[0].props.onChange({
    target: { value: "technician" },
  });
  tree = s.render();
  const form = nodes(tree, (n) => n.type === "form")[0];
  const first = form.props.onSubmit(prevent);
  const second = form.props.onSubmit(prevent);
  assert.equal(s.calls.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(s.calls[0])), {
    path: "/work-orders/order/assign",
    options: { method: "POST", body: { technicianId: "technician" } },
  });
  release({});
  await Promise.all([first, second]);
  assert.equal(s.refreshes(), 1);
  const readonly = setup({ status: "COMPLETED", allowedActions: [] });
  assert.equal(nodes(readonly.render(), (n) => n.type === "form").length, 0);
});
test("unknown write result blocks replay and never reports saved", async () => {
  const s = setup(editable, async () => {
    throw new TypeError("Connection lost");
  });
  let tree = s.render();
  nodes(tree, (n) => n.type === "select")[0].props.onChange({
    target: { value: "technician" },
  });
  tree = s.render();
  await nodes(tree, (n) => n.type === "form")[0].props.onSubmit(prevent);
  tree = s.render();
  await nodes(tree, (n) => n.type === "form")[0].props.onSubmit(prevent);
  assert.equal(s.calls.length, 1);
  assert.ok(JSON.stringify(tree).includes("Chưa xác định thao tác"));
  assert.equal(JSON.stringify(tree).includes("Đã lưu thay đổi."), false);
});
test("Vietnam schedule input is converted to UTC with a complete valid interval", async () => {
  const s = setup(editable);
  let tree = s.render();
  nodes(
    tree,
    (n) => n.type === "button" && n.props.children === "Điều chỉnh lịch",
  )[0].props.onClick();
  tree = s.render();
  const inputs = nodes(
    tree,
    (n) => n.type === "input" && n.props.type === "datetime-local",
  );
  inputs[0].props.onChange({ target: { value: "2026-11-07T09:00" } });
  inputs[1].props.onChange({ target: { value: "2026-11-07T10:30" } });
  tree = s.render();
  await nodes(tree, (n) => n.type === "form")[0].props.onSubmit(prevent);
  assert.equal(s.calls[0].options.method, "PATCH");
  assert.equal(
    s.calls[0].options.body.scheduledStart,
    "2026-11-07T02:00:00.000Z",
  );
  assert.equal(
    s.calls[0].options.body.scheduledEnd,
    "2026-11-07T03:30:00.000Z",
  );
});
test("cancellation requires a reason and preserves the Service Request by default", async () => {
  const s = setup(editable);
  let tree = s.render();
  nodes(
    tree,
    (n) => n.type === "button" && n.props.children === "Hủy công việc",
  )[0].props.onClick();
  tree = s.render();
  await nodes(tree, (n) => n.type === "form")[0].props.onSubmit(prevent);
  assert.equal(s.calls.length, 0);
  nodes(tree, (n) => n.type === "textarea")[0].props.onChange({
    target: { value: "  Khách đổi lịch, cần tạo lại lệnh  " },
  });
  tree = s.render();
  await nodes(tree, (n) => n.type === "form")[0].props.onSubmit(prevent);
  assert.deepEqual(JSON.parse(JSON.stringify(s.calls[0].options.body)), {
    reason: "Khách đổi lịch, cần tạo lại lệnh",
    cancelServiceRequest: false,
  });
});
test("old session cannot submit actions or refresh a new session after a late success", async () => {
  let release;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  const s = setup(editable, () => pending);
  let tree = s.render();
  nodes(tree, (n) => n.type === "select")[0].props.onChange({
    target: { value: "technician" },
  });
  tree = s.render();
  const action = nodes(tree, (n) => n.type === "form")[0].props.onSubmit(
    prevent,
  );
  s.tab.changeSession();
  release({});
  await action;
  assert.equal(s.refreshes(), 0);
  await nodes(tree, (n) => n.type === "form")[0].props.onSubmit(prevent);
  assert.equal(s.calls.length, 1);
});
test("business metadata hides internal UUID references and preserves readable before/after values", () => {
  const tab = webTab(async () => {}),
    h = hooks(),
    ui = detailUI(tab, h);
  const tree = expand(
    h.render(ui.BusinessValues, {
      data: {
        equipmentId: "c9d5b4a3-1840-49ef-9dc8-536b68fab8a8",
        before: { status: "ACTIVE" },
        after: { status: "INACTIVE" },
      },
    }),
  );
  const text = JSON.stringify(tree);
  assert.equal(text.includes("c9d5b4a3"), false);
  assert.ok(text.includes("Giá trị trước sự kiện"));
  assert.ok(text.includes("Ngừng hoạt động"));
});
test("maintenance history translates context and does not imply a missing fixed end date for an unlimited plan", () => {
  const tab = webTab(async () => {}), h = hooks(), ui = detailUI(tab, h);
  const tree = expand(h.render(ui.BusinessValues, {
    data: {
      planName: "Bảo trì máy bơm MB-001",
      anchorDate: "2026-11-12",
      termMode: "UNLIMITED",
      termYears: null,
      endDate: null,
      frequencyUnit: "MONTH",
      frequencyValue: 3,
      status: "WORK_ORDER_CREATED",
    },
  }));
  const text = JSON.stringify(tree);
  for (const label of ["Tên kế hoạch bảo trì", "Ngày làm mốc tính chu kỳ", "12/11/2026",
    "Không giới hạn thời gian (đến khi ngừng kế hoạch)", "tháng", "Đã tạo lệnh công việc"]) {
    assert.ok(text.includes(label), label);
  }
  for (const raw of ["anchor Date", "term Mode", "UNLIMITED", "WORK_ORDER_CREATED", "Số năm áp dụng", "Ngày kết thúc kế hoạch"]) {
    assert.equal(text.includes(raw), false, raw);
  }
});
test("maintenance changes show the earlier value first even when JSON returns after before before", () => {
  const tab = webTab(async () => {}), h = hooks(), ui = detailUI(tab, h);
  const tree = expand(h.render(ui.BusinessValues, {
    data: { nextDueDate: { after: "2027-02-12", before: "2026-11-12" } },
  }));
  const text = JSON.stringify(tree);
  assert.ok(text.indexOf("Giá trị trước sự kiện") < text.indexOf("Giá trị sau sự kiện"));
  assert.ok(text.indexOf("12/11/2026") < text.indexOf("12/02/2027"));
  assert.ok(text.includes("Kỳ đến hạn kế tiếp"));
});
test("metadata preserves notes, invalid dates, zero and explicit fixed-year and warranty-end terms", () => {
  const tab = webTab(async () => {}), h = hooks(), ui = detailUI(tab, h);
  const text = JSON.stringify(expand(h.render(ui.BusinessValues, {
    data: { note: "UNLIMITED", anchorDate: "2026-02-30", termMode: "YEARS", termYears: 3, frequencyValue: 0 },
  })));
  assert.ok(text.includes("UNLIMITED"));
  assert.ok(text.includes("2026-02-30"));
  assert.ok(text.includes("Theo số năm quy định"));
  assert.ok(text.includes("Số năm áp dụng"));
  assert.ok(text.includes('"0"'));
  const warranty = JSON.stringify(expand(h.render(ui.BusinessValues, {
    data: { termMode: "WARRANTY_END", endDate: "2027-11-12", termYears: null },
  })));
  assert.ok(warranty.includes("Đến khi hết bảo hành"));
  assert.ok(warranty.includes("12/11/2027"));
  assert.equal(warranty.includes("Số năm áp dụng"), false);
});
test("history comparison uses one row per changed field and omits empty or unchanged values and internal references", () => {
  const tab = webTab(async () => {}), h = hooks(), ui = detailUI(tab, h);
  const tree = expand(h.render(ui.BusinessChanges, {
    data: {
      status: { after: "WORK_ORDER_CREATED", before: "PENDING" },
      nextDueDate: { after: "2027-02-12", before: "2026-11-12" },
      description: { before: null, after: null },
      frequencyValue: { before: 0, after: 3 },
      termMode: { before: "YEARS", after: "YEARS" },
      equipmentId: { before: null, after: "c9d5b4a3-1840-49ef-9dc8-536b68fab8a8" },
    },
  }));
  const rows = nodes(tree, n => n.type === "tr");
  assert.equal(rows.length, 4); // Heading plus three changed fields.
  assert.deepEqual(nodes(rows[0], n => n.type === "th").map(n => n.props.children), ["Thông tin", "Giá trị cũ", "Giá trị mới"]);
  const status = JSON.stringify(rows[1]);
  assert.ok(status.indexOf("Chờ thực hiện") < status.indexOf("Đã tạo lệnh công việc"));
  const date = JSON.stringify(rows[2]);
  assert.ok(date.indexOf("12/11/2026") < date.indexOf("12/02/2027"));
  const visible = JSON.stringify(tree);
  assert.equal(visible.includes("c9d5b4a3"), false);
  assert.equal(visible.includes("Mô tả"), false);
  assert.equal(visible.includes("Thời hạn áp dụng"), false);
  assert.ok(visible.includes('"0"'));
});
test("history comparison supports older snapshots and keeps unstructured legacy data readable", () => {
  const tab = webTab(async () => {}), h = hooks(), ui = detailUI(tab, h);
  const tree = expand(h.render(ui.BusinessChanges, {
    data: { after: { status: "INACTIVE", name: "Kế hoạch A" }, before: { status: "ACTIVE", name: "Kế hoạch A" } },
  }));
  assert.equal(nodes(tree, n => n.type === "tr").length, 2);
  const text = JSON.stringify(tree);
  assert.ok(text.indexOf("Đang hoạt động") < text.indexOf("Ngừng hoạt động"));
  const legacy = JSON.stringify(expand(h.render(ui.BusinessChanges, { data: { note: "Nội dung cũ" } })));
  assert.ok(legacy.includes("Nội dung cũ"));
  const oldFormat = expand(h.render(ui.BusinessChanges, {
    data: { frequencyValue: { old: 0, new: 3 } },
  }));
  assert.equal(nodes(oldFormat, n => n.type === "tr").length, 2);
  assert.ok(JSON.stringify(oldFormat).includes('"0"'));
});
test("money display keeps exact decimal strings; completed and cancelled guidance does not imply success or reopen", () => {
  const tab = webTab(async () => {}),
    data = tab.load("features/workspace/service-detail-data.ts");
  assert.equal(
    data.formatServiceMoney("123456789012345678.90"),
    "123.456.789.012.345.678,9 VND",
  );
  assert.equal(data.formatServiceMoney(null), "Chưa có số tiền");
  assert.ok(
    data.workOrderNextStep({ status: "COMPLETED" })[1].includes("Đọc báo cáo"),
  );
  assert.ok(
    data
      .workOrderNextStep({ status: "CANCELLED" })[1]
      .includes("Xem lý do hủy"),
  );
});
