export type Period = "today" | "week" | "month" | "all" | "custom";

// Cookie yang menyimpan pilihan periode terakhir supaya persist lintas
// halaman laporan/akuntansi (Fase 7 — sinkronisasi periode global). Cuma
// nama string biasa, aman diimpor dari client maupun server component.
export const PERIOD_COOKIE_NAME = "kk_period";

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

import type { SupabaseClient } from "@supabase/supabase-js";

export function parsePeriod(value: string | undefined): Period {
  return (["today", "week", "month", "all", "custom"] as const).includes(value as Period)
    ? (value as Period)
    : "today";
}

// Bisnis yang stafnya (kasir, bukan owner) dibatasi cuma bisa lihat periode
// "Hari Ini" di Laporan & Kas Bank -- diminta pemilik Adi's Culinary Pleburan
// supaya kasir tidak bisa lihat riwayat/laporan hari-hari sebelumnya. Belum
// ada UI toggle untuk ini; tambahkan businessId lain di sini kalau owner
// bisnis lain minta hal yang sama.
const STAFF_TODAY_ONLY_BUSINESS_IDS = new Set<string>([
  "356ada11-270d-4249-b45c-0a30c12de58c", // Adi's Culinary Pleburan
]);

/** Dipakai oleh caller yang isOwner-nya sudah dihitung sendiri (mis. sudah
 * query business_staff untuk keperluan lain), supaya tidak query dobel. */
export function isStaffTodayOnlyBusiness(businessId: string, isOwner: boolean) {
  return !isOwner && STAFF_TODAY_ONLY_BUSINESS_IDS.has(businessId);
}

/**
 * Resolusi periode yang boleh dilihat user saat ini: owner selalu bebas
 * pilih periode; staf (non-owner) di bisnis yang masuk daftar di atas
 * dipaksa "today" di server -- walau query string diubah manual -- dan UI
 * pemanggil sebaiknya sembunyikan PeriodTabs saat `locked` true.
 */
export async function resolveReportPeriod(
  supabase: SupabaseClient,
  businessId: string,
  rawPeriod: string | undefined,
): Promise<{ period: Period; locked: boolean; isOwner: boolean }> {
  const [{ data: business }, { data: userData }] = await Promise.all([
    supabase.from("businesses").select("owner_id").eq("id", businessId).maybeSingle(),
    supabase.auth.getUser(),
  ]);
  const isOwner = Boolean(business?.owner_id) && business?.owner_id === userData.user?.id;
  const locked = isStaffTodayOnlyBusiness(businessId, isOwner);
  const period = locked ? "today" : parsePeriod(rawPeriod);
  return { period, locked, isOwner };
}

function todayStr() {
  return new Date().toLocaleDateString("en-CA", { timeZone: REPORT_TIMEZONE });
}

export function addDaysStr(dateStr: string, days: number) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Ubah tanggal lokal WIB (YYYY-MM-DD) jadi timestamp UTC awal hari itu. */
export function wibStartOfDay(dateStr: string) {
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
