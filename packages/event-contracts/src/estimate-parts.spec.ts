import { Events, payloadProblems } from './catalog';
import { validEstimatePartLines } from './estimate-parts';
const id = '11111111-1111-4111-8111-111111111111';
const line = {
  lineId: id,
  partId: id,
  description: 'Approved part',
  quantity: '2',
  unitPrice: '0',
};
describe('Approved-parts snapshot contract', () => {
  it('accepts decimal text and rejects coercion, duplicate lines, negative and exponent prices', () => {
    expect(validEstimatePartLines([line])).toBe(true);
    for (const value of [
      { ...line, quantity: 2 },
      { ...line, unitPrice: '-1' },
      { ...line, unitPrice: '1e4' },
      { ...line, quantity: '0' },
    ])
      expect(validEstimatePartLines([value])).toBe(false);
    expect(validEstimatePartLines([line, line])).toBe(false);
  });
  it('bounds the monotonic sequence to the database integer domain', () => {
    const payload = {
      serviceRequestId: id,
      estimateId: id,
      estimateRevision: 1,
      sourceVersion: 1,
      status: 'APPROVED',
      currency: 'VND',
      lines: [line],
    };
    expect(payloadProblems(Events.CostEstimatePartsSnapshot, payload)).toEqual(
      [],
    );
    expect(
      payloadProblems(Events.CostEstimatePartsSnapshot, {
        ...payload,
        sourceVersion: 2147483648,
      }),
    ).toContain('sourceVersion is missing or invalid');
  });
});
