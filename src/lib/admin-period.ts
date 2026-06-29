import type { AdminPeriod } from "@/components/admin/AdminShell";
import { customRange, rangeForPreset, type DateRange } from "@/lib/date-range";

/** Map AdminPeriod (+ optional custom YYYY-MM-DD) into a DateRange. */
export function adminPeriodToRange(
  p: AdminPeriod,
  customStart?: string,
  customEnd?: string,
): DateRange {
  switch (p) {
    case "today":
      return rangeForPreset("today");
    case "yesterday":
      return rangeForPreset("yesterday");
    case "7d":
      return rangeForPreset("7d");
    case "30d":
      return rangeForPreset("30d");
    case "custom":
      if (customStart && customEnd) return customRange(customStart, customEnd);
      // Fallback: last 7 days while user hasn't picked range yet
      return rangeForPreset("7d");
  }
}
