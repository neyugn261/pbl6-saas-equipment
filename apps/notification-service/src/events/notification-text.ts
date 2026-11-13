const statuses: Record<string, string> = {
  NEW: 'mới tiếp nhận; bộ phận dịch vụ sẽ xem xét',
  REVIEWING: 'đang đánh giá; bộ phận dịch vụ cần xác định phương án tiếp theo',
  AWAITING_INFO: 'chờ bổ sung thông tin; vui lòng mở hồ sơ để phản hồi',
  AWAITING_CUSTOMER_APPROVAL: 'chờ khách hàng duyệt dự toán; hãy kiểm tra phạm vi và chi phí',
  ACCEPTED: 'đã tiếp nhận; bộ phận dịch vụ sẽ điều phối công việc',
  PROCESSING: 'đang xử lý', RESOLVED: 'đã có kết quả; vui lòng kiểm tra trước khi xác nhận',
  CLOSED: 'đã đóng', REJECTED: 'đã từ chối', CANCELLED: 'đã hủy',
  COST_REJECTED: 'dự toán bị từ chối; bộ phận dịch vụ cần xem xét phương án khác',
};
export function statusText(status: string): string {
  return statuses[status] ?? 'đã cập nhật; vui lòng mở hồ sơ để xem trạng thái hiện tại';
}
export function resultText(result: string): string {
  return result === 'UNRESOLVED' ? 'Chưa xử lý được' : result === 'PARTIALLY_RESOLVED'
    ? 'Mới giải quyết một phần' : 'Đã giải quyết';
}
