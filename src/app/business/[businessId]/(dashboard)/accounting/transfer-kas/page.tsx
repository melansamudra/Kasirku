import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { addTransfer } from "./actions";
import TransferForm from "./transfer-form";

export default async function TransferKasPage({
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

  const { data: accounts } = await supabase
    .from("accounts")
    .select("code, name")
    .eq("business_id", businessId)
    .eq("type", "aset")
    .order("code", { ascending: true });

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
  const boundAddTransfer = addTransfer.bind(null, businessId);
  const onlyOneAccount = (accounts ?? []).length < 2;

  return (
    <div className="w-full max-w-2xl">
      <h1 className="text-lg font-bold text-zinc-900">Transfer Kas/Bank — {business.name}</h1>
      <p className="mt-0.5 text-xs text-zinc-500">
        Catat perpindahan uang antar akun kas &amp; bank (mis. setor tunai ke rekening, tarik tunai
        dari ATM).
      </p>

      {onlyOneAccount ? (
        <div className="mt-6 rounded-2xl border border-dashed border-zinc-200 bg-white p-6 text-center">
          <p className="text-sm text-zinc-500">
            Baru ada satu akun kas/bank (&quot;Kas &amp; Bank&quot;). Tambahkan rekening lain dulu (mis. &quot;Bank
            BCA&quot;) lewat{" "}
            <Link href={`/business/${businessId}/accounting/daftar-akun`} className="text-brand-600 hover:underline">
              Daftar Akun
            </Link>{" "}
            (jenis Aset) supaya bisa dipakai di sini.
          </p>
        </div>
      ) : (
        <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-zinc-900">Catat Transfer</h2>
          <TransferForm action={boundAddTransfer} today={today} accounts={accounts ?? []} />
        </div>
      )}

      <p className="mt-3 text-center text-[11px] text-zinc-400">
        Penjualan, pengeluaran, pembelian, payroll, dan piutang selalu memposting otomatis ke &quot;Kas
        &amp; Bank&quot; (1-001) — akun kas/bank tambahan cuma dipakai untuk transfer manual seperti ini.
        Riwayat transfer bisa dilihat di{" "}
        <Link href={`/business/${businessId}/accounting/jurnal`} className="text-brand-600 hover:underline">
          Jurnal Transaksi
        </Link>
        .
      </p>
    </div>
  );
}
