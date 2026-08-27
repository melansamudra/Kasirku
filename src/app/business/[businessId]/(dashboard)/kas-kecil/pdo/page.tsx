import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { todayWibDateString } from "@/lib/wib";
import { fetchKasBankLines } from "@/lib/kas-bank";
import { addTransfer } from "../../accounting/transfer-kas/actions";
import { updateAccountBankDetails } from "./actions";
import PdoForm from "./pdo-form";
import BankDetailsForm from "./bank-details-form";

const REKENING_UTAMA_CODE = "1-001";
const REKENING_OPERASIONAL_CODE = "1-002";

function firstDayOfMonth(dateStr: string) {
  return `${dateStr.slice(0, 7)}-01`;
}

function nextDayStr(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function formatDateLabel(dateStr: string) {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  });
}

function formatRupiah(value: number) {
  return `Rp${Math.round(value).toLocaleString("id-ID")}`;
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
      .select("code, name, bank_name, bank_account_number, bank_account_holder")
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

  // Diambil dari Kas & Bank (bukan langsung dari Kas Kecil) karena semua kas
  // keluar akhirnya bermuara di situ -- bukan cuma Kas Kecil, tapi juga
  // "Catat Kas Keluar" manual dkk. Pakai fungsi penyaring yang sama dengan
  // halaman Kas & Bank (fetchKasBankLines) supaya definisi "kas keluar yang
  // beneran berlaku" konsisten: void, kas kecil pending/ditolak, dan
  // penjualan (bukan nota/beban) sudah otomatis dikeluarkan di situ.
  const { displayLines, movementByEntryId } = await fetchKasBankLines(
    supabase,
    businessId,
    `${from}T00:00:00+07:00`,
    `${nextDayStr(to)}T00:00:00+07:00`,
  );

  // Cuma yang metode bayarnya Transfer -- kas keluar tunai (nota tunai kasir,
  // dll) isi ulang sendiri dari omset tunai (rekonsiliasinya lewat "Tutup
  // Petty Cash" di halaman Kas Kecil), jadi tidak ikut diminta ke PDO. Kas
  // keluar lama sebelum kolom payment_method ada (atau yang belum diisi)
  // otomatis tidak muncul di sini -- itu batasan yang disengaja, bukan bug.
  const notaList = displayLines
    .filter((l) => Number(l.credit) > 0 && l.journal_entries.payment_method === "transfer")
    .map((l) => ({
      id: l.id,
      description: l.journal_entries.description,
      amount: Number(l.credit),
      category: movementByEntryId.get(l.journal_entries.id)?.category ?? null,
      created_at: l.journal_entries.date,
    }))
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  // Riwayat permintaan PDO -- belum ada tabel khusus, tapi setiap PDO yang
  // diajukan selalu lewat addTransfer() dengan deskripsi berpola
  // "Transfer: PDO ..." (lihat pdo-form.tsx), jadi cukup ditelusuri dari
  // Jurnal Transaksi lewat pola itu, bukan bikin tabel baru buat sesuatu
  // yang sudah tercatat lengkap di jurnal.
  const { data: pdoHistoryRows } = await supabase
    .from("journal_entries")
    .select("id, date, description, journal_lines(debit, accounts(code))")
    .eq("business_id", businessId)
    .ilike("description", "Transfer: PDO %")
    .order("date", { ascending: false })
    .limit(30);

  const pdoHistory = (
    (pdoHistoryRows ?? []) as {
      id: string;
      date: string;
      description: string;
      journal_lines: { debit: number; accounts: { code: string } | null }[];
    }[]
  ).map((row) => ({
    id: row.id,
    date: row.date,
    amount:
      row.journal_lines.find((l) => l.accounts?.code === REKENING_OPERASIONAL_CODE)?.debit ?? 0,
    // Buang prefix "Transfer: " -- itu murni penanda teknis dari
    // addTransfer(), tidak perlu ditampilkan ke admin.
    detail: row.description.replace(/^Transfer:\s*/, ""),
  }));

  const boundAddTransfer = addTransfer.bind(null, businessId);
  const boundUpdateBankDetails = updateAccountBankDetails.bind(null, businessId, REKENING_OPERASIONAL_CODE);

  return (
    <div className="w-full max-w-xl">
      <div className="print:hidden">
        <h1 className="text-lg font-bold text-zinc-900">Permintaan Dana Operasional (PDO)</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Ajukan top-up dari Rekening Utama ke Rekening Operasional sebesar nota kas keluar yang
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

      <div className="rounded-2xl border border-zinc-200 bg-white p-4 print:hidden">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900">
          Info Rekening Tujuan ({rekeningOperasional.name})
        </h2>
        <BankDetailsForm
          action={boundUpdateBankDetails}
          bankName={rekeningOperasional.bank_name ?? ""}
          accountNumber={rekeningOperasional.bank_account_number ?? ""}
          accountHolder={rekeningOperasional.bank_account_holder ?? ""}
        />
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
        bankName={rekeningOperasional.bank_name}
        bankAccountNumber={rekeningOperasional.bank_account_number}
        bankAccountHolder={rekeningOperasional.bank_account_holder}
      />

      <p className="mt-3 text-center text-[11px] text-zinc-400 print:hidden">
        Daftar nota di atas ditarik dari{" "}
        <Link href={`/business/${businessId}/kas-harian`} className="text-brand-600 hover:underline">
          Kas & Bank
        </Link>{" "}
        , cuma yang metode bayarnya <strong>Transfer</strong> (void &amp; yang masih menunggu/ditolak
        sudah dikecualikan). Kas keluar tunai tidak ikut — isi ulang sendiri dari omset tunai, cek di{" "}
        <Link href={`/business/${businessId}/kas-kecil`} className="text-brand-600 hover:underline">
          Tutup Petty Cash
        </Link>
        . Transfer yang tercatat bisa dicek di{" "}
        <Link href={`/business/${businessId}/accounting/jurnal`} className="text-brand-600 hover:underline">
          Jurnal Transaksi
        </Link>
        .
      </p>

      {pdoHistory.length > 0 && (
        <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-200 bg-white print:hidden">
          <div className="border-b border-zinc-100 px-4 py-3">
            <h2 className="text-sm font-bold text-zinc-900">Riwayat Permintaan</h2>
            <p className="mt-0.5 text-[11px] text-zinc-400">
              PDO yang sudah pernah diajukan & tercatat sebagai transfer.
            </p>
          </div>
          <div className="divide-y divide-zinc-100">
            {pdoHistory.map((h) => (
              <div key={h.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-zinc-400">{formatDateTime(h.date)}</span>
                  <span className="text-sm font-bold text-brand-700">{formatRupiah(h.amount)}</span>
                </div>
                <p className="mt-0.5 text-xs text-zinc-600">{h.detail}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
