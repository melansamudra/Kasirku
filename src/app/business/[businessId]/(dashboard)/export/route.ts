import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";
import { PERIOD_DESCRIPTIONS, getPeriodRange, parsePeriod } from "../reports/period";

type JournalLine = { debit: number; credit: number; account_id: string };
type AccountRow = { id: string; code: string; name: string; type: string; normal_balance: string };

function balanceOf(raw: number, normalBalance: string) {
  return normalBalance === "debit" ? raw : -raw;
}

// Bulk "export everything" — one workbook covering the reports most useful
// for handing off to an accountant/auditor at once, complementing the
// per-page CSV exports elsewhere (reports/export, ticket-reports/export)
// which stay scoped to a single report.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ businessId: string }> },
) {
  const { businessId } = await params;
  const url = new URL(request.url);
  const period = parsePeriod(url.searchParams.get("period") ?? undefined);
  const { fromIso, toIsoExclusive } = getPeriodRange(
    period,
    url.searchParams.get("from") ?? undefined,
    url.searchParams.get("to") ?? undefined,
  );

  const supabase = await createClient();

  const { data: business } = await supabase
    .from("businesses")
    .select("id, name")
    .eq("id", businessId)
    .single();

  if (!business) {
    return new Response("Not found", { status: 404 });
  }

  const { data: accounts } = await supabase
    .from("accounts")
    .select("id, code, name, type, normal_balance")
    .eq("business_id", businessId)
    .order("code", { ascending: true });
  const accountRows = (accounts ?? []) as AccountRow[];
  const accountById = new Map(accountRows.map((a) => [a.id, a]));

  // Jurnal — dibatasi periode yang dipilih, sama seperti accounting/jurnal.
  let entryQuery = supabase
    .from("journal_entries")
    .select("date, description, source, journal_lines(debit, credit, account_id)")
    .eq("business_id", businessId)
    .order("date", { ascending: true });
  if (fromIso) entryQuery = entryQuery.gte("date", fromIso);
  if (toIsoExclusive) entryQuery = entryQuery.lt("date", toIsoExclusive);
  const { data: periodEntries } = await entryQuery;

  // Neraca — selalu per hari ini (posisi keuangan terkini), lepas dari filter
  // periode Jurnal/Laba Rugi di atas — sama seperti default accounting/neraca.
  const todayIso = `${new Date().toISOString().slice(0, 10)}T23:59:59+07:00`;
  const { data: allEntriesToDate } = await supabase
    .from("journal_entries")
    .select("journal_lines(debit, credit, account_id)")
    .eq("business_id", businessId)
    .lte("date", todayIso);

  function sumBalances(entries: { journal_lines: JournalLine[] }[]) {
    const balanceByAccount = new Map<string, number>();
    for (const entry of entries) {
      for (const l of entry.journal_lines) {
        const cur = balanceByAccount.get(l.account_id) ?? 0;
        balanceByAccount.set(l.account_id, cur + Number(l.debit) - Number(l.credit));
      }
    }
    return balanceByAccount;
  }

  const periodBalances = sumBalances(
    (periodEntries ?? []) as unknown as { journal_lines: JournalLine[] }[],
  );
  const nowBalances = sumBalances(
    (allEntriesToDate ?? []) as unknown as { journal_lines: JournalLine[] }[],
  );

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "KasirKu";
  workbook.created = new Date();

  // Sheet 1 — Daftar Akun
  const akunSheet = workbook.addWorksheet("Daftar Akun");
  akunSheet.addRow(["Kode", "Nama Akun", "Tipe", "Saldo Normal"]);
  akunSheet.getRow(1).font = { bold: true };
  for (const a of accountRows) {
    akunSheet.addRow([a.code, a.name, a.type, a.normal_balance === "debit" ? "Debit" : "Kredit"]);
  }
  akunSheet.columns.forEach((c) => (c.width = 22));

  // Sheet 2 — Jurnal Transaksi (satu baris per baris jurnal)
  const jurnalSheet = workbook.addWorksheet("Jurnal Transaksi");
  jurnalSheet.addRow(["Tanggal", "Keterangan", "Sumber", "Kode Akun", "Nama Akun", "Debit", "Kredit"]);
  jurnalSheet.getRow(1).font = { bold: true };
  for (const e of periodEntries ?? []) {
    const lines = e.journal_lines as unknown as JournalLine[];
    for (const l of lines) {
      const account = accountById.get(l.account_id);
      jurnalSheet.addRow([
        new Date(e.date).toLocaleDateString("id-ID"),
        e.description,
        e.source,
        account?.code ?? "",
        account?.name ?? "",
        Number(l.debit) || "",
        Number(l.credit) || "",
      ]);
    }
  }
  jurnalSheet.columns.forEach((c) => (c.width = 18));

  // Sheet 3 — Laba Rugi (Akrual), periode terpilih
  const lrSheet = workbook.addWorksheet("Laba Rugi");
  lrSheet.addRow([`Periode: ${PERIOD_DESCRIPTIONS[period]}`]);
  lrSheet.addRow(["Akun", "Tipe", "Saldo"]);
  lrSheet.getRow(2).font = { bold: true };
  let totalPendapatan = 0;
  let totalBeban = 0;
  for (const a of accountRows) {
    if (a.type !== "pendapatan" && a.type !== "beban") continue;
    const balance = balanceOf(periodBalances.get(a.id) ?? 0, a.normal_balance);
    if (balance === 0) continue;
    if (a.type === "pendapatan") totalPendapatan += balance;
    else totalBeban += balance;
    lrSheet.addRow([a.name, a.type === "pendapatan" ? "Pendapatan" : "Beban", balance]);
  }
  lrSheet.addRow([]);
  lrSheet.addRow(["Total Pendapatan", "", totalPendapatan]);
  lrSheet.addRow(["Total Beban", "", totalBeban]);
  lrSheet.addRow(["Laba/Rugi Bersih", "", totalPendapatan - totalBeban]);
  lrSheet.columns.forEach((c) => (c.width = 26));

  // Sheet 4 — Neraca, per hari ini
  const nrSheet = workbook.addWorksheet("Neraca");
  nrSheet.addRow([`Per tanggal: ${new Date().toLocaleDateString("id-ID")}`]);
  nrSheet.addRow(["Akun", "Tipe", "Saldo"]);
  nrSheet.getRow(2).font = { bold: true };
  let totalAset = 0;
  let totalKewajiban = 0;
  let totalModal = 0;
  let totalPendapatanAll = 0;
  let totalBebanAll = 0;
  for (const a of accountRows) {
    const balance = balanceOf(nowBalances.get(a.id) ?? 0, a.normal_balance);
    if (a.type === "aset") totalAset += balance;
    else if (a.type === "kewajiban") totalKewajiban += balance;
    else if (a.type === "modal") totalModal += balance;
    else if (a.type === "pendapatan") totalPendapatanAll += balance;
    else if (a.type === "beban") totalBebanAll += balance;
    if (["aset", "kewajiban", "modal"].includes(a.type) && balance !== 0) {
      nrSheet.addRow([a.name, a.type, balance]);
    }
  }
  const labaBerjalan = totalPendapatanAll - totalBebanAll;
  nrSheet.addRow(["Laba Berjalan (belum ditutup)", "modal", labaBerjalan]);
  nrSheet.addRow([]);
  nrSheet.addRow(["Total Aset", "", totalAset]);
  nrSheet.addRow(["Total Kewajiban", "", totalKewajiban]);
  nrSheet.addRow(["Total Modal", "", totalModal + labaBerjalan]);
  nrSheet.columns.forEach((c) => (c.width = 26));

  const buffer = await workbook.xlsx.writeBuffer();
  const periodLabel = period === "custom" ? "custom" : period;
  const filename = `KasirKu_${business.name.replace(/[^a-zA-Z0-9]+/g, "-")}_${periodLabel}.xlsx`;

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
