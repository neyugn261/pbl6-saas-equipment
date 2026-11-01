import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { WorkOrderSummaryQueryDto } from './dto';
import { reportRange, reportTimestamp } from './report-range';

describe('Q5 report time interval', () => {
  it('normalizes local calendar boundaries to UTC without using the server timezone', () => {
    expect(
      reportRange('2026-11-01T00:00:00+07:00', '2026-12-01T00:00:00+07:00'),
    ).toEqual({
      from: '2026-10-31T17:00:00.000Z',
      to: '2026-11-30T17:00:00.000Z',
    });
    expect(reportTimestamp('2026-10-31T13:00:00-04:00').iso).toBe(
      '2026-10-31T17:00:00.000Z',
    );
  });
  it('preserves microseconds when distinct bounds fall in the same JavaScript millisecond', () => {
    const result = reportRange(
      '2026-11-01T00:00:00.000001Z',
      '2026-11-01T00:00:00.000002Z',
    );
    expect(result).toEqual({
      from: '2026-11-01T00:00:00.000001Z',
      to: '2026-11-01T00:00:00.000002Z',
    });
    expect(reportTimestamp('1969-12-31T23:59:59.999999Z').micros).toBe(-1n);
  });
  it('compares instants across offsets and rejects equal or reversed intervals', () => {
    expect(() =>
      reportRange('2026-11-01T00:00:00+07:00', '2026-10-31T17:00:00Z'),
    ).toThrow('from must be earlier');
    expect(() =>
      reportRange('2026-11-01T00:00:00.000002Z', '2026-11-01T00:00:00.000001Z'),
    ).toThrow('from must be earlier');
  });
  it.each([
    '2026-11-01',
    '2026-11-01T00:00:00',
    '2026-02-29T00:00:00Z',
    '2026-02-30T00:00:00Z',
    '2026-11-01T24:00:00Z',
    '2026-11-01T00:00:00+24:00',
    '2026-11-01T00:00:00.0000001Z',
  ])(
    'rejects ambiguous, invalid or over-precision timestamp %s at the boundary',
    (from) => {
      const dto = plainToInstance(WorkOrderSummaryQueryDto, {
        from,
        to: '2026-12-01T00:00:00Z',
      });
      expect(validateSync(dto).length).toBeGreaterThan(0);
    },
  );
  it('accepts leap days and RFC3339 lowercase t/z', () => {
    const dto = plainToInstance(WorkOrderSummaryQueryDto, {
      from: '2028-02-29t00:00:00z',
      to: '2028-03-01T00:00:00Z',
    });
    expect(validateSync(dto)).toHaveLength(0);
    expect(dto.from).toBe('2028-02-29T00:00:00Z');
  });
  it('rejects a normalization outside the supported four-digit UTC calendar', () => {
    expect(() => reportTimestamp('9999-12-31T23:59:59-23:59')).toThrow(
      'UTC years',
    );
  });
});
