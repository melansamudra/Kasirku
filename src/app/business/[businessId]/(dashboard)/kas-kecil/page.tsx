import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PillBadge } from "@/components/ui/pill-badge";
import MovementCard from "./movement-card";
import AddExpenseQuickForm from "./add-expense-quick-form";

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
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("id, name")
    .eq("id", businessId)
    .single();

  if (!business) {
    notFound();
  }

  const [{ data: pendingRows }, { data: historyRows }, { data: accountRows }] = await Promise.all([
    supabase
      .from("shift_cash_movements")
      .select(
        "id, amount, category, description, receipt_url, status, account_code, origin, created_at, cashiers(name)",
      )
      .eq("business_id", businessId)
      .eq("direction", "out")
      .eq("status", "pending")
      .order("created_at", { ascending: true }),
    supabase
      .from("shift_cash_movements")
      .select(
        "id, amount, category, description, receipt_url, status, account_code, origin, created_at, cashiers(name)",
      )
      .eq("business_id", businessId)
      .eq("direction", "out")
      .neq("status", "pending")
      .order("reviewed_at", { ascending: false })
      .limit(30),
    supabase
      .from("accounts")
      .select("code, name")
      .eq("business_id", businessId)
      .neq("code", "1-050")
      .order("code"),
  ]);

  const pending = (pendingRows ?? []) as unknown as MovementRow[];
  const history = (historyRows ?? []) as unknown as MovementRow[];
  const accounts = accountRows ?? [];
  const totalPending = pending.reduce((s, m) => s + Number(m.amount), 0);

  return (
    <div className="w-full max-w-2xl">
      <h1 className="text-lg font-bold text-zinc-900">Kas Kecil — {business.name}</h1>
      <p className="mt-0.5 text-xs text-zinc-500">
        Pengeluaran petty cash dari kasir menunggu diperiksa di sini sebelum masuk Laporan Laba
        Rugi — pilih akun yang sesuai, lalu Setujui atau Tolak.
      </p>

      <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
        <p className="mb-1.5 text-[10.5px] font-semibold uppercase text-amber-700">
          Menunggu Diperiksa
        </p>
        <p className="text-xl font-bold text-amber-700">{formatRupiah(totalPending)}</p>
        <p className="mt-1 text-[11px] text-amber-600">{pending.length} pengeluaran belum diklasifikasi</p>
      </div>

      <div className="mt-4 rounded-xl bg-white shadow-sm p-5">
        <h2 className="mb-1 text-sm font-semibold text-zinc-900">+ Nota Supplier / Pengeluaran Langsung</h2>
        <p className="mb-3 text-xs text-zinc-500">
          Untuk nota yang datang langsung ke admin (bukan dari kasir) — tetap masuk antrian di
          bawah untuk ditandai akunnya.
        </p>
        <AddExpenseQuickForm businessId={businessId} />
      </div>

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
              }}
            />
          ))
        ) : (
          <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400">
            Tidak ada pengeluaran yang menunggu diperiksa.
          </p>
        )}
      </div>

      {history.length > 0 && (
        <div className="mt-4 overflow-hidden rounded-xl bg-white shadow-sm">
          <div className="border-b border-zinc-100 px-4 py-3">
            <h2 className="text-sm font-bold text-zinc-900">Riwayat Diperiksa</h2>
          </div>
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
        </div>
      )}
    </div>
  );
}
