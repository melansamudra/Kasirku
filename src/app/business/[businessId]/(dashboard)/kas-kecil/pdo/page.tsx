import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { todayWibDateString } from "@/lib/wib";
import { addTransfer } from "../../accounting/transfer-kas/actions";
import PdoForm from "./pdo-form";

const REKENING_UTAMA_CODE = "1-001";
const REKENING_OPERASIONAL_CODE = "1-002";

function firstDayOfMonth(dateStr: string) {
  return `${dateStr.slice(0, 7)}-01`;
}

function formatDateLabel(dateStr: string) {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default async function PdoPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { businessId } = await params;
  const { from: fromParam, to: toParam } = await searchParams;
  const today = todayWibDateString();
  const from = /^\d{4}-\d{2}-\d{2}$/.test(fromParam ?? "") ? (fromParam as string) : firstDayOfMonth(today);
  const to = /^\d{4}-\d{2}-\d{2}$/.test(toParam ?? "") ? (toParam as string) : today;

  const supabase = await createClient();

  const [{ data: business }, { data: accounts }] = await Promise.all([
    supabase.from("businesses").select("id, name").eq("id", businessId).single(),
    supabase
      .from("accounts")
      .select("code, name")
      .eq("business_id", businessId)
      .in("code", [REKENING_UTAMA_CODE, REKENING_OPERASIONAL_CODE]),
  ]);

  if (!business) {
    notFound();
  }

  const rekeningOperasional = (accounts ?? []).find((a) => a.code === REKENING_OPERASIONAL_CODE);

  if (!rekeningOperasional) {
    return (
      <div className="w-full max-w-xl">
        <h1 className="text-lg font-bold text-zinc-900">Permintaan Dana Operasional (PDO)</h1>
        <div className="mt-4 rounded-2xl border border-dashed border-zinc-200 bg-white p-6 text-center text-sm text-zinc-500">
          Akun &quot;Rekening Operasional&quot; ({REKENING_OPERASIONAL_CODE}) belum ada. Tambahkan dulu lewat{" "}
          <Link href={`/business/${businessId}/accounting/daftar-akun`} className="text-brand-600 hover:underline">
            Daftar Akun
          </Link>
          .
        </div>
      </div>
    );
  }

  // Nota Kas Kecil yang SUDAH disetujui (status 'posted') di periode ini --
  // ini daftar yang dipakai admin buat MILIH SENDIRI mana yang mau dimasukkan
  // ke perhitungan PDO (mis. sebagian sudah kepakai di permintaan sebelumnya,
  // jangan sampai ke-double). Nota yang masih pending/ditolak sengaja tidak
  // dihitung (belum tentu jadi beban beneran, atau sudah dibatalkan -- lihat
  // fix kas-harian sebelumnya).
  const { data: notaRows } = await supabase
    .from("shift_cash_movements")
    .select("id, description, amount, category, created_at")
    .eq("business_id", businessId)
    .eq("direction", "out")
    .eq("status", "posted")
    .gte("created_at", `${from}T00:00:00+07:00`)
    .lt("created_at", `${to}T23:59:59.999+07:00`)
    .order("created_at", { ascending: true });

  const notaList = (notaRows ?? []) as {
    id: string;
    description: string;
    amount: number;
    category: string | null;
    created_at: string;
  }[];

  const boundAddTransfer = addTransfer.bind(null, businessId);

  return (
    <div className="w-full max-w-xl">
      <div className="print:hidden">
        <h1 className="text-lg font-bold text-zinc-900">Permintaan Dana Operasional (PDO)</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Ajukan top-up dari Rekening Utama ke Rekening Operasional sebesar nota Kas Kecil yang
          sudah dipakai, lalu cetak slip permintaannya.
        </p>

        <form method="get" className="mt-4 flex flex-wrap items-end gap-3 rounded-2xl border border-zinc-200 bg-white p-4">
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
            Hitung Ulang
          </button>
        </form>
      </div>

      <PdoForm
        action={boundAddTransfer}
        today={today}
        fromLabel={formatDateLabel(from)}
        toLabel={formatDateLabel(to)}
        notaList={notaList}
        businessName={business.name}
        rekeningUtamaCode={REKENING_UTAMA_CODE}
        rekeningOperasionalCode={REKENING_OPERASIONAL_CODE}
        rekeningOperasionalName={rekeningOperasional.name}
      />

      <p className="mt-3 text-center text-[11px] text-zinc-400 print:hidden">
        Total nota di atas dihitung dari{" "}
        <Link href={`/business/${businessId}/kas-kecil`} className="text-brand-600 hover:underline">
          Kas Kecil
        </Link>{" "}
        yang berstatus &quot;Disetujui&quot; di periode ini. Transfer yang tercatat bisa dicek di{" "}
        <Link href={`/business/${businessId}/accounting/jurnal`} className="text-brand-600 hover:underline">
          Jurnal Transaksi
        </Link>
        .
      </p>
    </div>
  );
}
