import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { todayWibDateString } from "@/lib/wib";
import { fetchKasBankLines } from "@/lib/kas-bank";
import { submitPdoTransfer, updateAccountBankDetails } from "./actions";
import PdoForm from "./pdo-form";
import BankDetailsForm from "./bank-details-form";
import PettyCashTunaiSection from "./petty-cash-tunai-section";
import PdoHistoryList from "./pdo-history-list";
import PrintClosureButton from "../print-closure-button";

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

function formatClosureDate(dateStr: string) {
  return new Date(`${dateStr}T00:00:00+07:00`).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
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

  const [{ data: business }, { data: accounts }, { data: closureHistoryRows }] = await Promise.all([
    supabase.from("businesses").select("id, name").eq("id", businessId).single(),
    supabase
      .from("accounts")
      .select("code, name, bank_name, bank_account_number, bank_account_holder")
      .eq("business_id", businessId)
      .in("code", [REKENING_UTAMA_CODE, REKENING_OPERASIONAL_CODE]),
    // Riwayat Tutup Petty Cash beneran (bukan preview lokal Petty Cash Tunai
    // di halaman ini) -- disimpan resmi di petty_cash_closures lewat
    // close_petty_cash() RPC di halaman /kas-kecil. Ditarik ke sini juga
    // biar kelihatan sekalian di satu halaman Petty Cash ini, bukan cuma di
    // /kas-kecil.
    supabase
      .from("petty_cash_closures")
      .select("id, date, total_allocated, total_tunai, total_hutang, hutang_count, expected_remaining, actual_remaining, difference")
      .eq("business_id", businessId)
      .order("date", { ascending: false })
      .limit(20),
  ]);
  const closureHistory = closureHistoryRows ?? [];

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

  const notaList = displayLines
    .filter((l) => Number(l.credit) > 0) // kas KELUAR saja, bukan kas masuk/setoran
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

  const boundAddTransfer = submitPdoTransfer.bind(null, businessId);
  const boundUpdateBankDetails = updateAccountBankDetails.bind(null, businessId, REKENING_OPERASIONAL_CODE);

  return (
    <div className="w-full max-w-xl">
      <div className="print:hidden">
        <h1 className="text-lg font-bold text-zinc-900">Petty Cash</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Rekap Petty Cash Tunai (dari omset) dan ajukan top-up Petty Cash Rekening (PDO) dari
          Rekening Utama — sama-sama dihitung dari nota kas keluar periode ini.
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

      <h2 className="mt-4 text-sm font-bold text-zinc-900 print:hidden">💵 Petty Cash Tunai</h2>
      <div className="mt-2">
        <PettyCashTunaiSection
          today={today}
          fromLabel={formatDateLabel(from)}
          toLabel={formatDateLabel(to)}
          notaList={notaList}
          businessName={business.name}
        />
      </div>

      {closureHistory.length > 0 && (
        <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-200 bg-white print:hidden">
          <div className="border-b border-zinc-100 px-4 py-3">
            <h2 className="text-sm font-bold text-zinc-900">🔒 Riwayat Penutupan Petty Cash Tunai</h2>
            <p className="mt-0.5 text-[11px] text-zinc-400">
              Tunai yang sudah beneran ditutup &amp; tercatat lewat{" "}
              <Link href={`/business/${businessId}/kas-kecil`} className="text-brand-600 hover:underline">
                Kas Kecil
              </Link>
              .
            </p>
          </div>
          <div className="divide-y divide-zinc-100">
            {closureHistory.map((c) => (
              <div key={c.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-zinc-400">{formatClosureDate(c.date)}</span>
                  <PrintClosureButton businessId={businessId} closureId={c.id} />
                </div>
                <div className="mt-1.5 space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Petty Cash Diberikan</span>
                    <span className="font-medium text-zinc-900">{formatRupiah(Number(c.total_allocated))}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Nota Tunai</span>
                    <span className="font-medium text-red-600">-{formatRupiah(Number(c.total_tunai))}</span>
                  </div>
                  {Number(c.total_hutang) > 0 && (
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Nota Hutang</span>
                      <span className="font-medium text-zinc-900">
                        {c.hutang_count} nota · {formatRupiah(Number(c.total_hutang))}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-zinc-100 pt-1 font-semibold">
                    <span className="text-zinc-700">Sisa Seharusnya</span>
                    <span className="text-zinc-900">{formatRupiah(Number(c.expected_remaining))}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Sisa Fisik Dihitung</span>
                    <span className="font-medium text-zinc-900">{formatRupiah(Number(c.actual_remaining))}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Selisih</span>
                    <span
                      className={`font-semibold ${
                        Number(c.difference) === 0
                          ? "text-zinc-700"
                          : Number(c.difference) > 0
                            ? "text-brand-700"
                            : "text-red-600"
                      }`}
                    >
                      {Number(c.difference) === 0
                        ? "Pas"
                        : `${Number(c.difference) > 0 ? "+" : ""}${formatRupiah(Number(c.difference))}`}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <h2 className="mt-6 text-sm font-bold text-zinc-900 print:hidden">📄 Petty Cash Rekening (PDO)</h2>

      <div className="mt-2 rounded-2xl border border-zinc-200 bg-white p-4 print:hidden">
        <h3 className="mb-3 text-sm font-semibold text-zinc-900">
          Info Rekening Tujuan ({rekeningOperasional.name})
        </h3>
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
        (semua kas keluar yang beneran berlaku — Kas Kecil, Catat Kas Keluar manual, dll — void &amp;
        yang masih menunggu/ditolak sudah dikecualikan). Transfer yang tercatat bisa dicek di{" "}
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
          <PdoHistoryList businessName={business.name} history={pdoHistory} />
        </div>
      )}
    </div>
  );
}
