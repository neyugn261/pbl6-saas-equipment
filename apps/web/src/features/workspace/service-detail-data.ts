import type { Row } from "./workspace-data";
export const serviceLabels: Record<string, string> = {
  LABOR: "Nhân công",
  PART: "Phụ tùng",
  TRAVEL: "Di chuyển",
  OTHER: "Khác",
  DRAFT: "Bản nháp",
  SENT: "Đã gửi khách hàng",
  APPROVED: "Đã chấp thuận",
  REJECTED: "Đã từ chối",
  EXPIRED: "Hết hiệu lực",
  SUPERSEDED: "Đã có phiên bản mới",
  PUBLISHED: "Đã công bố",
  ARCHIVED: "Đã lưu trữ",
  INSPECT: "Kiểm tra",
  CLEAN: "Vệ sinh",
  LUBRICATE: "Bôi trơn",
  ADJUST: "Hiệu chỉnh",
  REPLACE: "Thay thế",
  TEST: "Chạy thử",
  CALIBRATE: "Hiệu chuẩn",
  MANUFACTURING_DEFECT: "Lỗi sản xuất",
  ACCIDENTAL_DAMAGE: "Va đập / rơi vỡ",
  LIQUID_INGRESS: "Vào nước",
  MISUSE: "Sử dụng sai hướng dẫn",
  WEAR_AND_TEAR: "Hao mòn",
  NOT_DONE: "Chưa thực hiện",
  DONE: "Đã thực hiện",
  NOT_APPLICABLE: "Không áp dụng",
  STANDARD: "Bảo hành tiêu chuẩn",
  EXTENDED: "Bảo hành mở rộng",
  NO_WARRANTY: "Không có bảo hành",
  installationDate: "Ngày lắp đặt",
  WORK_ORDER_SERVICE: "Hệ thống tạo lệnh",
  WORK_ORDER_TEAM: "Đội ngũ thực hiện",
  LINKED: "Đã liên kết",
  NONE: "Không có bước chờ",
  CUSTOMER: "Khách hàng",
  INTERNAL: "Nội bộ",
  CREATED: "Mới tạo",
  ASSIGNED: "Đã phân công",
  ACCEPTED: "Đã nhận",
  TRAVELLING: "Đang di chuyển",
  IN_PROGRESS: "Đang thực hiện",
  ON_HOLD: "Tạm dừng",
  COMPLETED: "Hoàn tất",
  CANCELLED: "Đã hủy",
  ACTIVE: "Đang hoạt động",
  INACTIVE: "Ngừng hoạt động",
  QR_CREATED: "Tạo mã QR",
  QR_REPRINTED: "Cấp lại mã QR",
  QR_REVOKED: "Thu hồi mã QR",
  LOW: "Thấp",
  NORMAL: "Bình thường",
  MEDIUM: "Trung bình",
  HIGH: "Cao",
  URGENT: "Khẩn cấp",
  WARRANTY: "Bảo hành",
  REPAIR: "Sửa chữa",
  MAINTENANCE: "Bảo trì",
  INSPECTION: "Kiểm tra",
  RESOLVED: "Đã xử lý",
  PARTIALLY_RESOLVED: "Xử lý một phần",
  UNRESOLVED: "Chưa xử lý được",
  MONTH: "tháng",
  YEAR: "năm",
  DAY: "ngày",
  WEEK: "tuần",
  IN_WARRANTY: "Trong hạn bảo hành",
  OUT_OF_WARRANTY: "Ngoài hạn bảo hành",
  COVERED: "Thuộc phạm vi bảo hành",
  NOT_COVERED: "Không thuộc phạm vi bảo hành",
  UNKNOWN: "Chưa xác nhận",
  NOT_ASSESSED: "Chưa đánh giá",
  RETIRED: "Ngừng sử dụng",
  OUT_OF_SERVICE: "Chưa đưa vào dịch vụ",
  UNASSIGNED: "Đã gỡ phân công",
  PASS: "Đạt",
  FAIL: "Không đạt",
  SKIPPED: "Bỏ qua",
  PENDING: "Chờ thực hiện",
  CREATE: "Tạo công việc",
  ASSIGN: "Phân công kỹ thuật viên",
  REASSIGN: "Phân công lại",
  UPDATE: "Cập nhật thông tin",
  SUBMIT: "Gửi xác nhận",
  ACCEPT: "Chấp thuận",
  REJECT: "Từ chối",
  CANCEL: "Hủy",
  ACTIVATE: "Kích hoạt thiết bị",
  EXPIRE: "Hết hạn xác nhận",
  equipmentId: "Thiết bị",
  customerId: "Khách hàng",
  customerSiteId: "Địa điểm",
  serialNumber: "Số serial",
  commissionedDate: "Ngày vận hành",
  handoverDate: "Ngày bàn giao",
  displayName: "Tên thiết bị",
  technicalSpecifications: "Thông số kỹ thuật",
  status: "Trạng thái",
  name: "Tên",
  description: "Mô tả",
  nextDueDate: "Kỳ kế tiếp",
  frequencyUnit: "Đơn vị chu kỳ",
  frequencyValue: "Chu kỳ",
  scheduledStart: "Bắt đầu dự kiến",
  scheduledEnd: "Kết thúc dự kiến",
  oldValue: "Trước thay đổi",
  newValue: "Sau thay đổi",
  before: "Trước thay đổi",
  after: "Sau thay đổi",
  reason: "Lý do",
  note: "Ghi chú",
  SERVICE_MANAGER: "Quản lý dịch vụ",
  DISPATCHER: "Điều phối viên",
  TECHNICIAN: "Kỹ thuật viên",
  TENANT_ADMIN: "Quản trị doanh nghiệp",
  CUSTOMER_ADMIN: "Quản trị khách hàng",
  CUSTOMER_USER: "Khách hàng",
};

/** Equipment lifecycle is not a technical assertion about the machine. */
export function equipmentLifecycleLabel(status: unknown) {
  return (
    (
      {
        ACTIVE: "Đã đưa vào dịch vụ",
        IN_SERVICE: "Đang có hoạt động dịch vụ",
        OUT_OF_SERVICE: "Chưa đưa vào dịch vụ",
        RETIRED: "Đã ngừng sử dụng",
      } as Record<string, string>
    )[String(status)] ?? "Chưa xác nhận vòng đời"
  );
}
export function requestResponsibility(status: unknown) {
  switch (status) {
    case "NEW":
    case "REVIEWING":
      return ["Bộ phận dịch vụ", "Đánh giá sự cố và phạm vi bảo hành"];
    case "ACCEPTED":
      return [
        "Bộ phận dịch vụ",
        "Kiểm tra lệnh liên quan trước khi tạo hoặc tiếp tục điều phối",
      ];
    case "COST_REJECTED":
      return [
        "Bộ phận dịch vụ",
        "Xem phản hồi chi phí và thống nhất phương án tiếp theo",
      ];
    case "AWAITING_INFO":
      return ["Khách hàng", "Bổ sung thông tin theo nội dung trao đổi"];
    case "AWAITING_CUSTOMER_APPROVAL":
      return ["Quản trị khách hàng", "Xem và phản hồi đúng phiên bản dự toán"];
    case "PROCESSING":
      return ["Đội ngũ thực hiện", "Theo dõi lệnh công việc và các trở ngại"];
    case "RESOLVED":
      return [
        "Khách hàng / bộ phận dịch vụ",
        "Đọc kết quả, phần còn lại và xác nhận phạm vi đã xử lý",
      ];
    case "CLOSED":
      return ["Đã khép yêu cầu", "Tra cứu kết quả và lịch sử xác nhận"];
    default:
      return ["Xem hồ sơ nguồn", "Kiểm tra trạng thái và lý do đã ghi nhận"];
  }
}
export function recordAge(input: unknown, now = Date.now()) {
  const time = input ? Date.parse(String(input)) : NaN;
  if (!Number.isFinite(time)) return "Chưa có thời điểm tạo";
  const hours = Math.max(0, Math.floor((now - time) / 3_600_000));
  return hours < 1
    ? "Tạo chưa đầy 1 giờ"
    : hours < 24
      ? `Tuổi hồ sơ: ${hours} giờ`
      : `Tuổi hồ sơ: ${Math.floor(hours / 24)} ngày`;
}
export function workOrderSiteId(order: Row) {
  return typeof order.customerSiteId === "string" && order.customerSiteId
    ? order.customerSiteId
    : null;
}
export function isPositiveQuantity(input: unknown) {
  return (
    typeof input === "string" &&
    /^\d+(\.\d+)?$/.test(input) &&
    /[1-9]/.test(input)
  );
}
export function workOrderActionError(error: {
  code?: string;
  status?: number;
  message?: string;
}) {
  if (error.code === "INVENTORY_RESERVATION_HELD")
    return "Công việc đang chờ đối soát giao dịch kho. Nhờ nhân viên kho kiểm tra giao dịch của lệnh này trước khi hoàn tất hoặc hủy; làm mới trang không tự giải quyết giao dịch đang treo.";
  if (error.status === 409)
    return "Hồ sơ vừa thay đổi. Làm mới để kiểm tra trước khi thao tác tiếp.";
  if (error.status === 403)
    return "Tài khoản không có quyền thực hiện thao tác này.";
  return error.message || "Không thể lưu thay đổi.";
}
/** Display only: arithmetic and final totals remain authoritative at the server. */
export function formatServiceMoney(input: unknown, currency = "VND") {
  const text = String(input ?? "");
  if (!/^-?\d+(\.\d+)?$/.test(text)) return "Chưa có số tiền";
  const [whole, fraction] = text.split(".");
  const decimal = fraction?.replace(/0+$/, "");
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}${decimal ? `,${decimal}` : ""} ${currency}`;
}
export function workOrderNextStep(order: Row) {
  switch (order.status) {
    case "CREATED":
      return [
        "Phân công người thực hiện",
        "Chọn kỹ thuật viên phù hợp và lên khung giờ dự kiến để bắt đầu xử lý.",
      ];
    case "ASSIGNED":
      return [
        "Chờ kỹ thuật viên nhận việc",
        "Theo dõi phản hồi; có thể phân công lại nếu cần.",
      ];
    case "ACCEPTED":
    case "TRAVELLING":
      return [
        "Theo dõi lịch thực hiện",
        "Kỹ thuật viên đã nhận công việc. Kiểm tra lịch dự kiến và thông tin liên hệ tại địa điểm.",
      ];
    case "IN_PROGRESS":
      return [
        "Theo dõi tiến độ xử lý",
        "Theo dõi checklist, phụ tùng và báo cáo trước khi thông báo kết quả cho khách hàng.",
      ];
    case "ON_HOLD":
      return [
        "Kiểm tra lý do tạm dừng",
        "Xem nhật ký công việc, phối hợp kỹ thuật viên và kho để gỡ vướng.",
      ];
    case "COMPLETED":
      return [
        "Kiểm tra kết quả dịch vụ",
        "Đọc báo cáo, kết quả checklist và tình trạng phụ tùng; theo dõi xác nhận tại yêu cầu dịch vụ.",
      ];
    case "CANCELLED":
      return [
        "Kiểm tra yêu cầu liên quan",
        "Xem lý do hủy và trạng thái yêu cầu dịch vụ hoặc công việc bảo trì để quyết định bước tiếp theo.",
      ];
    default:
      return [
        "Kiểm tra trạng thái mới nhất",
        "Làm mới hồ sơ trước khi quyết định thao tác.",
      ];
  }
}
