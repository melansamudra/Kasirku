import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type Period = "30" | "90" | "all";

const PERIOD_LABELS: Record<Period, string> = {
  "30": "30 Hari",
  "90": "90 Hari",
  all: "Semua",
};

const SOURCE_LABELS: Record<string, string> = {
  awal: "Awal",
  pembelian: "Pembelian",
  manual: "Edit manual",
};

function formatRupiah(value: number) {
  const sign = value < 0 ? "-" : "";
  return `${sign}Rp${Math.round(Math.abs(value)).toLocaleString("id-ID")}`;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function parsePeriod(value: string | undefined): Period {
  return value === "30" || value === "90" ? value : "all";
}

type HistoryRow = { id: string; unit_cost: number; source: string; created_at: string };

export default async function PriceTrendPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const { businessId } = await params;
  const { period: periodParam } = await searchParams;
  const period = parsePeriod(periodParam);

  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("id, name")
    .eq("id", businessId)
    .single();

  if (!business) {
    notFound();
  }

  const { data: ingredients } = await supabase
    .from("ingredients")
    .select("id, name, unit, unit_cost")
    .eq("business_id", businessId)
    .is("deleted_at", null)
    .order("name", { ascending: true });

  let historyQuery = supabase
    .from("ingredient_price_history")
    .select("id, ingredient_id, unit_cost, source, created_at")
    .eq("business_id", businessId)
    .order("created_at", { ascending: true });

  if (period !== "all") {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - Number(period));
    historyQuery = historyQuery.gte("created_at", cutoff.toISOString());
  }

  const { data: history } = await historyQuery;

  const historyByIngredient = new Map<string, HistoryRow[]>();
  for (const h of history ?? []) {
    const list = historyByIngredient.get(h.ingredient_id) ?? [];
    list.push(h);
    historyByIngredient.set(h.ingredient_id, list);
  }

  const rows = (ingredients ?? []).map((ing) => {
    const list = historyByIngredient.get(ing.id) ?? [];
    const oldest = list[0];
    const current = Number(ing.unit_cost);
    const baseline = oldest ? Number(oldest.unit_cost) : current;
    const change = current - baseline;
    const pct = baseline > 0 ? Math.round((change / baseline) * 100) : null;
    return { ...ing, history: list, baseline, current, change, pct, hasChange: list.length > 0 };
  });

  const naikCount = rows.filter((r) => r.change > 0).length;
  const turunCount = rows.filter((r) => r.change < 0).length;

  return (
    <div className="w-full max-w-2xl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-zinc-900">Tren Harga Bahan Baku — {business.name}</h1>
          <p className="mt-0.5 text-xs text-zinc-500">
            Perubahan harga per satuan bahan baku, dari pembelian &amp; edit manual.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(["30", "90", "all"] as Period[]).map((p) => (
            <Link
              key={p}
              href={`/business/${businessId}/reports/price-trend?period=${p}`}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                p === period ? "bg-brand-600 text-white" : "bg-white text-zinc-600 hover:bg-zinc-100"
              }`}
            >
              {PERIOD_LABELS[p]}
            </Link>
          ))}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
          <p className="mb-1.5 text-[10.5px] font-semibold uppercase text-red-700">Naik Harga</p>
          <p className="text-xl font-bold text-red-700">{naikCount} bahan</p>
        </div>
        <div className="rounded-2xl border border-brand-200 bg-brand-50 p-4">
          <p className="mb-1.5 text-[10.5px] font-semibold uppercase text-brand-700">Turun Harga</p>
          <p className="text-xl font-bold text-brand-700">{turunCount} bahan</p>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
        <div className="border-b border-zinc-100 px-4 py-3.5">
          <h2 className="text-sm font-bold text-zinc-900">Semua Bahan Baku</h2>
        </div>
        {rows.length > 0 ? (
          <div className="divide-y divide-zinc-100">
            {rows.map((r) => (
              <details key={r.id} className="group px-4 py-3">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-zinc-900">{r.name}</p>
                    <p className="text-[11px] text-zinc-400">
                      {r.baseline !== r.current
                        ? `${formatRupiah(r.baseline)} → ${formatRupiah(r.current)} / ${r.unit}`
                        : `${formatRupiah(r.current)} / ${r.unit} · tidak ada perubahan`}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p
                      className={`text-sm font-bold ${
                        r.change > 0 ? "text-red-500" : r.change < 0 ? "text-brand-700" : "text-zinc-400"
                      }`}
                    >
                      {r.change === 0 ? "—" : `${r.change > 0 ? "+" : ""}${formatRupiah(r.change)}`}
                    </p>
                    <p className="text-[11px] text-zinc-400">
                      {r.pct === null || r.change === 0 ? "" : `${r.pct > 0 ? "+" : ""}${r.pct}%`}
                    </p>
                  </div>
                </summary>
                <div className="mt-2.5 space-y-1.5 border-t border-zinc-50 pt-2.5">
                  {r.history.length > 0 ? (
                    r.history
                      .slice()
                      .reverse()
                      .map((h) => (
                        <div key={h.id} className="flex items-center justify-between text-[11px]">
                          <span className="text-zinc-400">{formatDate(h.created_at)}</span>
                          <span className="text-zinc-600">
                            {SOURCE_LABELS[h.source] ?? h.source}
                          </span>
                          <span className="font-medium text-zinc-900">
                            {formatRupiah(Number(h.unit_cost))}
                          </span>
                        </div>
                      ))
                  ) : (
                    <p className="text-[11px] text-zinc-300">Belum ada histori di periode ini</p>
                  )}
                </div>
              </details>
            ))}
          </div>
        ) : (
          <p className="py-10 text-center text-sm text-zinc-300">Belum ada bahan baku</p>
        )}
      </div>

      <p className="mt-3 text-center text-[11px] text-zinc-400">
        Histori tercatat otomatis dari pembelian bahan (Keuangan → Catat Pengeluaran) dan dari edit
        harga manual di halaman Bahan Baku.
      </p>
    </div>
  );
}
