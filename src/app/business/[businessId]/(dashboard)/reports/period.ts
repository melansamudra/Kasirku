export type Period = "today" | "week" | "month" | "all" | "custom";

export const PERIOD_LABELS: Record<Period, string> = {
  today: "Hari Ini",
  week: "7 Hari",
  month: "Bulan Ini",
  all: "Semua",
  custom: "📅 Kustom",
};

export const PERIOD_DESCRIPTIONS: Record<Period, string> = {
  today: "Hari ini",
  week: "7 hari terakhir",
  month: "Bulan ini",
  all: "Semua waktu",
  custom: "Periode kustom",
};

// Seluruh UI berbahasa Indonesia; batas hari & jam laporan dihitung di zona WIB,
// bukan zona server (yang bisa saja UTC saat production).
export const REPORT_TIMEZONE = "Asia/Jakarta";

export function parsePeriod(value: string | undefined): Period {
  return (["today", "week", "month", "all", "custom"] as const).includes(value as Period)
    ? (value as Period)
    : "today";
}

function todayStr() {
  return new Date().toLocaleDateString("en-CA", { timeZone: REPORT_TIMEZONE });
}

function addDaysStr(dateStr: string, days: number) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Ubah tanggal lokal WIB (YYYY-MM-DD) jadi timestamp UTC awal hari itu. */
function wibStartOfDay(dateStr: string) {
  return `${dateStr}T00:00:00+07:00`;
}

export type DateRange = { fromIso: string | null; toIsoExclusive: string | null };

/**
 * Rentang timestamptz [fromIso, toIsoExclusive) untuk filter kolom
 * `transactions.date` sesuai periode laporan.
 */
export function getPeriodRange(
  period: Period,
  customFrom?: string,
  customTo?: string,
): DateRange {
  const today = todayStr();
  if (period === "today") {
    return { fromIso: wibStartOfDay(today), toIsoExclusive: null };
  }
  if (period === "week") {
    return { fromIso: wibStartOfDay(addDaysStr(today, -6)), toIsoExclusive: null };
  }
  if (period === "month") {
    return { fromIso: wibStartOfDay(`${today.slice(0, 7)}-01`), toIsoExclusive: null };
  }
  if (period === "custom") {
    const isDate = (s: string | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
    return {
      fromIso: isDate(customFrom) ? wibStartOfDay(customFrom) : null,
      toIsoExclusive: isDate(customTo) ? wibStartOfDay(addDaysStr(customTo, 1)) : null,
    };
  }
  return { fromIso: null, toIsoExclusive: null };
}
