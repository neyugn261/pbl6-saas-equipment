const statusLabels: Record<string, string> = {
  NEW: 'Mới',
  REVIEWING: 'Đang xem xét',
  AWAITING_INFO: 'Chờ bổ sung',
  AWAITING_CUSTOMER_APPROVAL: 'Chờ khách hàng duyệt',
  ACCEPTED: 'Đã tiếp nhận',
  PROCESSING: 'Đang xử lý',
  RESOLVED: 'Đã xử lý',
  CLOSED: 'Đã đóng',
  REJECTED: 'Đã từ chối',
  COST_REJECTED: 'Từ chối báo giá',
  CANCELLED: 'Đã hủy',
  ACTIVE: 'Hoạt động',
  IN_SERVICE: 'Đang bảo trì',
  OUT_OF_SERVICE: 'Ngừng hoạt động',
  RETIRED: 'Ngừng sử dụng',
  INACTIVE: 'Không hoạt động',
  SUSPENDED: 'Tạm khóa',
  DISABLED: 'Đã vô hiệu hóa',
  IN_WARRANTY: 'Còn bảo hành',
  OUT_OF_WARRANTY: 'Hết bảo hành',
  NO_WARRANTY: 'Không có bảo hành',
}

const positive = new Set(['ACTIVE', 'ACCEPTED', 'RESOLVED', 'CLOSED', 'IN_WARRANTY'])
const warning = new Set(['NEW', 'REVIEWING', 'AWAITING_INFO', 'AWAITING_CUSTOMER_APPROVAL', 'PROCESSING', 'IN_SERVICE'])
const negative = new Set(['REJECTED', 'COST_REJECTED', 'CANCELLED', 'OUT_OF_SERVICE', 'RETIRED', 'SUSPENDED', 'DISABLED', 'OUT_OF_WARRANTY'])

export function StatusBadge({ status }: { status: string }) {
  const tone = positive.has(status) ? 'positive' : warning.has(status) ? 'warning' : negative.has(status) ? 'negative' : 'neutral'
  return <span className={`status-badge status-badge--${tone}`}><span className="status-badge__dot" />{statusLabels[status] ?? status}</span>
}

const priorityLabels: Record<string, string> = {
  LOW: 'Thấp',
  NORMAL: 'Bình thường',
  HIGH: 'Cao',
  URGENT: 'Khẩn cấp',
}

export function PriorityBadge({ priority }: { priority: string }) {
  return <span className={`priority-badge priority-badge--${priority.toLowerCase()}`}>{priorityLabels[priority] ?? priority}</span>
}
