import {
  calendarDate,
  dateText,
  dueWindow,
  occurrence,
  vietnamToday,
} from './calendar';
describe('fixed-anchor Vietnam maintenance calendar', () => {
  it.each(['2026-02-29', '2024-02-30', '0000-01-01', '2026-2-01', 'invalid'])(
    'rejects nonexistent date %s',
    (value) => {
      expect(() => calendarDate(value)).toThrow(RangeError);
    },
  );
  it('clamps February but restores March 31 rather than drifting to March 28', () => {
    const anchor = calendarDate('2026-01-31');
    expect(
      [1, 2, 3].map((i) => dateText(occurrence(anchor, 'MONTH', 1, i))),
    ).toEqual(['2026-02-28', '2026-03-31', '2026-04-30']);
  });
  it('restores leap-day on the next leap year', () => {
    const anchor = calendarDate('2024-02-29');
    expect(dateText(occurrence(anchor, 'YEAR', 1, 1))).toBe('2025-02-28');
    expect(dateText(occurrence(anchor, 'YEAR', 1, 4))).toBe('2028-02-29');
  });
  it('uses Vietnam midnight independently from host timezone', () => {
    expect(vietnamToday(new Date('2026-10-26T16:59:59Z'))).toBe('2026-10-26');
    expect(vietnamToday(new Date('2026-10-26T17:00:00Z'))).toBe('2026-10-27');
  });
  it.each([
    ['DAY', 3, '2026-02-01', '2026-02-04'],
    ['WEEK', 2, '2026-01-28', '2026-02-11'],
    ['MONTH', 1, '2026-02-01', '2026-03-01'],
    ['YEAR', 1, '2026-01-01', '2027-01-01'],
  ] as const)(
    'finds one latest missed %s occurrence',
    (unit, value, latest, next) => {
      const window = dueWindow(
        calendarDate('2025-01-01'),
        unit,
        value,
        calendarDate('2026-02-01'),
      )!;
      expect([
        dateText(window.scheduledDate),
        dateText(window.nextDueDate),
      ]).toEqual([latest, next]);
    },
  );
  it('does not create a future occurrence early and catches up only the latest due day', () => {
    expect(
      dueWindow(
        calendarDate('2026-11-01'),
        'MONTH',
        1,
        calendarDate('2026-10-27'),
      ),
    ).toBeNull();
    const window = dueWindow(
      calendarDate('2026-01-31'),
      'MONTH',
      1,
      calendarDate('2026-05-20'),
    )!;
    expect(dateText(window.scheduledDate)).toBe('2026-04-30');
    expect(dateText(window.nextDueDate)).toBe('2026-05-31');
  });
});
