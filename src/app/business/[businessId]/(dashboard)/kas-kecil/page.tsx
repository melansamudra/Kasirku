import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PillBadge } from "@/components/ui/pill-badge";
import { todayWibDateString } from "@/lib/wib";
import { getPeriodRange } from "../reports/period";
import MovementCard from "./movement-card";
import AddExpenseQuickForm from "./add-expense-quick-form";
import PettyCashAllocationForm from "./petty-cash-allocation-form";
import DebtNoteCard from "./debt-note-card";
import ClosePettyCashForm from "./close-petty-cash-form";
import PrintClosureButton from "./print-closure-button";

type DebtNoteRow = {
  id: string;
  supplier_id: string | null;
  supplier_name_manual: string | null;
  category: string;
  amount: number;
  note: string | null;
  receipt_url: string | null;
  status: "pending" | "verified";
  origin: "kasir" | "admin";
  created_at: string;
  suppliers: { name: string } | null;
  cashiers: { name: string } | null;
};

type MovementRow = {
  id: string;
  amount: number;
  category: string | null;
  description: string;
  receipt_url: string | null;
  status: "pending" | "posted" | "rejected";
  account_code: string | null;
  origin: "kasir" | "admin";
  created_at: string;
  cashiers: { name: string } | null;
  employees: { name: string } | null;
};

type TodayTunaiRow = {
  id: string;
  amount: number;
  category: string | null;
  description: string;
  status: "pending" | "posted" | "rejected";
  created_at: string;
  cashiers: { name: string } | null;
};

type TodayHutangRow = {
  id: string;
  amount: number;
  category: string;
  note: string | null;
  status: "pending" | "verified";
  created_at: string;
  suppliers: { name: string } | null;
  supplier_name_manual: string | null;
  cashiers: { name: string } | null;
};

const TUNAI_STATUS_LABEL: Record<TodayTunaiRow["status"], string> = {
  pending: "Menunggu",
  posted: "Disetujui",
  rejected: "Ditolak",
};
const TUNAI_STATUS_TONE: Record<TodayTunaiRow["status"], "amber" | "green" | "red"> = {
  pending: "amber",
  posted: "green",
  rejected: "red",
};

function formatRupiah(value: number) {
  return `Rp${Math.round(value).toLocaleString("id-ID")}`;
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function KasKecilPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const { businessId } = await params;
  const { date: historyDateParam } = await searchParams;
  const historyDate = /^\d{4}-\d{2}-\d{2}$/.test(historyDateParam ?? "") ? historyDateParam : undefined;
  const supabase = await createClient();

  const [{ data: business }, { data: userData }] = await Promise.all([
    supabase.from("businesses").select("id, name, owner_id").eq("id", businessId).single(),
    supabase.auth.getUser(),
  ]);

  if (!business) {
    notFound();
  }

  const isOwner = business.owner_id === userData.user?.id;
  let staffRole: "kasir" | "admin" = "kasir";
  if (!isOwner && userData.user) {
    const { data: staff } = await supabase
      .from("business_staff")
      .select("role")
      .eq("business_id", businessId)
      .eq("user_id", userData.user.id)
      .maybeSingle();
    staffRole = (staff?.role as "kasir" | "admin" | undefined) ?? "kasir";
  }
  // Owner atau staff ber-role "admin" boleh Setujui/Tolak/Verifikasi — staff
  // "kasir" cuma lihat ringkasan (tidak bisa ubah status apa pun dari sini).
  // Ini cuma gating tampilan; RLS (owns_business) tetap jadi batas akses
  // sesungguhnya di level database untuk siapa pun yang masih bisa masuk.
  const canVerify = isOwner || staffRole === "admin";

  const today = todayWibDateString();
  const { fromIso: todayFromIso } = getPeriodRange("today");

  const [
    { data: pendingRows },
    { data: historyRows },
    { data: accountRows },
    { data: employeeRows },
    { data: allocationRows },
    { data: todayNotaRows },
    { data: debtNotePendingRows },
    { data: debtNoteHistoryRows },
    { data: supplierRows },
    { data: todayHutangRows },
    { data: todayClosureRow },
    { data: closureHistoryRows },
  ] = await Promise.all([
    supabase
      .from("shift_cash_movements")
      .select(
        "id, amount, category, description, receipt_url, status, account_code, origin, created_at, cashiers(name), employees(name)",
      )
      .eq("business_id", businessId)
      .eq("direction", "out")
      .eq("status", "pending")
      .order("created_at", { ascending: true }),
    (() => {
      const q = supabase
        .from("shift_cash_movements")
        .select(
          "id, amount, category, description, receipt_url, status, account_code, origin, created_at, cashiers(name), employees(name)",
        )
        .eq("business_id", businessId)
        .eq("direction", "out")
        .neq("status", "pending");
      // Tanpa filter tanggal: default 30 terakhir (ringkasan cepat). Dengan
      // filter tanggal (dipilih lewat form di bawah "Riwayat Diperiksa"):
      // semua pengeluaran yang DIAJUKAN (created_at) di tanggal itu, tidak
      // dibatasi 30 -- biar bisa benar-benar dicek riwayat satu hari penuh.
      if (historyDate) {
        return q
          .gte("created_at", `${historyDate}T00:00:00+07:00`)
          .lt("created_at", `${historyDate}T23:59:59.999+07:00`)
          .order("created_at", { ascending: false });
      }
      return q.order("reviewed_at", { ascending: false }).limit(30);
    })(),
    // 1-050 (suspense kas kecil), 1-001 (Kas & Bank), 1-060 (Piutang
    // Karyawan) dikeluarkan dari pilihan reklasifikasi bebas — 1-060 khusus
    // dipakai otomatis untuk Kasbon (lihat review_shift_cash_movement),
    // bukan pilihan manual admin untuk kategori lain.
    supabase
      .from("accounts")
      .select("code, name")
      .eq("business_id", businessId)
      .neq("code", "1-050")
      .neq("code", "1-001")
      .neq("code", "1-060")
      .order("code"),
    supabase
      .from("employees")
      .select("id, name")
      .eq("business_id", businessId)
      .eq("active", true)
      .order("name"),
    supabase
      .from("petty_cash_allocations")
      .select("id, date, amount, note")
      .eq("business_id", businessId)
      .eq("date", today)
      .order("created_at", { ascending: false }),
    // "Rejected" berarti uangnya sudah dikembalikan ke kas — tidak lagi
    // mengurangi petty cash yang sedang dipegang kasir, jadi dikeluarkan
    // dari total nota hari ini. Kolom lengkap (bukan cuma amount) supaya
    // bisa dipakai juga sebagai daftar "Transaksi Hari Ini" versi kasir.
    supabase
      .from("shift_cash_movements")
      .select("id, amount, category, description, status, created_at, cashiers(name)")
      .eq("business_id", businessId)
      .eq("direction", "out")
      .neq("status", "rejected")
      .gte("created_at", todayFromIso ?? `${today}T00:00:00+07:00`)
      .order("created_at", { ascending: false }),
    supabase
      .from("supplier_debt_notes")
      .select(
        "id, supplier_id, supplier_name_manual, category, amount, note, receipt_url, status, origin, created_at, suppliers(name), cashiers(name)",
      )
      .eq("business_id", businessId)
      .eq("status", "pending")
      .order("created_at", { ascending: true }),
    supabase
      .from("supplier_debt_notes")
      .select(
        "id, supplier_id, supplier_name_manual, category, amount, note, receipt_url, status, origin, created_at, suppliers(name), cashiers(name)",
      )
      .eq("business_id", businessId)
      .eq("status", "verified")
      .order("verified_at", { ascending: false })
      .limit(20),
    supabase
      .from("suppliers")
      .select("id, name")
      .eq("business_id", businessId)
      .is("deleted_at", null)
      .order("name", { ascending: true }),
    supabase
      .from("supplier_debt_notes")
      .select(
        "id, amount, category, note, status, created_at, suppliers(name), supplier_name_manual, cashiers(name)",
      )
      .eq("business_id", businessId)
      .gte("created_at", todayFromIso ?? `${today}T00:00:00+07:00`)
      .order("created_at", { ascending: false }),
    supabase
      .from("petty_cash_closures")
      .select(
        "id, total_allocated, total_tunai, total_hutang, hutang_count, expected_remaining, actual_remaining, difference",
      )
      .eq("business_id", businessId)
      .eq("date", today)
      .maybeSingle(),
    supabase
      .from("petty_cash_closures")
      .select("id, date, total_tunai, total_hutang, expected_remaining, actual_remaining, difference, closed_at")
      .eq("business_id", businessId)
      .order("date", { ascending: false })
      .limit(20),
  ]);

  const pending = (pendingRows ?? []) as unknown as MovementRow[];
  const history = (historyRows ?? []) as unknown as MovementRow[];
  const accounts = accountRows ?? [];
  const employees = employeeRows ?? [];
  const totalPending = pending.reduce((s, m) => s + Number(m.amount), 0);
  const allocations = allocationRows ?? [];
  const totalAllocatedToday = allocations.reduce((s, a) => s + Number(a.amount), 0);
  const totalNotaToday = ((todayNotaRows ?? []) as unknown as { amount: number }[]).reduce(
    (s, m) => s + Number(m.amount),
    0,
  );
  const sisaPettyCashToday = totalAllocatedToday - totalNotaToday;
  const debtNotesPending = (debtNotePendingRows ?? []) as unknown as DebtNoteRow[];
  const debtNotesHistory = (debtNoteHistoryRows ?? []) as unknown as DebtNoteRow[];
  const suppliers = supplierRows ?? [];
  const todayTunaiList = (todayNotaRows ?? []) as unknown as TodayTunaiRow[];
  const todayHutangList = (todayHutangRows ?? []) as unknown as TodayHutangRow[];
  const totalHutangToday = todayHutangList.reduce((s, n) => s + Number(n.amount), 0);
  const todayClosure = todayClosureRow
    ? {
        id: todayClosureRow.id,
        totalAllocated: Number(todayClosureRow.total_allocated),
        totalTunai: Number(todayClosureRow.total_tunai),
        totalHutang: Number(todayClosureRow.total_hutang),
        hutangCount: todayClosureRow.hutang_count,
        expectedRemaining: Number(todayClosureRow.expected_remaining),
        actualRemaining: Number(todayClosureRow.actual_remaining),
        difference: Number(todayClosureRow.difference),
      }
    : null;
  const closureHistory = closureHistoryRows ?? [];

  return (
    <div className="w-full max-w-2xl">
      <h1 className="text-lg font-bold text-zinc-900">Kas Kecil — {business.name}</h1>
      <p className="mt-0.5 text-xs text-zinc-500">
        Semua nota (tunai maupun hutang) dicatat di sini, menunggu diperiksa sebelum masuk Laporan
        Laba Rugi (nota tunai) atau Pembelian & Hutang (nota hutang).
      </p>

      <div className="mt-4 rounded-xl bg-white shadow-sm p-5">
        <h2 className="mb-1 text-sm font-semibold text-zinc-900">+ Petty Cash Diberikan</h2>
        <p className="mb-3 text-xs text-zinc-500">
          Catatan saja (tidak masuk jurnal) — jumlah petty cash yang diterima kasir hari ini,
          dipakai buat mengecek nota yang masuk cocok atau tidak dengan uang yang dikembalikan.
        </p>
        <PettyCashAllocationForm businessId={businessId} today={today} />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2.5">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3.5">
          <p className="mb-1 text-[10px] font-semibold uppercase text-emerald-700">Diberikan Hari Ini</p>
          <p className="text-base font-bold text-emerald-700">{formatRupiah(totalAllocatedToday)}</p>
        </div>
        <div className="rounded-2xl border border-red-200 bg-red-50 p-3.5">
          <p className="mb-1 text-[10px] font-semibold uppercase text-red-600">Total Nota Hari Ini</p>
          <p className="text-base font-bold text-red-600">{formatRupiah(totalNotaToday)}</p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3.5">
          <p className="mb-1 text-[10px] font-semibold uppercase text-zinc-500">Sisa Seharusnya</p>
          <p className={`text-base font-bold ${sisaPettyCashToday < 0 ? "text-red-600" : "text-zinc-700"}`}>
            {formatRupiah(sisaPettyCashToday)}
          </p>
        </div>
      </div>
      {allocations.length > 0 && (
        <div className="mt-2 space-y-1">
          {allocations.map((a) => (
            <p key={a.id} className="text-[11px] text-zinc-400">
              + {formatRupiah(Number(a.amount))}{a.note ? ` — ${a.note}` : ""}
            </p>
          ))}
        </div>
      )}

      <div className="mt-4">
        <ClosePettyCashForm businessId={businessId} date={today} existingClosure={todayClosure} />
      </div>

      {canVerify && (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="mb-1.5 text-[10.5px] font-semibold uppercase text-amber-700">
            Menunggu Diperiksa
          </p>
          <p className="text-xl font-bold text-amber-700">{formatRupiah(totalPending)}</p>
          <p className="mt-1 text-[11px] text-amber-600">{pending.length} pengeluaran belum diklasifikasi</p>
        </div>
      )}

      <div className="mt-4 rounded-xl bg-white shadow-sm p-5">
        <h2 className="mb-1 text-sm font-semibold text-zinc-900">+ Catat Nota</h2>
        <p className="mb-3 text-xs text-zinc-500">
          Pilih Tunai kalau uangnya sudah keluar dari petty cash, atau Hutang kalau nota supplier
          belum dibayar.
        </p>
        <AddExpenseQuickForm businessId={businessId} suppliers={suppliers} employees={employees} />
      </div>

      {canVerify && (
      <>
      <div className="mt-4 space-y-2">
        {pending.length > 0 ? (
          pending.map((m) => (
            <MovementCard
              key={m.id}
              businessId={businessId}
              accounts={accounts}
              movement={{
                id: m.id,
                amount: Number(m.amount),
                category: m.category,
                description: m.description,
                receiptUrl: m.receipt_url,
                createdAt: m.created_at,
                origin: m.origin,
                cashierName: m.cashiers?.name ?? null,
                employeeName: m.employees?.name ?? null,
              }}
            />
          ))
        ) : (
          <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400">
            Tidak ada pengeluaran yang menunggu diperiksa.
          </p>
        )}
      </div>

      <div className="mt-4 overflow-hidden rounded-xl bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 px-4 py-3">
          <div>
            <h2 className="text-sm font-bold text-zinc-900">Riwayat Diperiksa</h2>
            <p className="mt-0.5 text-[11px] text-zinc-400">
              {historyDate
                ? `Tanggal ${new Date(`${historyDate}T00:00:00Z`).toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" })}`
                : "30 terakhir — pilih tanggal untuk lihat riwayat lengkap satu hari"}
            </p>
          </div>
          <form method="get" className="flex items-center gap-1.5">
            <input
              type="date"
              name="date"
              defaultValue={historyDate ?? ""}
              className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs"
            />
            <button
              type="submit"
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
            >
              Cek
            </button>
            {historyDate && (
              <a
                href={`/business/${businessId}/kas-kecil`}
                className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-500 hover:bg-zinc-50"
              >
                Reset
              </a>
            )}
          </form>
        </div>
        {history.length > 0 ? (
          <div className="divide-y divide-zinc-100">
            {history.map((m) => (
              <div key={m.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-zinc-900">{m.description}</p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] text-zinc-400">{formatDateTime(m.created_at)}</span>
                    <span className="text-[11px] text-zinc-400">
                      {m.origin === "admin" ? "Input Admin" : m.cashiers?.name ?? "Kasir"}
                    </span>
                    {m.account_code && (
                      <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600">
                        {m.account_code}
                      </span>
                    )}
                    <PillBadge tone={m.status === "posted" ? "green" : "red"}>
                      {m.status === "posted" ? "Disetujui" : "Ditolak"}
                    </PillBadge>
                  </div>
                </div>
                <p className="shrink-0 text-sm font-bold text-red-600">-{formatRupiah(Number(m.amount))}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="py-10 text-center text-xs text-zinc-300">
            {historyDate ? "Tidak ada riwayat kas kecil di tanggal ini." : "Belum ada riwayat diperiksa."}
          </p>
        )}
      </div>

      <div className="mt-6 border-t border-zinc-200 pt-4">
        <h2 className="text-sm font-bold text-zinc-900">📄 Nota Hutang</h2>
        <p className="mt-0.5 text-xs text-zinc-500">
          Nota supplier yang datang secara hutang — verifikasi lalu alihkan ke Pembelian & Hutang
          untuk dicatat resmi (update stok, jatuh tempo, Utang Dagang).
        </p>

        <div className="mt-3 space-y-2">
          {debtNotesPending.length > 0 ? (
            debtNotesPending.map((n) => (
              <DebtNoteCard
                key={n.id}
                businessId={businessId}
                note={{
                  id: n.id,
                  supplierName: n.suppliers?.name ?? n.supplier_name_manual,
                  category: n.category,
                  amount: Number(n.amount),
                  note: n.note,
                  receiptUrl: n.receipt_url,
                  createdAt: n.created_at,
                  origin: n.origin,
                  cashierName: n.cashiers?.name ?? null,
                  supplierId: n.supplier_id,
                }}
              />
            ))
          ) : (
            <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400">
              Tidak ada nota hutang yang menunggu verifikasi.
            </p>
          )}
        </div>

        {debtNotesHistory.length > 0 && (
          <div className="mt-4 overflow-hidden rounded-xl bg-white shadow-sm">
            <div className="border-b border-zinc-100 px-4 py-3">
              <h2 className="text-sm font-bold text-zinc-900">Sudah Diverifikasi</h2>
            </div>
            <div className="divide-y divide-zinc-100">
              {debtNotesHistory.map((n) => (
                <div key={n.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-zinc-900">
                      {n.suppliers?.name ?? n.supplier_name_manual}
                    </p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] text-zinc-400">{formatDateTime(n.created_at)}</span>
                      <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600">
                        {n.category}
                      </span>
                      <PillBadge tone="green">Diverifikasi</PillBadge>
                    </div>
                  </div>
                  <p className="shrink-0 text-sm font-bold text-red-600">{formatRupiah(Number(n.amount))}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      </>
      )}

      {!canVerify && (
        <div className="mt-6 border-t border-zinc-200 pt-4">
          <h2 className="text-sm font-bold text-zinc-900">📋 Transaksi Hari Ini</h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            Ringkasan saja — untuk Setujui/Tolak/Verifikasi, minta admin/pemilik toko buka halaman
            ini.
          </p>

          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <div className="rounded-2xl border border-red-200 bg-red-50 p-3.5">
              <p className="mb-1 text-[10px] font-semibold uppercase text-red-600">Nota Tunai Hari Ini</p>
              <p className="text-base font-bold text-red-600">{formatRupiah(totalNotaToday)}</p>
              <p className="mt-0.5 text-[10.5px] text-red-500">{todayTunaiList.length} transaksi</p>
            </div>
            <div className="rounded-2xl border border-violet-200 bg-violet-50 p-3.5">
              <p className="mb-1 text-[10px] font-semibold uppercase text-violet-700">Nota Hutang Hari Ini</p>
              <p className="text-base font-bold text-violet-700">{formatRupiah(totalHutangToday)}</p>
              <p className="mt-0.5 text-[10.5px] text-violet-600">{todayHutangList.length} transaksi</p>
            </div>
          </div>

          <div className="mt-4 overflow-hidden rounded-xl bg-white shadow-sm">
            <div className="border-b border-zinc-100 px-4 py-3">
              <h3 className="text-sm font-bold text-zinc-900">Nota Tunai</h3>
            </div>
            {todayTunaiList.length > 0 ? (
              <div className="divide-y divide-zinc-100">
                {todayTunaiList.map((m) => (
                  <div key={m.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-zinc-900">{m.description}</p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] text-zinc-400">{formatDateTime(m.created_at)}</span>
                        {m.category && (
                          <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600">
                            {m.category}
                          </span>
                        )}
                        <PillBadge tone={TUNAI_STATUS_TONE[m.status]}>{TUNAI_STATUS_LABEL[m.status]}</PillBadge>
                      </div>
                    </div>
                    <p className="shrink-0 text-sm font-bold text-red-600">-{formatRupiah(Number(m.amount))}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-8 text-center text-xs text-zinc-300">Belum ada nota tunai hari ini</p>
            )}
          </div>

          <div className="mt-4 overflow-hidden rounded-xl bg-white shadow-sm">
            <div className="border-b border-zinc-100 px-4 py-3">
              <h3 className="text-sm font-bold text-zinc-900">Nota Hutang</h3>
            </div>
            {todayHutangList.length > 0 ? (
              <div className="divide-y divide-zinc-100">
                {todayHutangList.map((n) => (
                  <div key={n.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-zinc-900">
                        {n.suppliers?.name ?? n.supplier_name_manual}
                      </p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] text-zinc-400">{formatDateTime(n.created_at)}</span>
                        <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600">
                          {n.category}
                        </span>
                        <PillBadge tone={n.status === "verified" ? "green" : "amber"}>
                          {n.status === "verified" ? "Diverifikasi" : "Menunggu"}
                        </PillBadge>
                      </div>
                    </div>
                    <p className="shrink-0 text-sm font-bold text-red-600">{formatRupiah(Number(n.amount))}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-8 text-center text-xs text-zinc-300">Belum ada nota hutang hari ini</p>
            )}
          </div>
        </div>
      )}

      {closureHistory.length > 0 && (
        <div className="mt-6 border-t border-zinc-200 pt-4">
          <h2 className="text-sm font-bold text-zinc-900">🔒 Riwayat Penutupan Petty Cash</h2>
          <div className="mt-3 overflow-hidden rounded-xl bg-white shadow-sm">
            <div className="divide-y divide-zinc-100">
              {closureHistory.map((c) => (
                <div key={c.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-zinc-900">
                      {new Date(`${c.date}T00:00:00+07:00`).toLocaleDateString("id-ID", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-400">
                      <span>Tunai {formatRupiah(Number(c.total_tunai))}</span>
                      {Number(c.total_hutang) > 0 && <span>· Hutang {formatRupiah(Number(c.total_hutang))}</span>}
                      <span
                        className={`font-medium ${
                          Number(c.difference) === 0
                            ? "text-zinc-500"
                            : Number(c.difference) > 0
                              ? "text-brand-700"
                              : "text-red-600"
                        }`}
                      >
                        Selisih {Number(c.difference) === 0 ? "Pas" : formatRupiah(Number(c.difference))}
                      </span>
                    </div>
                  </div>
                  <PrintClosureButton businessId={businessId} closureId={c.id} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
