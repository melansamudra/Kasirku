"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";

export type PdoLogState = { error: string | null };

// PDO murni dokumen (slip permintaan dana yang dicetak/dikirim ke pemegang
// Rekening Utama) -- TIDAK memposting transfer jurnal beneran antar akun
// (dulu lewat addTransfer(), butuh akun "Rekening Operasional" terdaftar
// dulu di Daftar Akun, dan otomatis nyatet seolah dananya SUDAH pindah
// padahal baru permintaan). Arahan user 2026-09-03: omset tunai dipakai
// langsung buat isi Petty Cash (sudah ada di bagian "Petty Cash Tunai"),
// PDO ini cuma buat kasus kurang -- minta transfer dari Rekening Utama --
// dan yang beneran mindahin dana + mencatat jurnalnya adalah pemegang
// Rekening Utama sendiri (lewat Transfer Kas/Bank atau proses mereka
// sendiri), bukan sisi yang mengajukan.
//
// Riwayat-nya disimpan di activity_log (bukan tabel baru) -- amount
// dititip di title ("PDO Rp250.000") supaya gampang di-parse balik jadi
// angka, rincian lengkapnya di detail (format sama seperti sebelumnya,
// tetap kompatibel dengan pdo-history-list.tsx yang sudah ada).
export async function logPdoRequest(
  businessId: string,
  _prevState: PdoLogState,
  formData: FormData,
): Promise<PdoLogState> {
  const amount = Number(formData.get("amount"));
  const description = (formData.get("description") as string) ?? "";

  if (!(amount > 0)) {
    return { error: "Jumlah dana yang diminta harus lebih dari 0." };
  }
  if (!description.trim()) {
    return { error: "Data permintaan tidak valid." };
  }

  const supabase = await createClient();
  const formattedAmount = `Rp${Math.round(amount).toLocaleString("id-ID")}`;

  await logActivity(supabase, businessId, "sistem", "info", `PDO ${formattedAmount}`, description);

  revalidatePath(`/business/${businessId}/kas-kecil/pdo`);
  return { error: null };
}
