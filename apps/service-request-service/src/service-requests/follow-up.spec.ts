import { followUp, needsFollowUp, nextAction, plainReason } from './follow-up';
import type { ServiceRequest } from '../generated/prisma/client.js';

const row = (extra = {}) => ({ id: 'sr', tenantId: 'tenant', branchId: 'branch', status: 'ACCEPTED',
  activeWorkOrderId: null, resolutionResult: 'UNRESOLVED', resolvedWorkOrderNo: 'WO-1',
  resolutionCompletedAt: new Date('2026-11-12T00:00:00Z'), ...extra }) as ServiceRequest;
const ledger = (extra = {}) => ({ tenantId: 'tenant', requestId: 'sr', workOrderId: 'wo', appliedPhase: 'COMPLETED',
  terminalPayload: { result: 'UNRESOLVED', workOrderNo: 'WO-1', completedAt: '2026-11-12T00:00:00Z', unresolvedReason: '<b>Thiếu phụ tùng</b>\u0000' }, ...extra });

describe('current follow-up projection', () => {
  it('reads sanitized reason only from the matching applied occurrence', () => {
    expect(followUp(row(), [ledger()])).toMatchObject({ reason: 'Thiếu phụ tùng', responsibleRole: 'SERVICE_MANAGER', workOrderId: 'wo' });
    expect(followUp(row(), [ledger({ tenantId: 'other' })])?.reason).toBeNull();
    expect(followUp(row(), [ledger({ requestId: 'other' })])?.reason).toBeNull();
    expect(followUp(row({ resolvedWorkOrderNo: 'WO-2' }), [ledger()])?.reason).toBeNull();
  });
  it.each(['PROCESSING', 'RESOLVED', 'CLOSED', 'CANCELLED', 'REJECTED', 'NEW'])('does not warn about historical UNRESOLVED in %s', (status) => {
    expect(followUp(row({ status }), [ledger()])).toBeNull();
  });
  it('removes warning after replacement and resolution; preserves legacy fallback', () => {
    expect(needsFollowUp(row({ activeWorkOrderId: 'replacement' }))).toBe(false);
    expect(needsFollowUp(row({ resolutionResult: 'RESOLVED' }))).toBe(false);
    expect(followUp(row(), [])?.reason).toBeNull();
    expect(followUp(row({ branchId: null }), [])?.responsibleRole).toBe('TENANT_ADMIN');
  });
  it('distinguishes partial completion awaiting customer decision', () => {
    expect(needsFollowUp(row({ status: 'RESOLVED', resolutionResult: 'PARTIALLY_RESOLVED' }))).toBe(true);
    expect(needsFollowUp(row({ status: 'CLOSED', resolutionResult: 'PARTIALLY_RESOLVED' }))).toBe(false);
  });
  it('bounds plain text without interpreting markup', () => {
    expect(plainReason('x'.repeat(3000))).toHaveLength(2000);
    expect(plainReason(null)).toBeNull();
  });
});

describe('next action without implicit approvals', () => {
  const request = row({ status: 'REVIEWING', warrantyCheckResult: 'OUT_OF_WARRANTY', coverageAssessment: { decision: 'NOT_COVERED' } });
  it('offers conditional direct estimate / inspection without inventing readiness', () => {
    const hint = nextAction(request, ['create-estimate'], null);
    expect(hint).toContain('Đủ thông tin: lập dự toán');
    expect(hint).toContain('Chưa đủ thông tin');
    expect(hint).toContain('không thay thế duyệt chi phí sửa chữa');
  });
  it('honors current draft, sent and approved actions', () => {
    expect(nextAction(request, ['edit-estimate'], 'DRAFT')).toContain('bản nháp');
    expect(nextAction(request, [], 'SENT')).toContain('chờ khách hàng');
    expect(nextAction(request, ['approve-estimate'], 'SENT')).toContain('phạm vi');
    expect(nextAction(row({ status: 'ACCEPTED' }), [], 'APPROVED')).toContain('được chấp thuận');
  });
  it('does not offer estimate without authorized action or warranty assessment', () => {
    expect(nextAction(request, [], null)).not.toContain('Đủ thông tin: lập dự toán');
    expect(nextAction(row(), ['assess-warranty'], null)).toContain('Đánh giá');
    expect(nextAction(row(), ['accept'], null)).toContain('bảo hành');
  });
});
