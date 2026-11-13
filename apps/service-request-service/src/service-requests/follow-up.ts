import type { ServiceRequest, WorkOrderLifecycle } from '../generated/prisma/client.js';
import { estimateAllowed } from './warranty-coverage';

/** Mirrors the current-state predicate used by the paginated queue. */
export function needsFollowUp(request: ServiceRequest): boolean {
  return request.activeWorkOrderId === null &&
    ((request.resolutionResult === 'UNRESOLVED' && ['ACCEPTED', 'REVIEWING'].includes(request.status)) ||
      (request.resolutionResult === 'PARTIALLY_RESOLVED' && request.status === 'RESOLVED'));
}

export function plainReason(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  // Text only; consumers must still render as text, never HTML.
  return Array.from(value.replace(/<[^>]*>/g, '')).filter((char) => {
    const code = char.charCodeAt(0);
    return code !== 127 && (code >= 32 || code === 9 || code === 10 || code === 13);
  }).join('').trim().slice(0, 2000) || null;
}

export function followUp(request: ServiceRequest, lifecycles: Pick<WorkOrderLifecycle,
  'tenantId' | 'requestId' | 'workOrderId' | 'appliedPhase' | 'terminalPayload'>[]) {
  if (!needsFollowUp(request)) return null;
  const source = lifecycles.find((row) => {
    const p = row.terminalPayload as Record<string, unknown> | null;
    return row.tenantId === request.tenantId && row.requestId === request.id &&
      row.appliedPhase === 'COMPLETED' && p?.result === request.resolutionResult &&
      p.workOrderNo === request.resolvedWorkOrderNo &&
      typeof p.completedAt === 'string' &&
      new Date(p.completedAt).getTime() === request.resolutionCompletedAt?.getTime();
  });
  const payload = source?.terminalPayload as Record<string, unknown> | undefined;
  return {
    result: request.resolutionResult,
    reason: plainReason(payload?.unresolvedReason),
    workOrderId: source?.workOrderId ?? null,
    workOrderNo: request.resolvedWorkOrderNo,
    recordedAt: request.resolutionCompletedAt,
    responsibleRole: request.branchId ? 'SERVICE_MANAGER' : 'TENANT_ADMIN',
    nextAction: request.branchId
      ? 'Kiểm tra kết quả và lập phương án xử lý tiếp theo.'
      : 'Phân bổ chi nhánh để bộ phận dịch vụ xử lý tiếp.',
  };
}

/** Guidance only: no invented readiness decision or implicit customer consent. */
export function nextAction(request: ServiceRequest, actions: string[], estimateStatus: string | null) {
  if (actions.includes('approve-estimate')) return 'Kiểm tra phạm vi và chi phí dự toán trước khi chấp thuận hoặc từ chối.';
  if (estimateStatus === 'SENT') return 'Đang chờ khách hàng phản hồi dự toán đã gửi.';
  if (actions.includes('edit-estimate')) return 'Hoàn thiện bản nháp và gửi dự toán để khách hàng xem xét.';
  if (actions.includes('create-estimate') && estimateAllowed(request))
    return 'Đủ thông tin: lập dự toán sửa chữa. Chưa đủ thông tin: thống nhất phạm vi và phí khảo sát với khách trước khi thực hiện INSPECTION; đồng ý khảo sát không thay thế duyệt chi phí sửa chữa.';
  if (actions.includes('accept')) return 'Tiếp nhận yêu cầu thuộc phạm vi bảo hành.';
  if (actions.includes('assess-warranty')) return 'Đánh giá phạm vi bảo hành sự cố trước khi chọn phương án xử lý.';
  if (request.status === 'ACCEPTED') return 'Bộ phận dịch vụ lập và điều phối lệnh công việc theo phạm vi đã được chấp thuận.';
  if (request.status === 'REVIEWING' && request.resolutionCompletedAt)
    return 'Xem kết quả khảo sát, đánh giá phạm vi bảo hành và lập dự toán nếu cần; khảo sát hoàn tất chưa có nghĩa sự cố đã được giải quyết.';
  return null;
}
