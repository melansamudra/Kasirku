import Link from "next/link";

type TransferItem = { id: string; itemName: string; unit: string; qtyRequested: number; qtySent: number | null };

const STATUS_LABEL: Record<string, string> = { baru: "Menunggu Dikirim", dikirim: "Sudah Dikirim" };
const STATUS_STYLE: Record<string, string> = {
  baru: "border-amber-500 bg-amber-50 text-amber-700",
  dikirim: "border-brand-600 bg-brand-50 text-brand-700",
};

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Read-only -- prosesnya (Kirim) tetap lewat halaman Transfer Internal
// Dapur Produksi (dashboard) atau Portal, bukan dari sini. Kartu ini murni
// biar Permintaan Barang jadi 1 tempat lihat SEMUA jenis permintaan
// (Purchasing/Supplier/Bahan Setengah Jadi) dan cetak dokumennya.
export default function TransferRequestCard({
  businessId,
  dapurProduksiLocationId,
  dapurProduksiPortalSlug,
  transfer,
}: {
  businessId: string;
  dapurProduksiLocationId: string;
  dapurProduksiPortalSlug: string | null;
  transfer: {
    id: string;
    requestedByName: string;
    toLocationName: string;
    status: "baru" | "dikirim";
    note: string | null;
    createdAt: string;
    dnNumber: string | null;
    items: TransferItem[];
  };
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-zinc-900">
            {transfer.requestedByName}
            <span className="ml-1.5 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-500">
              📍 {transfer.toLocationName}
            </span>
            <span className="ml-1.5 rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-medium text-purple-600">
              🥡 → Dapur Produksi
            </span>
          </p>
          <p className="text-[11px] text-zinc-400">
            {formatDateTime(transfer.createdAt)}
            {transfer.dnNumber && (
              <>
                {" · "}
                <span className="font-medium text-brand-600">{transfer.dnNumber}</span>
              </>
            )}
          </p>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${STATUS_STYLE[transfer.status]}`}>
          {STATUS_LABEL[transfer.status]}
        </span>
      </div>

      <div className="mt-3 divide-y divide-zinc-100 rounded-lg border border-zinc-100">
        {transfer.items.map((it) => (
          <div key={it.id} className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
            <span className="min-w-0 flex-1 truncate text-zinc-700">{it.itemName}</span>
            <span className="shrink-0 text-zinc-500">
              {transfer.status === "dikirim" && it.qtySent !== null
                ? `${it.qtySent} ${it.unit} terkirim`
                : `diminta ${it.qtyRequested} ${it.unit}`}
            </span>
          </div>
        ))}
      </div>

      {transfer.note && <p className="mt-2 rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-500">{transfer.note}</p>}

      <div className="mt-3">
        {transfer.status === "dikirim" && dapurProduksiPortalSlug ? (
          <Link
            href={`/portal-lokasi/${dapurProduksiPortalSlug}/kirim/riwayat/${transfer.id}/cetak`}
            target="_blank"
            className="text-xs font-medium text-brand-600 hover:underline"
          >
            🖨️ Cetak Surat Jalan
          </Link>
        ) : transfer.status === "baru" ? (
          <Link
            href={`/business/${businessId}/lokasi/${dapurProduksiLocationId}/transfer`}
            className="text-xs font-medium text-zinc-400 hover:text-brand-600 hover:underline"
          >
            Proses di Transfer Internal — Dapur Produksi →
          </Link>
        ) : null}
      </div>
    </div>
  );
}
