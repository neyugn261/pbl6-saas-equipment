import type { RequestDetail } from "../../types/domain";

type IntakeRequest = Pick<RequestDetail, "status" | "allowedActions" | "warrantyCheck" | "assessmentRequired" | "coverageAssessment" | "resolutionResult">;

export function requestIntake(request: IntakeRequest) {
  const allows = (action: string) => request.allowedActions.includes(action);
  if (allows("review")) return {
    stage: 0, target: "request-review", title: "Xem xét sự cố",
    detail: "Đọc mô tả và bắt đầu xem xét để hệ thống kiểm tra thời hạn bảo hành.",
  };
  if (request.status === "AWAITING_INFO") return {
    stage: 0, title: "Chờ khách hàng bổ sung thông tin",
    detail: "Theo dõi trao đổi trong hồ sơ để tiếp tục xem xét khi đã đủ căn cứ.",
  };
  if (!request.warrantyCheck && allows("warranty-check")) return {
    stage: 1, target: "request-warranty-check", title: "Kiểm tra thời hạn bảo hành",
    detail: "Cần có kết quả kiểm tra thời hạn trước khi kết luận phạm vi bảo hành của sự cố.",
  };
  if (request.assessmentRequired && !request.coverageAssessment && allows("assess-warranty")) return {
    stage: 1, target: "request-assessment", title: "Thẩm định bảo hành",
    detail: "Đối chiếu nguyên nhân với điều khoản và lưu kết luận ngay bên cạnh mô tả sự cố.",
  };
  if (allows("accept")) return {
    stage: 2, target: "request-accept", title: "Tiếp nhận yêu cầu",
    detail: "Hồ sơ đủ điều kiện tiếp nhận. Sau khi tiếp nhận, kiểm tra các lệnh liên quan trước khi tạo lệnh mới.",
  };
  if (["create-estimate", "edit-estimate", "send-estimate"].some(allows)) return {
    stage: 2, target: "request-estimate", title: "Chuẩn bị dự toán sửa chữa",
    detail: "Lập dự toán khi đã đủ căn cứ. Nếu chưa rõ nguyên nhân hoặc phạm vi, ghi nhận nhu cầu khảo sát và phối hợp xác minh trước khi báo giá.",
  };
  if (request.status === "AWAITING_CUSTOMER_APPROVAL") return {
    stage: 2, target: "request-estimate", title: "Chờ khách hàng phản hồi dự toán",
    detail: "Theo dõi phiên bản dự toán đã gửi và thời hạn hiệu lực trước khi tiếp tục.",
  };
  if (request.status === "ACCEPTED") return {
    stage: 3, target: "request-create-order",
    title: request.resolutionResult === "UNRESOLVED" ? "Điều phối xử lý lại" : "Kiểm tra và tạo lệnh công việc",
    detail: "Kiểm tra lệnh liên quan và kết quả lần trước trước khi tạo lệnh mới.",
  };
  if (allows("assess-warranty") && !request.coverageAssessment) return {
    stage: 1, target: "request-assessment", title: "Thẩm định bảo hành",
    detail: "Kiểm tra điều khoản và ghi nhận kết luận trước khi chọn phương án xử lý.",
  };
  if (["NEW", "REVIEWING", "COST_REJECTED"].includes(request.status)) return {
    stage: request.status === "NEW" ? 0 : 2, title: "Chưa có thao tác khả dụng",
    detail: "Kiểm tra quyền, kết luận bảo hành và dự toán hiện có. Hệ thống hiển thị thao tác khi hồ sơ đủ điều kiện.",
  };
  return {
    stage: 3, title: "Theo dõi quá trình xử lý",
    detail: "Xem lệnh công việc, kết quả kỹ thuật và lịch sử để biết việc còn chờ xử lý.",
  };
}
