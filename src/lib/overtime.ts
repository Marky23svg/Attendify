/**
 * Overtime = time worked past the configured work_end_time (Rule A),
 * measured on the REAL elapsed timeline and capped at the hours worked.
 *
 * - workEndTime is a "HH:MM" or "HH:MM:SS" clock time (24-hour).
 * - If timeIn or timeOut is missing/invalid, or timeOut <= timeIn → 0.
 * - Overnight shifts are handled naturally: work_end is anchored to the same
 *   calendar day as time_in, and the elapsed difference crosses midnight.
 * - Overtime can never exceed the total time worked, so a short (or zero-length)
 *   shift can never report a large overtime.
 * - Result is rounded to 2 decimals.
 */
export function computeOvertime(
  timeIn: string | null,
  timeOut: string | null,
  workEndTime: string
): number {
  if (!timeIn || !timeOut) return 0;

  const start = new Date(timeIn);
  const end = new Date(timeOut);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;

  const workedMs = end.getTime() - start.getTime();
  if (workedMs <= 0) return 0;

  const [eh = 0, em = 0, es = 0] = String(workEndTime).split(':').map(Number);
  const workEnd = new Date(start);
  workEnd.setHours(eh, em, es, 0);

  // Elapsed time after work_end, floored at 0 and capped at the hours worked.
  const otMs = Math.max(0, end.getTime() - workEnd.getTime());
  const otHours = Math.min(otMs / 3_600_000, workedMs / 3_600_000);

  return Math.round(otHours * 100) / 100;
}
