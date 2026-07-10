import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const TYPE_LABELS: Record<string, string> = {
  aset: "Aset",
  kewajiban: "Kewajiban",
  modal: "Modal",
};

function formatRupiah(value: number) {
  const sign = value < 0 ? "-" : "";
  return `${sign}Rp${Math.round(Math.abs(value)).toLocaleString("id-ID")}`;
}

export default async function NeracaPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const { businessId } = await params;
  const { date } = await searchParams;
  const asOfDate = /^\d{4}-\d{2}-\d{2}$/.test(date ?? "") ? (date as string) : new Date().toISOString().slice(0, 10);
  const asOfIso = `${asOfDate}T23:59:59+07:00`;

  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("id, name")
    .eq("id", businessId)
    .single();

  if (!business) {
    notFound();
  }

  const { data: accounts } = await supabase
    .from("accounts")
    .select("id, code, name, type, normal_balance")
    .eq("business_id", businessId)
    .order("code", { ascending: true });

  const { data: entries } = await supabase
    .from("journal_entries")
    .select("journal_lines(debit, credit, account_id)")
    .eq("business_id", businessId)
    .lte("date", asOfIso);

  const balanceByAccount = new Map<string, number>();
  for (const entry of entries ?? []) {
    const lines = entry.journal_lines as unknown as {
      debit: number;
      credit: number;
      account_id: string;
    }[];
    for (const l of lines) {
      const cur = balanceByAccount.get(l.account_id) ?? 0;
      balanceByAccount.set(l.account_id, cur + Number(l.debit) - Number(l.credit));
    }
  }

  function balanceOf(a: { id: string; normal_balance: string }) {
    const raw = balanceByAccount.get(a.id) ?? 0;
    return a.normal_balance === "debit" ? raw : -raw;
  }

  const asetRows = (accounts ?? []).filter((a) => a.type === "aset").map((a) => ({ ...a, balance: balanceOf(a) }));
  const kewajibanRows = (accounts ?? []).filter((a) => a.type === "kewajiban").map((a) => ({ ...a, balance: balanceOf(a) }));
  const modalRows = (accounts ?? []).filter((a) => a.type === "modal").map((a) => ({ ...a, balance: balanceOf(a) }));
  const pendapatanRows = (accounts ?? []).filter((a) => a.type === "pendapatan").map((a) => ({ ...a, balance: balanceOf(a) }));
  const bebanRows = (accounts ?? []).filter((a) => a.type === "beban").map((a) => ({ ...a, balance: balanceOf(a) }));

  const totalAset = asetRows.reduce((s, a) => s + a.balance, 0);
  const totalKewajiban = kewajibanRows.reduce((s, a) => s + a.balance, 0);
  const totalModalRecorded = modalRows.reduce((s, a) => s + a.balance, 0);
  const totalPendapatan = pendapatanRows.reduce((s, a) => s + a.balance, 0);
  const totalBeban = bebanRows.reduce((s, a) => s + a.balance, 0);
  const labaBerjalan = totalPendapatan - totalBeban;
  const totalModal = totalModalRecorded + labaBerjalan;
  const selisih = totalAset - (totalKewajiban + totalModal);

  return (
    <div className="w-full max-w-2xl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-zinc-900">Neraca — {business.name}</h1>
          <p className="mt-0.5 text-xs text-zinc-500">Per tanggal {asOfDate}</p>
        </div>
        <form method="get" className="flex items-center gap-2">
          <input
            type="date"
            name="date"
            defaultValue={asOfDate}
            className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs"
          />
          <button
            type="submit"
            className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
          >
            Tampilkan
          </button>
        </form>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
          <div className="border-b border-zinc-100 px-4 py-3">
            <h2 className="text-sm font-bold text-zinc-900">{TYPE_LABELS.aset}</h2>
          </div>
          <div className="divide-y divide-zinc-50 px-4">
            {asetRows.map((a) => (
              <div key={a.id} className="flex items-center justify-between py-2 text-xs">
                <span className="text-zinc-600">{a.name}</span>
                <span className="font-medium text-zinc-800">{formatRupiah(a.balance)}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between border-t border-zinc-100 px-4 py-3 text-sm font-bold text-zinc-900">
            <span>Total Aset</span>
            <span>{formatRupiah(totalAset)}</span>
          </div>
        </div>

        <div className="space-y-4">
          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
            <div className="border-b border-zinc-100 px-4 py-3">
              <h2 className="text-sm font-bold text-zinc-900">{TYPE_LABELS.kewajiban}</h2>
            </div>
            <div className="divide-y divide-zinc-50 px-4">
              {kewajibanRows.map((a) => (
                <div key={a.id} className="flex items-center justify-between py-2 text-xs">
                  <span className="text-zinc-600">{a.name}</span>
                  <span className="font-medium text-zinc-800">{formatRupiah(a.balance)}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between border-t border-zinc-100 px-4 py-3 text-sm font-bold text-zinc-900">
              <span>Total Kewajiban</span>
              <span>{formatRupiah(totalKewajiban)}</span>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
            <div className="border-b border-zinc-100 px-4 py-3">
              <h2 className="text-sm font-bold text-zinc-900">{TYPE_LABELS.modal}</h2>
            </div>
            <div className="divide-y divide-zinc-50 px-4">
              {modalRows.map((a) => (
                <div key={a.id} className="flex items-center justify-between py-2 text-xs">
                  <span className="text-zinc-600">{a.name}</span>
                  <span className="font-medium text-zinc-800">{formatRupiah(a.balance)}</span>
                </div>
              ))}
              <div className="flex items-center justify-between py-2 text-xs">
                <span className="text-zinc-600">Laba Berjalan (belum ditutup)</span>
                <span className="font-medium text-zinc-800">{formatRupiah(labaBerjalan)}</span>
              </div>
            </div>
            <div className="flex items-center justify-between border-t border-zinc-100 px-4 py-3 text-sm font-bold text-zinc-900">
              <span>Total Modal</span>
              <span>{formatRupiah(totalModal)}</span>
            </div>
          </div>
        </div>
      </div>

      <div
        className={`mt-4 rounded-2xl border p-4 text-center text-sm font-semibold ${
          Math.abs(selisih) < 1
            ? "border-brand-200 bg-brand-50 text-brand-700"
            : "border-red-200 bg-red-50 text-red-600"
        }`}
      >
        {Math.abs(selisih) < 1
          ? "✓ Aset = Kewajiban + Modal (seimbang)"
          : `⚠ Selisih ${formatRupiah(selisih)} — periksa jurnal manual yang mungkin belum seimbang`}
      </div>

      <p className="mt-3 text-center text-[11px] text-zinc-400">
        "Laba Berjalan" adalah pendapatan dikurangi beban sejak tutup buku terakhir (atau sejak
        awal pencatatan kalau belum pernah tutup buku) sampai tanggal ini. Kunci periode yang
        sudah selesai lewat{" "}
        <Link href={`/business/${businessId}/accounting/tutup-buku`} className="text-brand-600 hover:underline">
          Tutup Buku
        </Link>
        .
      </p>
    </div>
  );
}
