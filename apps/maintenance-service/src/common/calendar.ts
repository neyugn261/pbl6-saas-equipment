export type FrequencyUnit = 'DAY' | 'WEEK' | 'MONTH' | 'YEAR';
const DAY_MS = 86_400_000;

export function calendarDate(value: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value ||
    date.getUTCFullYear() < 1
  ) {
    throw new RangeError('Invalid calendar date');
  }
  return date;
}
export const dateText = (date: Date): string => date.toISOString().slice(0, 10);
export function vietnamToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Compute each occurrence from the original anchor, never a clamped predecessor. */
export function occurrence(
  anchor: Date,
  unit: FrequencyUnit,
  value: number,
  index: number,
): Date {
  if (
    !Number.isSafeInteger(value) ||
    value < 1 ||
    !Number.isSafeInteger(index) ||
    index < 0
  )
    throw new RangeError('Invalid frequency/index');
  if (unit === 'DAY' || unit === 'WEEK') {
    const date = new Date(
      anchor.getTime() + index * value * (unit === 'WEEK' ? 7 : 1) * DAY_MS,
    );
    if (date.getUTCFullYear() > 9999 || !Number.isFinite(date.getTime()))
      throw new RangeError('Schedule exceeds year 9999');
    return date;
  }
  const months =
    anchor.getUTCFullYear() * 12 +
    anchor.getUTCMonth() +
    index * value * (unit === 'YEAR' ? 12 : 1);
  const year = Math.floor(months / 12);
  const month = months % 12;
  if (year > 9999) throw new RangeError('Schedule exceeds year 9999');
  const lastDay = new Date(0);
  lastDay.setUTCFullYear(year, month + 1, 0);
  const day = Math.min(anchor.getUTCDate(), lastDay.getUTCDate());
  return calendarDate(
    `${String(year).padStart(4, '0')}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
  );
}

export function dueWindow(
  anchor: Date,
  unit: FrequencyUnit,
  value: number,
  today: Date,
) {
  if (anchor > today) return null;
  const distance =
    unit === 'DAY' || unit === 'WEEK'
      ? Math.floor((today.getTime() - anchor.getTime()) / DAY_MS) /
        (unit === 'WEEK' ? 7 : 1)
      : (today.getUTCFullYear() - anchor.getUTCFullYear()) *
          (unit === 'YEAR' ? 1 : 12) +
        (unit === 'YEAR' ? 0 : today.getUTCMonth() - anchor.getUTCMonth());
  let index = Math.max(0, Math.floor(distance / value));
  while (index > 0 && occurrence(anchor, unit, value, index) > today) index--;
  while (occurrence(anchor, unit, value, index + 1) <= today) index++;
  return {
    scheduledDate: occurrence(anchor, unit, value, index),
    nextDueDate: occurrence(anchor, unit, value, index + 1),
  };
}
