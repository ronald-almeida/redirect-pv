// Brazilian timezone (America/Sao_Paulo, UTC-3, no DST) day-boundary helpers.
// All ranges are expressed as ISO instants in UTC, but the day cutoffs are
// computed against the BRT calendar so "today" resets at 00:00 BRT.

const TZ = "America/Sao_Paulo";
const OFFSET = "-03:00";

function brtDateParts(d: Date): { y: number; m: number; day: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const [y, m, day] = fmt.format(d).split("-").map(Number);
  return { y, m, day };
}

/** Start of BRT day for `now`, offset by `daysBack` days. */
export function brtDayStart(now: Date, daysBack = 0): Date {
  const { y, m, day } = brtDateParts(now);
  const base = new Date(
    `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}T00:00:00${OFFSET}`,
  );
  base.setUTCDate(base.getUTCDate() - daysBack);
  return base;
}

/** End of BRT day (exclusive — start of next day). */
export function brtDayEnd(now: Date, daysBack = 0): Date {
  return brtDayStart(now, daysBack - 1);
}

export type RangePreset = "today" | "yesterday" | "7d" | "30d" | "all" | "custom";

export interface DateRange {
  start: Date | null; // null = no lower bound (for "all")
  end: Date | null;   // null = no upper bound (until now)
  preset: RangePreset;
}

export function rangeForPreset(preset: RangePreset, now = new Date()): DateRange {
  switch (preset) {
    case "today":
      return { start: brtDayStart(now, 0), end: null, preset };
    case "yesterday":
      return { start: brtDayStart(now, 1), end: brtDayStart(now, 0), preset };
    case "7d":
      return { start: brtDayStart(now, 6), end: null, preset };
    case "30d":
      return { start: brtDayStart(now, 29), end: null, preset };
    case "all":
      return { start: null, end: null, preset };
    case "custom":
      return { start: null, end: null, preset };
  }
}

/** Build a custom range from BRT YYYY-MM-DD strings (inclusive). */
export function customRange(startYmd: string, endYmd: string): DateRange {
  const start = startYmd
    ? new Date(`${startYmd}T00:00:00${OFFSET}`)
    : null;
  const end = endYmd
    ? (() => {
        const d = new Date(`${endYmd}T00:00:00${OFFSET}`);
        d.setUTCDate(d.getUTCDate() + 1);
        return d;
      })()
    : null;
  return { start, end, preset: "custom" };
}

export function formatBrtDate(d: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

export function todayBrtYmd(now = new Date()): string {
  const { y, m, day } = brtDateParts(now);
  return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
