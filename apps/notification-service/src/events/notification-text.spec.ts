import { resultText, statusText } from './notification-text';

describe('Vietnamese notification text', () => {
  it.each(['NEW', 'REVIEWING', 'AWAITING_INFO', 'AWAITING_CUSTOMER_APPROVAL', 'ACCEPTED', 'PROCESSING', 'RESOLVED', 'CLOSED', 'REJECTED', 'CANCELLED', 'COST_REJECTED'])('renders %s without raw state names', (status) => {
    expect(statusText(status)).not.toContain(status);
    expect(statusText(status)).not.toMatch(/[0-9a-f]{8}-/);
  });
  it('does not describe unresolved or partial cases as successful', () => {
    expect(resultText('UNRESOLVED')).toBe('Chưa xử lý được');
    expect(resultText('PARTIALLY_RESOLVED')).toBe('Mới giải quyết một phần');
    expect(resultText('RESOLVED')).toBe('Đã giải quyết');
    expect(statusText('unknown')).toContain('mở hồ sơ');
  });
});
