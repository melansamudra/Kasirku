import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows } from "./pagination";

// Logika penyaringan "kas keluar/masuk yang beneran masih berlaku" di akun
// Kas & Bank (1-001) -- dipakai bareng oleh halaman Kas & Bank sendiri dan
// halaman PDO (yang butuh daftar nota kas keluar buat dipilih admin).
// Disatukan di sini supaya definisi "yang dihitung vs disaring" (void,
// kas kecil pending/ditolak, koreksi) cuma ada SATU sumber kebenaran --
// kalau dobel-duplikat di 2 halaman, gampang diam-diam beda begitu salah
// satu diubah tanpa yang lain ikut diubah.

export type KasBankLine = {
  id: string;
  debit: number;
  credit: number;
  journal_entries: {
    id: string;
    date: string;
    description: string;
    source: string;
    source_id: string | null;
    payment_method: "tunai" | "transfer" | null;
  };
};

export type KasBankMovementMeta = {
  journal_entry_id: string;
  reclass_journal_entry_id: string | null;
  category: string | null;
  receipt_url: string | null;
  direction: "in" | "out";
  status: "pending" | "posted" | "rejected";
};

export type KasBankResult = {
  /** Non-void, non-kas-kecil-pending, non-kas-kecil-ditolak, non-transfer-antar-rekening -- TERMASUK penjualan. Dasar buat total Kas Masuk/Keluar. */
  nonVoidLines: KasBankLine[];
  /** Sama seperti nonVoidLines, tapi penjualan dikeluarkan -- buat daftar "Riwayat Kas" yang dirinci satu-satu (penjualan sudah ada halamannya sendiri di Riwayat Transaksi). */
  displayLines: KasBankLine[];
  voidLines: KasBankLine[];
  pendingPettyCashLines: KasBankLine[];
  rejectedPettyCashLines: KasBankLine[];
  /** Transfer antar akun kas/bank milik sendiri (mis. Rekening Utama -> Rekening Operasional lewat Transfer Kas/Bank atau PDO) -- bukan beban/pendapatan, cuma uang pindah tempat. */
  transferLines: KasBankLine[];
  movementByEntryId: Map<string, KasBankMovementMeta>;
  voidedSaleCount: number;
};

export async function fetchKasBankLines(
  supabase: SupabaseClient,
  businessId: string,
  fromIso: string | null,
  toIsoExclusive: string | null,
): Promise<KasBankResult> {
  const empty: KasBankResult = {
    nonVoidLines: [],
    displayLines: [],
    voidLines: [],
    pendingPettyCashLines: [],
    rejectedPettyCashLines: [],
    transferLines: [],
    movementByEntryId: new Map(),
    voidedSaleCount: 0,
  };

  // kasAccount & reversals tidak saling bergantung -- dijalankan paralel
  // (bukan berurutan) buat motong round-trip ke Supabase, penting di
  // koneksi lambat (lihat keluhan "Petty Cash lambat dibuka").
  const [{ data: kasAccount }, { data: reversals }] = await Promise.all([
    supabase.from("accounts").select("id").eq("business_id", businessId).eq("code", "1-001").single(),
    // Jurnal manual yang sudah dibatalkan lewat "↩ Koreksi" plus jurnal
    // koreksi-nya sendiri secara matematis saling meniadakan (net 0) --
    // tetap muncul di Jurnal Transaksi sebagai jejak audit, tapi di sini
    // cuma bikin bingung. Disaring biar cuma pergerakan kas yang masih
    // berlaku.
    supabase.from("journal_entries").select("source_id").eq("business_id", businessId).eq("source", "koreksi"),
  ]);
  if (!kasAccount) return empty;
  const reversedEntryIds = new Set((reversals ?? []).map((r) => r.source_id));

  // Supabase/PostgREST diam-diam memotong hasil query di 1000 baris kalau
  // tidak di-paginate (lihat lib/pagination.ts).
  const rawLines = await fetchAllRows<unknown>((rangeFrom, rangeTo) => {
    let q = supabase
      .from("journal_lines")
      .select(
        "id, debit, credit, journal_entries!inner(id, date, description, source, source_id, payment_method, business_id)",
      )
      .eq("account_id", kasAccount.id)
      .eq("journal_entries.business_id", businessId)
      .order("id", { ascending: true })
      .range(rangeFrom, rangeTo);
    if (fromIso) q = q.gte("journal_entries.date", fromIso);
    if (toIsoExclusive) q = q.lt("journal_entries.date", toIsoExclusive);
    return q;
  });
  const lines = (rawLines as KasBankLine[])
    .filter((l) => l.journal_entries.source !== "koreksi" && !reversedEntryIds.has(l.journal_entries.id))
    .slice()
    .sort((a, b) => new Date(b.journal_entries.date).getTime() - new Date(a.journal_entries.date).getTime());

  // Metadata Kas Kecil (kategori, foto nota, status approve/tolak) -- dua
  // source: 'shift' (dari kasir) dan 'kas_kecil' (admin/nota tunai langsung).
  const shiftEntryIds = Array.from(
    new Set(
      lines
        .filter((l) => l.journal_entries.source === "shift" || l.journal_entries.source === "kas_kecil")
        .map((l) => l.journal_entries.id),
    ),
  );
  // Penjualan yang di-void belakangan tetap punya baris "penjualan" asli --
  // void cuma menambah baris pembalikan, tidak menghapus baris aslinya.
  // Baris penjualan dari transaksi yang SAAT INI voided ikut dikeluarkan,
  // bukan cuma baris pembalikannya (penting kalau pembalikannya jatuh di
  // periode lain).
  const saleSourceIds = Array.from(
    new Set(
      lines
        .filter((l) => l.journal_entries.source === "penjualan" && l.journal_entries.source_id)
        .map((l) => l.journal_entries.source_id as string),
    ),
  );

  // shiftMovements & saleVoidStatus keduanya cuma butuh `lines` (sudah ada),
  // tidak saling bergantung -- dijalankan paralel, sama seperti kasAccount/
  // reversals di atas.
  const [{ data: shiftMovements }, { data: saleVoidStatus }] = await Promise.all([
    shiftEntryIds.length > 0
      ? supabase
          .from("shift_cash_movements")
          .select("journal_entry_id, reclass_journal_entry_id, category, receipt_url, direction, status")
          .in("journal_entry_id", shiftEntryIds)
      : Promise.resolve({ data: [] as KasBankMovementMeta[] }),
    saleSourceIds.length > 0
      ? supabase.from("transactions").select("id, voided").in("id", saleSourceIds)
      : Promise.resolve({ data: [] as { id: string; voided: boolean }[] }),
  ]);
  const movementByEntryId = new Map((shiftMovements ?? []).map((m) => [m.journal_entry_id, m as KasBankMovementMeta]));

  // Sisi pembalikan kas kecil yang ditolak punya journal_entry_id SENDIRI --
  // shift_cash_movements nunjuk ke situ lewat reclass_journal_entry_id, bukan
  // journal_entry_id. Perlu peta terpisah biar baris pembalikannya ikut
  // kesaring juga, bukan nongol polos tanpa keterangan.
  const rejectedReversalEntryIds = new Set(
    (shiftMovements ?? [])
      .filter((m) => m.status === "rejected" && m.reclass_journal_entry_id)
      .map((m) => m.reclass_journal_entry_id as string),
  );

  const voidedSaleIds = new Set((saleVoidStatus ?? []).filter((t) => t.voided).map((t) => t.id));

  const isVoidRelated = (l: KasBankLine) =>
    l.journal_entries.source === "void" ||
    (l.journal_entries.source === "penjualan" &&
      !!l.journal_entries.source_id &&
      voidedSaleIds.has(l.journal_entries.source_id));

  const isPendingPettyCash = (l: KasBankLine) => {
    const m = movementByEntryId.get(l.journal_entries.id);
    return !!m && m.direction === "out" && m.status === "pending";
  };

  const isRejectedPettyCash = (l: KasBankLine) => {
    const m = movementByEntryId.get(l.journal_entries.id);
    return m?.status === "rejected" || rejectedReversalEntryIds.has(l.journal_entries.id);
  };

  // Transfer antar akun kas/bank (mis. PDO: Rekening Utama -> Rekening
  // Operasional) selalu ditulis lewat addTransfer() dengan deskripsi
  // berpola "Transfer: ..." atau default "Transfer antar akun kas/bank" --
  // ini satu-satunya jalur kode yang bikin pola ini, jadi aman dipakai buat
  // mendeteksi. Bukan beban/pendapatan (cuma uang pindah tempat sendiri),
  // jadi dikeluarkan dari Kas Keluar/Masuk & daftar nota PDO -- kalau tidak,
  // transfer PDO minggu ini bisa ke-double-hitung sebagai "nota" di PDO
  // berikutnya.
  const isTransferRelated = (l: KasBankLine) =>
    l.journal_entries.source === "manual" &&
    (l.journal_entries.description === "Transfer antar akun kas/bank" ||
      l.journal_entries.description.startsWith("Transfer: "));

  const voidLines = lines.filter(isVoidRelated);
  const pendingPettyCashLines = lines.filter((l) => !isVoidRelated(l) && isPendingPettyCash(l));
  const rejectedPettyCashLines = lines.filter(
    (l) => !isVoidRelated(l) && !isPendingPettyCash(l) && isRejectedPettyCash(l),
  );
  const transferLines = lines.filter(
    (l) => !isVoidRelated(l) && !isPendingPettyCash(l) && !isRejectedPettyCash(l) && isTransferRelated(l),
  );
  const nonVoidLines = lines.filter(
    (l) =>
      !isVoidRelated(l) && !isPendingPettyCash(l) && !isRejectedPettyCash(l) && !isTransferRelated(l),
  );
  // Penjualan tidak dirinci -- itu murni duplikat Riwayat Transaksi.
  const displayLines = nonVoidLines.filter((l) => l.journal_entries.source !== "penjualan");

  return {
    nonVoidLines,
    displayLines,
    voidLines,
    pendingPettyCashLines,
    rejectedPettyCashLines,
    transferLines,
    movementByEntryId,
    voidedSaleCount: voidedSaleIds.size,
  };
}
