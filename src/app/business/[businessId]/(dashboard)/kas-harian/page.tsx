import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { todayWibDateString } from "@/lib/wib";
import { fetchAllRows } from "@/lib/pagination";
import { fetchKasBankLines, type KasBankLine } from "@/lib/kas-bank";
import MirrorKasToggle from "./mirror-kas-toggle";
import {
  PERIOD_COOKIE_NAME,
  PERIOD_DESCRIPTIONS,
  getPeriodRange,
  parsePeriod,
} from "../reports/period";
import PeriodTabs from "../reports/period-tabs";
import AddCashForm from "./add-cash-form";
import { PillBadge } from "@/components/ui/pill-badge";

const SOURCE_LABELS: Record<string, string> = {
  manual: "Manual",
  penjualan: "Penjualan",
  void: "Void",
  pembelian: "Pembelian",
  beban: "Beban",
  payroll: "Payroll",
  shift: "Shift",
  kas_kecil: "Kas Kecil",
};

const SOURCE_BADGE: Record<string, string> = {
  manual: "bg-zinc-100 text-zinc-600",
  penjualan: "bg-brand-50 text-brand-700",
  void: "bg-red-50 text-red-600",
  pembelian: "bg-amber-50 text-amber-700",
  beban: "bg-amber-50 text-amber-700",
  payroll: "bg-sky-50 text-sky-700",
  shift: "bg-violet-50 text-violet-700",
  kas_kecil: "bg-violet-50 text-violet-700",
};

function formatRupiah(value: number) {
  return `Rp${Math.round(value).toLocaleString("id-ID")}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

type CashLine = KasBankLine;

const STATUS_LABEL: Record<"pending" | "posted" | "rejected", string> = {
  pending: "Menunggu Admin",
  posted: "Disetujui",
  rejected: "Ditolak",
};
const STATUS_TONE: Record<"pending" | "posted" | "rejected", "amber" | "green" | "red"> = {
  pending: "amber",
  posted: "green",
  rejected: "red",
};

export default async function KasHarianPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}) {
  const { businessId } = await params;
  const { period: periodParam, from, to } = await searchParams;
  const cookieStore = await cookies();
  const period = parsePeriod(periodParam ?? cookieStore.get(PERIOD_COOKIE_NAME)?.value);
  const { fromIso, toIsoExclusive } = getPeriodRange(period, from, to);

  const supabase = await createClient();

  const [{ data: business }, { data: userData }, { data: cashFormAccountRows }] = await Promise.all([
    supabase.from("businesses").select("id, name, owner_id, mirroring_enabled").eq("id", businessId).single(),
    supabase.auth.getUser(),
    // 1-001 (Kas & Bank) dikeluarkan dari pilihan — tidak masuk akal jadi
    // sisi lain transaksi kas masuk/keluar yang justru menyentuh Kas & Bank
    // itu sendiri. 1-050 (suspense Kas Kecil) juga dikeluarkan supaya tidak
    // tercampur dengan alur approval Kas Kecil yang terpisah. 1-060 (Piutang
    // Karyawan) dikeluarkan juga -- sama alasan seperti di Kas Kecil
    // (post_petty_cash_kasbon): akun ini khusus dipakai OTOMATIS lewat alur
    // Kasbon yang mewajibkan pilih nama karyawan, supaya nyambung ke
    // employee_advances/sisa kasbon Payroll. Kalau dipilih manual di sini,
    // jurnalnya tetap balance tapi TIDAK terhubung ke karyawan manapun.
    supabase
      .from("accounts")
      .select("code, name")
      .eq("business_id", businessId)
      .neq("code", "1-001")
      .neq("code", "1-050")
      .neq("code", "1-060")
      .order("code"),
  ]);
  const cashFormAccounts = cashFormAccountRows ?? [];

  if (!business) {
    notFound();
  }

  const {
    nonVoidLines,
    displayLines,
    voidLines,
    pendingPettyCashLines,
    rejectedPettyCashLines,
    movementByEntryId: shiftMovementByEntryId,
    voidedSaleCount,
  } = await fetchKasBankLines(supabase, businessId, fromIso, toIsoExclusive);

  const isOwner = business?.owner_id === userData.user?.id;
  const showMirrorToggle = isOwner && !!business?.mirroring_enabled;

  const visibleKasRows = showMirrorToggle
    ? await fetchAllRows<{ journal_line_id: string }>((from, to) =>
        supabase
          .from("mirror_visible_kas")
          .select("journal_line_id")
          .eq("business_id", businessId)
          .range(from, to),
      )
    : [];

  const visibleKasIds = new Set(visibleKasRows.map((r) => r.journal_line_id));

  const totalMasuk = nonVoidLines.reduce((s, l) => s + Number(l.debit), 0);
  const totalKeluar = nonVoidLines.reduce((s, l) => s + Number(l.credit), 0);
  const totalVoid = voidLines
    .filter((l) => l.journal_entries.source === "void")
    .reduce((s, l) => s + Number(l.credit), 0);
  const totalPendingPettyCash = pendingPettyCashLines.reduce((s, l) => s + Number(l.credit), 0);
  const totalDitolak = rejectedPettyCashLines
    .filter((l) => Number(l.credit) > 0)
    .reduce((s, l) => s + Number(l.credit), 0);

  const renderCashRow = (l: CashLine) => {
    const isMasuk = Number(l.debit) > 0;
    const movement = shiftMovementByEntryId.get(l.journal_entries.id);
    return (
      <div key={l.id} className="flex items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-zinc-900">
            {l.journal_entries.description}
          </p>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-zinc-400">{formatDate(l.journal_entries.date)}</span>
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                SOURCE_BADGE[l.journal_entries.source] ?? "bg-zinc-100 text-zinc-600"
              }`}
            >
              {SOURCE_LABELS[l.journal_entries.source] ?? l.journal_entries.source}
            </span>
            {movement?.category && (
              <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600">
                {movement.category}
              </span>
            )}
            {movement?.direction === "out" && (
              <PillBadge tone={STATUS_TONE[movement.status]}>{STATUS_LABEL[movement.status]}</PillBadge>
            )}
            {movement?.receipt_url && (
              <a
                href={movement.receipt_url}
                target="_blank"
                rel="noreferrer"
                className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 hover:bg-amber-100"
              >
                🧾 Lihat Nota
              </a>
            )}
          </div>
        </div>
        <p className={`shrink-0 text-sm font-bold ${isMasuk ? "text-brand-700" : "text-red-600"}`}>
          {isMasuk ? "+" : "-"}
          {formatRupiah(isMasuk ? Number(l.debit) : Number(l.credit))}
        </p>
        {showMirrorToggle && (
          <MirrorKasToggle
            businessId={businessId}
            journalLineId={l.id}
            visible={visibleKasIds.has(l.id)}
          />
        )}
      </div>
    );
  };

  return (
    <div className="w-full max-w-2xl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-zinc-900">Kas & Bank — {business.name}</h1>
          <p className="mt-0.5 text-xs text-zinc-500">{PERIOD_DESCRIPTIONS[period]}</p>
        </div>
        <PeriodTabs basePath={`/business/${businessId}/kas-harian`} period={period} />
      </div>

      {period === "custom" && (
        <form
          method="get"
          className="mt-4 flex flex-wrap items-end gap-3 rounded-xl bg-white shadow-sm p-4"
        >
          <input type="hidden" name="period" value="custom" />
          <label className="text-xs font-medium text-zinc-600">
            Dari
            <input
              type="date"
              name="from"
              defaultValue={from}
              className="mt-1 block rounded-lg border border-zinc-200 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="text-xs font-medium text-zinc-600">
            Sampai
            <input
              type="date"
              name="to"
              defaultValue={to}
              className="mt-1 block rounded-lg border border-zinc-200 px-2 py-1.5 text-sm"
            />
          </label>
          <button
            type="submit"
            className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700"
          >
            Terapkan
          </button>
        </form>
      )}

      <div className="mt-6 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-brand-200 bg-brand-50 p-4">
          <p className="mb-1.5 text-[10.5px] font-semibold uppercase text-brand-700">Kas Masuk</p>
          <p className="text-xl font-bold text-brand-700">{formatRupiah(totalMasuk)}</p>
        </div>
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
          <p className="mb-1.5 text-[10.5px] font-semibold uppercase text-red-600">Kas Keluar</p>
          <p className="text-xl font-bold text-red-600">{formatRupiah(totalKeluar)}</p>
        </div>
      </div>

      {pendingPettyCashLines.length > 0 && (
        <a
          href={`/business/${businessId}/kas-kecil`}
          className="mt-3 block rounded-2xl border border-violet-200 bg-violet-50 p-4 transition-colors hover:bg-violet-100"
        >
          <p className="mb-1.5 text-[10.5px] font-semibold uppercase text-violet-700">
            Kas Kecil Menunggu Diperiksa
          </p>
          <p className="text-xl font-bold text-violet-700">{formatRupiah(totalPendingPettyCash)}</p>
          <p className="mt-1 text-[11px] text-violet-600">
            {pendingPettyCashLines.length} pengeluaran dari kasir belum diverifikasi admin — belum
            dihitung di Kas Masuk/Keluar atau Laba Rugi. Ketuk untuk buka halaman Kas Kecil →
          </p>
        </a>
      )}

      {voidLines.length > 0 && (
        <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="mb-1.5 text-[10.5px] font-semibold uppercase text-amber-700">
            Dibatalkan (Void)
          </p>
          <p className="text-xl font-bold text-amber-700">{formatRupiah(totalVoid)}</p>
          <p className="mt-1 text-[11px] text-amber-600">
            Nilai transaksi yang dibatalkan — sudah dikeluarkan dari Kas Masuk &amp; Kas Keluar di
            atas (supaya sinkron dengan Laporan). Rinciannya di &quot;Riwayat Void&quot; di bawah.
          </p>
        </div>
      )}

      {rejectedPettyCashLines.length > 0 && (
        <div className="mt-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
          <p className="mb-1.5 text-[10.5px] font-semibold uppercase text-zinc-500">
            Kas Kecil Ditolak
          </p>
          <p className="text-xl font-bold text-zinc-600">{formatRupiah(totalDitolak)}</p>
          <p className="mt-1 text-[11px] text-zinc-500">
            Pengeluaran yang ditolak admin — uangnya otomatis kembali, tidak ikut dihitung di Kas
            Masuk/Keluar di atas. Rinciannya di &quot;Riwayat Ditolak&quot; di bawah.
          </p>
        </div>
      )}

      <div className="mt-4 rounded-xl bg-white shadow-sm p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900">+ Catat Kas Masuk/Keluar</h2>
        <AddCashForm businessId={businessId} today={todayWibDateString()} accounts={cashFormAccounts} />
      </div>

      <div className="mt-4 overflow-hidden rounded-xl bg-white shadow-sm">
        <div className="border-b border-zinc-100 px-4 py-3">
          <h2 className="text-sm font-bold text-zinc-900">Riwayat Kas</h2>
          <p className="mt-0.5 text-[11px] text-zinc-400">
            Penjualan tidak dirinci di sini (tetap terhitung di kartu Kas Masuk) — cek detailnya di
            Riwayat Transaksi.
          </p>
        </div>
        {displayLines.length > 0 ? (
          <div className="divide-y divide-zinc-100">{displayLines.map(renderCashRow)}</div>
        ) : (
          <p className="py-10 text-center text-sm text-zinc-300">Belum ada transaksi kas di periode ini</p>
        )}
      </div>

      {voidLines.length > 0 && (
        <div className="mt-4 overflow-hidden rounded-xl bg-white shadow-sm">
          <div className="border-b border-amber-100 bg-amber-50/60 px-4 py-3">
            <h2 className="text-sm font-bold text-amber-800">Riwayat Void ({voidedSaleCount})</h2>
            <p className="mt-0.5 text-[11px] text-amber-600">
              Transaksi yang dibatalkan (penjualan asli + pembalikannya) — dikeluarkan dari Kas
              Masuk/Keluar di atas supaya sinkron dengan Laporan.
            </p>
          </div>
          <div className="divide-y divide-zinc-100">{voidLines.map(renderCashRow)}</div>
        </div>
      )}

      {rejectedPettyCashLines.length > 0 && (
        <div className="mt-4 overflow-hidden rounded-xl bg-white shadow-sm">
          <div className="border-b border-zinc-100 bg-zinc-50 px-4 py-3">
            <h2 className="text-sm font-bold text-zinc-700">Riwayat Ditolak</h2>
            <p className="mt-0.5 text-[11px] text-zinc-400">
              Pengeluaran kas kecil yang ditolak admin (pengajuan asli + pembalikannya) — dikeluarkan
              dari Kas Masuk/Keluar di atas karena tidak ada uang yang beneran keluar.
            </p>
          </div>
          <div className="divide-y divide-zinc-100">{rejectedPettyCashLines.map(renderCashRow)}</div>
        </div>
      )}
    </div>
  );
}
