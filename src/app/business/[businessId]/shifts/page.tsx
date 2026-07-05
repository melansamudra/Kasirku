import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function formatRupiah(value: number) {
  return `Rp${Math.round(value).toLocaleString("id-ID")}`;
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type ShiftRow = {
  id: string;
  opened_at: string;
  closed_at: string;
  opening_cash: number;
  closing_cash: number;
  cash_sales: number;
  non_cash_sales: number;
  total_sales: number;
  expected_cash: number;
  difference: number;
  tx_count: number;
  void_count: number;
  close_notes: string | null;
  cashiers: { name: string } | null;
};

export default async function ShiftsPage({
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

  const { data: shiftRows } = await supabase
    .from("shifts")
    .select(
      "id, opened_at, closed_at, opening_cash, closing_cash, cash_sales, non_cash_sales, total_sales, expected_cash, difference, tx_count, void_count, close_notes, cashiers(name)",
    )
    .eq("business_id", businessId)
    .not("closed_at", "is", null)
    .order("closed_at", { ascending: false })
    .limit(50);

  const shifts = (shiftRows ?? []) as unknown as ShiftRow[];

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-4 py-10">
      <div className="w-full max-w-sm">
        <Link href="/dashboard" className="text-xs font-medium text-zinc-500 hover:underline">
          ← Kembali ke dashboard
        </Link>

        <h1 className="mt-3 text-lg font-bold text-zinc-900">
          Riwayat Shift — {business.name}
        </h1>
        <p className="mt-1 text-sm text-zinc-500">50 shift terakhir yang sudah ditutup.</p>

        <div className="mt-6 space-y-2">
          {shifts.length > 0 ? (
            shifts.map((s) => {
              const diff = Number(s.difference);
              return (
                <div
                  key={s.id}
                  className="rounded-xl border border-zinc-200 bg-white px-4 py-3"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-zinc-900">
                      {s.cashiers?.name ?? "Kasir terhapus"}
                    </p>
                    <p className="text-sm font-semibold text-zinc-900">
                      {formatRupiah(Number(s.total_sales))}
                    </p>
                  </div>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {formatDateTime(s.opened_at)} – {formatDateTime(s.closed_at)}
                  </p>

                  <div className="mt-2 grid grid-cols-3 gap-2 rounded-lg bg-zinc-50 px-3 py-2 text-center">
                    <div>
                      <p className="text-[10px] text-zinc-400">Transaksi</p>
                      <p className="text-xs font-semibold text-zinc-900">{s.tx_count}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-zinc-400">Kas Diharapkan</p>
                      <p className="text-xs font-semibold text-zinc-900">
                        {formatRupiah(Number(s.expected_cash))}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-zinc-400">Selisih</p>
                      <p
                        className={`text-xs font-semibold ${
                          diff === 0
                            ? "text-zinc-900"
                            : diff > 0
                              ? "text-brand-700"
                              : "text-red-600"
                        }`}
                      >
                        {diff === 0 ? "Pas" : `${diff > 0 ? "+" : ""}${formatRupiah(diff)}`}
                      </p>
                    </div>
                  </div>

                  {s.void_count > 0 && (
                    <p className="mt-1.5 text-[11px] text-red-500">
                      {s.void_count} transaksi dibatalkan
                    </p>
                  )}
                  {s.close_notes && (
                    <p className="mt-1.5 text-[11px] text-zinc-400">Catatan: {s.close_notes}</p>
                  )}
                </div>
              );
            })
          ) : (
            <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400">
              Belum ada shift yang ditutup.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
