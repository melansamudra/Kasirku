import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { addFixedAsset, postMonthlyDepreciation } from "./actions";
import AddAssetForm from "./add-asset-form";
import PostDepreciationButton from "./post-depreciation-button";

function formatRupiah(value: number) {
  return `Rp${Math.round(value).toLocaleString("id-ID")}`;
}

function formatDate(dateStr: string) {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function todayStr() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
}

type AssetRow = {
  id: string;
  name: string;
  purchase_date: string;
  cost: number;
  useful_life_months: number;
  salvage_value: number;
  accumulated_depreciation: number;
  disposed_at: string | null;
};

export default async function AssetsPage({
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

  const today = todayStr();
  const currentPeriod = `${today.slice(0, 7)}-01`;

  const [{ data: assets }, { data: postings }, { data: alreadyPosted }] = await Promise.all([
    supabase
      .from("fixed_assets")
      .select(
        "id, name, purchase_date, cost, useful_life_months, salvage_value, accumulated_depreciation, disposed_at",
      )
      .eq("business_id", businessId)
      .order("purchase_date", { ascending: false }),
    supabase
      .from("depreciation_postings")
      .select("id, period, total_amount, created_at")
      .eq("business_id", businessId)
      .order("period", { ascending: false })
      .limit(24),
    supabase
      .from("depreciation_postings")
      .select("id")
      .eq("business_id", businessId)
      .eq("period", currentPeriod)
      .maybeSingle(),
  ]);

  const rows = (assets ?? []) as AssetRow[];
  const activeRows = rows.filter((r) => !r.disposed_at);

  const totalCost = activeRows.reduce((s, r) => s + Number(r.cost), 0);
  const totalAccumulated = activeRows.reduce((s, r) => s + Number(r.accumulated_depreciation), 0);
  const totalBookValue = totalCost - totalAccumulated;

  const estimatedAmount = alreadyPosted
    ? 0
    : Math.round(
        activeRows.reduce((s, r) => {
          const depreciable = Number(r.cost) - Number(r.salvage_value);
          const monthly = depreciable / r.useful_life_months;
          const remaining = depreciable - Number(r.accumulated_depreciation);
          if (remaining <= 0) return s;
          return s + Math.min(monthly, remaining);
        }, 0),
      );

  const boundAddAsset = addFixedAsset.bind(null, businessId);
  const boundPostDepreciation = postMonthlyDepreciation.bind(null, businessId);

  return (
    <div className="w-full max-w-2xl">
      <h1 className="text-lg font-bold text-zinc-900">Aset Tetap — {business.name}</h1>
      <p className="mt-0.5 text-xs text-zinc-500">
        Peralatan/inventaris yang dikapitalisasi dan disusutkan bertahap, bukan langsung jadi beban
        penuh saat dibeli.
      </p>

      <div className="mt-6 grid grid-cols-3 gap-2.5">
        <div className="rounded-xl bg-white shadow-sm p-3.5">
          <p className="mb-1 text-[10px] font-semibold uppercase text-zinc-400">Nilai Perolehan</p>
          <p className="text-base font-bold text-zinc-900">{formatRupiah(totalCost)}</p>
        </div>
        <div className="rounded-xl bg-white shadow-sm p-3.5">
          <p className="mb-1 text-[10px] font-semibold uppercase text-zinc-400">Akum. Penyusutan</p>
          <p className="text-base font-bold text-amber-600">{formatRupiah(totalAccumulated)}</p>
        </div>
        <div className="rounded-2xl border border-brand-200 bg-brand-50 p-3.5">
          <p className="mb-1 text-[10px] font-semibold uppercase text-brand-700">Nilai Buku</p>
          <p className="text-base font-bold text-brand-700">{formatRupiah(totalBookValue)}</p>
        </div>
      </div>

      <div className="mt-4 rounded-xl bg-white shadow-sm p-5">
        <h2 className="mb-4 text-sm font-semibold text-zinc-900">+ Catat Aset Tetap</h2>
        <AddAssetForm action={boundAddAsset} today={today} />
      </div>

      <div className="mt-4 rounded-xl bg-white shadow-sm p-5">
        <h2 className="mb-1 text-sm font-semibold text-zinc-900">Penyusutan Bulanan</h2>
        <p className="mb-4 text-[11px] text-zinc-400">
          Metode garis lurus: (harga beli − nilai residu) ÷ umur ekonomis, dihitung otomatis dari
          semua aset aktif.
        </p>
        <PostDepreciationButton
          action={boundPostDepreciation}
          period={currentPeriod}
          estimatedAmount={estimatedAmount}
        />
      </div>

      <div className="mt-4 overflow-hidden rounded-xl bg-white shadow-sm">
        <div className="border-b border-zinc-100 px-4 py-3.5">
          <h2 className="text-sm font-bold text-zinc-900">Daftar Aset</h2>
        </div>
        {rows.length > 0 ? (
          <div className="divide-y divide-zinc-100">
            {rows.map((r) => {
              const bookValue = Number(r.cost) - Number(r.accumulated_depreciation);
              const fullyDepreciated =
                Number(r.accumulated_depreciation) >= Number(r.cost) - Number(r.salvage_value);
              return (
                <div key={r.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold text-zinc-900">{r.name}</p>
                      <p className="text-[11px] text-zinc-400">
                        Beli {formatDate(r.purchase_date)} · {r.useful_life_months} bulan
                        {r.disposed_at && " · Dihapuskan"}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-bold text-zinc-900">{formatRupiah(bookValue)}</p>
                      <p className="text-[11px] font-medium text-zinc-400">
                        dari {formatRupiah(Number(r.cost))}
                        {fullyDepreciated && !r.disposed_at && " · Lunas susut"}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="py-10 text-center text-sm text-zinc-300">Belum ada aset tetap tercatat</p>
        )}
      </div>

      <div className="mt-4 overflow-hidden rounded-xl bg-white shadow-sm">
        <div className="border-b border-zinc-100 px-4 py-3.5">
          <h2 className="text-sm font-bold text-zinc-900">Riwayat Penyusutan</h2>
        </div>
        {postings && postings.length > 0 ? (
          <div className="divide-y divide-zinc-100">
            {postings.map((p) => (
              <div key={p.id} className="flex items-center justify-between px-4 py-3">
                <p className="text-[13px] font-medium text-zinc-700">{p.period.slice(0, 7)}</p>
                <p className="text-sm font-bold text-amber-600">
                  {formatRupiah(Number(p.total_amount))}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="py-10 text-center text-sm text-zinc-300">Belum ada penyusutan diposting</p>
        )}
      </div>

      <p className="mt-3 text-center text-[11px] text-zinc-400">
        Beli aset otomatis ter-posting ke jurnal (debit Peralatan, kredit Kas &amp; Bank). Penyusutan
        bulanan diposting manual lewat tombol di atas (debit Beban Penyusutan, kredit Akumulasi
        Penyusutan).
      </p>
    </div>
  );
}
