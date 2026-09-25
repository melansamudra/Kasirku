import type { SupabaseClient } from "@supabase/supabase-js";

// Set ID entri jurnal yang murni "bekas" koreksi/reklas data -- dipakai oleh
// Jurnal Transaksi & Buku Besar (lihat pemanggilnya) untuk menyaring histori
// biar tidak nampilin pasangan kesalahan+pembalik yang sudah saling
// meniadakan (net 0), atas permintaan eksplisit user 2026-09-25 supaya kedua
// laporan itu "bersih" dan tetap 1:1 cocok satu sama lain (Buku Besar
// ditarik dari Jurnal Transaksi). Data aslinya TIDAK dihapus/diedit --
// prinsip jejak audit di reverse_journal_entry() tetap dipegang, ini
// murni filter tampilan.
//
// Dua sumber "pasangan koreksi":
// 1) "↩ Koreksi" manual (source='koreksi') -- jurnal manual yang dibatalkan
//    lewat Jurnal Transaksi, plus jurnal koreksi-nya sendiri.
// 2) Kas kecil yang di-reject TAPI sebenarnya bukan penolakan admin beneran,
//    melainkan koreksi/reklas data masal (mis. batch reklas TF Pak Jeff ->
//    Nota Hutang, 2026-09-25) -- dibedakan dari penolakan asli lewat
//    deskripsi jurnal pembaliknya: reject asli selalu "Tolak kas kecil: ...",
//    sedang koreksi manual/batch selalu "Koreksi: ...". Seluruh rantai
//    entrinya (submission asli + reklas awal kalau ada + pembalik) ikut
//    disembunyikan, ditelusuri lewat source_id yang menunjuk ke movement
//    yang sama -- bukan cuma dua ujung pasangannya.
export async function fetchHiddenCorrectionEntryIds(
  supabase: SupabaseClient,
  businessId: string,
): Promise<Set<string>> {
  const hidden = new Set<string>();

  const [{ data: reversals }, { data: rejectedMovements }] = await Promise.all([
    supabase.from("journal_entries").select("id, source_id").eq("business_id", businessId).eq("source", "koreksi"),
    supabase
      .from("shift_cash_movements")
      .select("id, journal_entry_id, reclass_journal_entry_id")
      .eq("business_id", businessId)
      .eq("status", "rejected"),
  ]);

  for (const r of reversals ?? []) {
    hidden.add(r.id);
    if (r.source_id) hidden.add(r.source_id);
  }

  const reclassIds = (rejectedMovements ?? [])
    .map((m) => m.reclass_journal_entry_id)
    .filter((id): id is string => !!id);

  const { data: reclassEntries } =
    reclassIds.length > 0
      ? await supabase.from("journal_entries").select("id, description").in("id", reclassIds)
      : { data: [] as { id: string; description: string }[] };
  const correctionReclassIds = new Set(
    (reclassEntries ?? []).filter((e) => e.description?.startsWith("Koreksi:")).map((e) => e.id),
  );

  const correctionMovements = (rejectedMovements ?? []).filter(
    (m) => m.reclass_journal_entry_id && correctionReclassIds.has(m.reclass_journal_entry_id),
  );
  const correctionMovementIds = correctionMovements.map((m) => m.id);

  for (const m of correctionMovements) {
    hidden.add(m.journal_entry_id);
    if (m.reclass_journal_entry_id) hidden.add(m.reclass_journal_entry_id);
  }

  if (correctionMovementIds.length > 0) {
    const { data: chainEntries } = await supabase
      .from("journal_entries")
      .select("id")
      .eq("business_id", businessId)
      .eq("source", "kas_kecil")
      .in("source_id", correctionMovementIds);
    for (const e of chainEntries ?? []) hidden.add(e.id);
  }

  return hidden;
}
