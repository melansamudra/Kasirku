"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/types/database";

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
// Riwayat-nya disimpan di activity_log (bukan tabel baru) -- amount dititip
// di title ("PDO Rp250.000") supaya gampang di-parse balik jadi angka,
// rincian teks buat ditampilkan/dicetak di detail. Ditulis langsung (bukan
// lewat helper logActivity yang best-effort/fire-and-forget) karena PDO
// butuh tahu kalau tulisnya gagal, dan butuh nyimpen `data` (snapshot
// terstruktur form-nya, migration 20260903100000) supaya dokumennya bisa
// dibuka lagi & diedit persis seperti pas diisi -- bukan di-parse ulang
// dari teks tampilan yang rawan ambigu/kehilangan info (mis. tahun).
function validatePdoForm(formData: FormData): { amount: number; description: string; snapshot: Json | null } | { error: string } {
  const amount = Number(formData.get("amount"));
  const description = (formData.get("description") as string) ?? "";
  const snapshotRaw = formData.get("snapshot") as string | null;

  if (!(amount > 0)) {
    return { error: "Jumlah dana yang diminta harus lebih dari 0." };
  }
  if (!description.trim()) {
    return { error: "Data permintaan tidak valid." };
  }

  let snapshot: Json | null = null;
  if (snapshotRaw) {
    try {
      snapshot = JSON.parse(snapshotRaw);
    } catch {
      snapshot = null;
    }
  }

  return { amount, description, snapshot };
}

export async function logPdoRequest(
  businessId: string,
  _prevState: PdoLogState,
  formData: FormData,
): Promise<PdoLogState> {
  const parsed = validatePdoForm(formData);
  if ("error" in parsed) return parsed;
  const { amount, description, snapshot } = parsed;

  const supabase = await createClient();
  const formattedAmount = `Rp${Math.round(amount).toLocaleString("id-ID")}`;

  const { error } = await supabase.from("activity_log").insert({
    business_id: businessId,
    type: "sistem",
    status: "info",
    title: `PDO ${formattedAmount}`,
    detail: description,
    data: snapshot,
  });
  if (error) return { error: error.message };

  revalidatePath(`/business/${businessId}/kas-kecil/pdo`);
  return { error: null };
}

export async function updatePdoRequest(
  businessId: string,
  activityLogId: string,
  _prevState: PdoLogState,
  formData: FormData,
): Promise<PdoLogState> {
  const parsed = validatePdoForm(formData);
  if ("error" in parsed) return parsed;
  const { amount, description, snapshot } = parsed;

  const supabase = await createClient();
  const formattedAmount = `Rp${Math.round(amount).toLocaleString("id-ID")}`;

  const { error } = await supabase
    .from("activity_log")
    .update({
      title: `PDO ${formattedAmount}`,
      detail: description,
      data: snapshot,
    })
    .eq("id", activityLogId)
    .eq("business_id", businessId);
  if (error) return { error: error.message };

  revalidatePath(`/business/${businessId}/kas-kecil/pdo`);
  return { error: null };
}
