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
  assert.ok(text.includes("Trước thay đổi"));
  assert.ok(text.includes("Ngừng hoạt động"));
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
