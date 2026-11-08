import type { Area, Row } from "./workspace-data";
export type QueueKind = "request" | "order" | "handover" | "task";
export type DecisionQueue = {
  key: string;
  group: string;
  name: string;
  area: Area;
  resource: string;
  status: string;
  kind: QueueKind;
  list: string;
  guidance: string;
};
export const decisionGroups = [
  {
    key: "mine",
    name: "Cần tôi xử lý",
    hint: "Đánh giá, phương án và lệnh liên quan",
  },
  {
    key: "customer",
    name: "Chờ khách hàng",
    hint: "Thông tin, chi phí và bàn giao",
  },
  {
    key: "team",
    name: "Chờ đội thực hiện",
    hint: "Điều phối, tiến độ và trở ngại",
  },
  {
    key: "results",
    name: "Cần xem lại kết quả",
    hint: "Kết quả kỹ thuật và xác nhận",
  },
];
export const decisionQueues: DecisionQueue[] = [
  {
    key: "review",
    group: "mine",
    name: "Yêu cầu cần xem xét / phương án mới",
    area: "requestsLive",
    resource: "/service-requests",
    status: "NEW,REVIEWING,COST_REJECTED",
    kind: "request",
    list: "/app/service-requests",
    guidance:
      "Đọc sự cố, đánh giá bảo hành và phản hồi chi phí trước khi quyết định.",
  },
  {
    key: "accepted",
    group: "mine",
    name: "Đã tiếp nhận — kiểm tra lệnh xử lý",
    area: "requestsLive",
    resource: "/service-requests",
    status: "ACCEPTED",
    kind: "request",
    list: "/app/service-requests",
    guidance:
      "Kiểm tra lệnh đang mở và lịch sử trước khi tạo lệnh mới; trạng thái yêu cầu có thể chờ đồng bộ sự kiện.",
  },
  {
    key: "failed-task",
    group: "mine",
    name: "Bảo trì cần xem xét lại",
    area: "maintenance",
    resource: "/maintenance-tasks",
    status: "FAILED",
    kind: "task",
    list: "/app/maintenance?tab=tasks",
    guidance:
      "Đọc hành trình bảo trì, nguyên nhân và các lệnh đã thực hiện để quyết định bước tiếp theo.",
  },
  {
    key: "info",
    group: "customer",
    name: "Chờ bổ sung thông tin",
    area: "requestsLive",
    resource: "/service-requests",
    status: "AWAITING_INFO",
    kind: "request",
    list: "/app/service-requests",
    guidance:
      "Kiểm tra yêu cầu bổ sung đã được gửi rõ cho khách và phản hồi gần nhất.",
  },
  {
    key: "estimate",
    group: "customer",
    name: "Chờ chấp thuận chi phí",
    area: "requestsLive",
    resource: "/service-requests",
    status: "AWAITING_CUSTOMER_APPROVAL",
    kind: "request",
    list: "/app/service-requests",
    guidance:
      "Theo dõi đúng phiên bản dự toán và thời hạn hiệu lực; Customer Admin là người phản hồi theo quyền.",
  },
  {
    key: "handover",
    group: "customer",
    name: "Bàn giao chờ khách xác nhận",
    area: "assetM2",
    resource: "/equipment-handovers",
    status: "PENDING_CUSTOMER_CONFIRMATION",
    kind: "handover",
    list: "/app/equipment-handovers",
    guidance:
      "Đối chiếu nội dung đã gửi, hạn xác nhận và các phản hồi của khách.",
  },
  {
    key: "dispatch",
    group: "team",
    name: "Chờ phân công / nhận việc",
    area: "workorders",
    resource: "/work-orders",
    status: "CREATED,ASSIGNED",
    kind: "order",
    list: "/app/work-orders?view=list",
    guidance:
      "Phối hợp Dispatcher và kỹ thuật viên; kiểm tra địa điểm công việc và lịch dự kiến.",
  },
  {
    key: "progress",
    group: "team",
    name: "Công việc đang thực hiện",
    area: "workorders",
    resource: "/work-orders",
    status: "ACCEPTED,TRAVELLING,IN_PROGRESS",
    kind: "order",
    list: "/app/work-orders?view=list",
    guidance:
      "Theo dõi tiến độ, thông tin hiện trường và khả năng cần phối hợp vật tư.",
  },
  {
    key: "hold",
    group: "team",
    name: "Công việc đang tạm dừng",
    area: "workorders",
    resource: "/work-orders",
    status: "ON_HOLD",
    kind: "order",
    list: "/app/work-orders?view=list",
    guidance: "Đọc lý do tạm dừng trong nhật ký và xác định ai cần tháo gỡ.",
  },
  {
    key: "resolved",
    group: "results",
    name: "Kết quả chờ xác nhận",
    area: "requestsLive",
    resource: "/service-requests",
    status: "RESOLVED",
    kind: "request",
    list: "/app/service-requests",
    guidance:
      "Đối chiếu kết quả hoàn toàn / một phần, phạm vi đã duyệt và nội dung còn cần làm rõ trước khi xác nhận.",
  },
  {
    key: "completed",
    group: "results",
    name: "Công việc kỹ thuật đã kết thúc",
    area: "workorders",
    resource: "/work-orders",
    status: "COMPLETED",
    kind: "order",
    list: "/app/work-orders?view=list",
    guidance:
      "Hoàn tất lệnh chưa chứng minh máy đã vận hành tốt hoặc khách đã xác nhận. Đọc báo cáo và đối soát phụ tùng.",
  },
];
export function queuePath(queue: DecisionQueue, sort: string) {
  const params = new URLSearchParams({
    page: "1",
    pageSize: "6",
    status: queue.status,
  });
  if (["request", "order"].includes(queue.kind)) params.set("sort", sort);
  return `${queue.resource}?${params}`;
}
export function queueListPath(queue: DecisionQueue, sort: string) {
  const [path, search] = queue.list.split("?");
  const params = new URLSearchParams(search);
  params.set("status", queue.status);
  if (["request", "order"].includes(queue.kind)) params.set("sort", sort);
  return `${path}?${params}`;
}
export function queueRecordPath(queue: DecisionQueue, row: Row) {
  return queue.kind === "request"
    ? `/app/service-requests/${row.id}`
    : queue.kind === "order"
      ? `/app/work-orders/${row.id}`
      : queue.kind === "handover"
        ? `/app/equipment-handovers/${row.id}`
        : `/app/maintenance/${row.id}?kind=task`;
}
