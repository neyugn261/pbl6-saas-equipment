export function maintenanceDates(
  first: string,
  unit: string,
  interval: number,
  count = 4,
) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(first) ||
    !Number.isInteger(interval) ||
    interval < 1 ||
    interval > 10000 ||
    !["DAY", "WEEK", "MONTH", "YEAR"].includes(unit)
  )
    return [];
  const base = new Date(`${first}T00:00:00Z`);
  if (
    !Number.isFinite(base.getTime()) ||
    base.toISOString().slice(0, 10) !== first
  )
    return [];
  return Array.from({ length: count }, (_, index) => {
    const result = new Date(base);
    if (unit === "DAY" || unit === "WEEK")
      result.setUTCDate(
        base.getUTCDate() + index * interval * (unit === "WEEK" ? 7 : 1),
      );
    else {
      result.setUTCDate(1);
      if (unit === "MONTH")
        result.setUTCMonth(base.getUTCMonth() + index * interval);
      else result.setUTCFullYear(base.getUTCFullYear() + index * interval);
      const end = new Date(result);
      end.setUTCMonth(end.getUTCMonth() + 1, 0);
      result.setUTCDate(Math.min(base.getUTCDate(), end.getUTCDate()));
    }
    return result.getUTCFullYear() <= 9999
      ? result.toISOString().slice(0, 10)
      : "Ngoài phạm vi xem trước";
  });
}
