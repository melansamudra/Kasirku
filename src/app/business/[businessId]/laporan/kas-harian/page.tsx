import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

const SOURCE_LABELS: Record<string, string> = {
  manual: "Manual",
  penjualan: "Penjualan",
  void: "Void",
  pembelian: "Pembelian",
  beban: "Beban",
  payroll: "Payroll",
  shift: "Shift",
};

const SOURCE_BADGE: Record<string, string> = {
  manual: "bg-zinc-100 text-zinc-600",
  penjualan: "bg-brand-50 text-brand-700",
  void: "bg-red-50 text-red-600",
  pembelian: "bg-amber-50 text-amber-700",
  beban: "bg-amber-50 text-amber-700",
  payroll: "bg-sky-50 text-sky-700",
  shift: "bg-violet-50 text-violet-700",
};

function formatRupiah(v: number) {
  return `Rp${Math.round(v).toLocaleString("id-ID")}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default async function MirrorKasHarianPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const service = createServiceClient();

  const { data: mirrorAccount } = await service
    .from("mirror_accounts")
    .select("id, permissions")
    .eq("business_id", businessId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!mirrorAccount) notFound();

  const p = (mirrorAccount.permissions ?? {}) as {
    show_kas_harian?: boolean;
    show_amount?: boolean;
  };

  if (!p.show_kas_harian) notFound();

  const { data: rows } = await service
    .from("mirror_visible_kas")
    .select(
      "journal_line_id, journal_lines!mirror_visible_kas_journal_line_id_fkey(id, debit, credit, journal_entries!inner(id, date, description, source))",
    )
    .eq("business_id", businessId);

  type KasRow = {
    id: string;
    date: string;
    description: string;
    source: string;
    masuk: number;
    keluar: number;
  };

  const kasEntries: KasRow[] = (rows ?? [])
    .map((row) => {
      const line = row.journal_lines as unknown as {
        id: string;
        debit: number;
        credit: number;
        journal_entries: { id: string; date: string; description: string; source: string } | null;
      } | null;
      if (!line?.journal_entries) return null;
      return {
        id: line.id,
        date: line.journal_entries.date,
        description: line.journal_entries.description,
        source: line.journal_entries.source,
        masuk: Number(line.debit),
        keluar: Number(line.credit),
      };
    })
    .filter(Boolean) as KasRow[];

  kasEntries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const totalMasuk = kasEntries.reduce((s, k) => s + k.masuk, 0);
  const totalKeluar = kasEntries.reduce((s, k) => s + k.keluar, 0);

  return (
    <div className="w-full max-w-2xl">
      <h1 className="text-lg font-bold text-zinc-900">Kas Harian ({kasEntries.length})</h1>
      <p className="mt-1 text-sm text-zinc-500">Pergerakan kas yang dibagikan oleh pemilik toko</p>

      {p.show_amount && (
        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-brand-200 bg-brand-50 p-4">
            <p className="mb-1 text-[10.5px] font-semibold uppercase text-brand-700">Kas Masuk</p>
            <p className="text-xl font-bold text-brand-700">{formatRupiah(totalMasuk)}</p>
          </div>
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
            <p className="mb-1 text-[10.5px] font-semibold uppercase text-red-600">Kas Keluar</p>
            <p className="text-xl font-bold text-red-600">{formatRupiah(totalKeluar)}</p>
          </div>
        </div>
      )}

      {kasEntries.length === 0 ? (
        <div className="mt-6 rounded-xl border border-zinc-200 bg-white px-5 py-8 text-center text-sm text-zinc-400">
          Belum ada data kas yang dibagikan.
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <div className="divide-y divide-zinc-100">
            {kasEntries.map((k) => {
              const isMasuk = k.masuk > 0;
              return (
                <div key={k.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-zinc-900">{k.description}</p>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <span className="text-[11px] text-zinc-400">{formatDate(k.date)}</span>
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                          SOURCE_BADGE[k.source] ?? "bg-zinc-100 text-zinc-600"
                        }`}
                      >
                        {SOURCE_LABELS[k.source] ?? k.source}
                      </span>
                    </div>
                  </div>
                  {p.show_amount && (
                    <p
                      className={`shrink-0 text-sm font-bold ${
                        isMasuk ? "text-brand-700" : "text-red-600"
                      }`}
                    >
                      {isMasuk ? "+" : "-"}
                      {formatRupiah(isMasuk ? k.masuk : k.keluar)}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
