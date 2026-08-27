"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";
import { getPeriodRange } from "../reports/period";
import { wibDateString } from "@/lib/wib";
import { postPurchaseJournal } from "../purchases/actions";

export type ActionState = { error: string | null };

export async function reviewCashMovement(
  businessId: string,
  movementId: string,
  decision: "approve" | "reject",
  accountCode?: string,
): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("review_shift_cash_movement", {
    p_movement_id: movementId,
    p_decision: decision,
    p_account_code: accountCode || null,
  });

  if (error) return { error: error.message };

  await logActivity(
    supabase,
    businessId,
    "sistem",
    decision === "approve" ? "sukses" : "warning",
    decision === "approve" ? "Kas kecil disetujui" : "Kas kecil ditolak",
    decision === "approve" && accountCode ? `Akun: ${accountCode}` : undefined,
  );

  revalidatePath(`/business/${businessId}/kas-kecil`);
  revalidatePath(`/business/${businessId}/kas-harian`);
  revalidatePath(`/business/${businessId}/accounting/jurnal`);
  return { error: null };
}

// Kasbon karyawan -- terpisah dari addPettyCashExpense karena posting
// jurnalnya beda (lihat post_petty_cash_kasbon: debit 1-050/kredit 1-001
// sama, tapi reklas saat approve dipaksa ke "Piutang Karyawan", bukan akun
// beban pilihan bebas admin seperti nota tunai biasa).
export async function addPettyCashKasbon(
  businessId: string,
  employeeId: string,
  amount: number,
  note: string,
  date: string,
): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("post_petty_cash_kasbon", {
    p_business_id: businessId,
    p_employee_id: employeeId,
    p_amount: amount,
    p_note: note || null,
    p_date: date || null,
  });

  if (error) return { error: error.message };

  await logActivity(
    supabase,
    businessId,
    "sistem",
    "info",
    "Kasbon dicatat",
    `Rp${amount.toLocaleString("id-ID")}`,
  );

  revalidatePath(`/business/${businessId}/kas-kecil`);
  revalidatePath(`/business/${businessId}/kas-harian`);
  revalidatePath(`/business/${businessId}/payroll`);
  return { error: null };
}

export async function addPettyCashExpense(
  businessId: string,
  amount: number,
  description: string,
  category: string,
  receiptUrl?: string | null,
): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("post_petty_cash_expense", {
    p_business_id: businessId,
    p_amount: amount,
    p_description: description,
    p_category: category || null,
    p_receipt_url: receiptUrl || null,
  });

  if (error) return { error: error.message };

  await logActivity(
    supabase,
    businessId,
    "sistem",
    "info",
    `Kas Kecil (admin): ${description}`,
    `Rp${amount.toLocaleString("id-ID")}${category ? ` · ${category}` : ""}`,
  );

  revalidatePath(`/business/${businessId}/kas-kecil`);
  revalidatePath(`/business/${businessId}/kas-harian`);
  return { error: null };
}

// Catatan "petty cash diberikan ke kasir" — murni pembanding buat
// rekonsiliasi admin (petty cash diberikan vs total nota vs uang fisik yang
// dikembalikan kasir), tidak posting ke jurnal apa pun. Kalau perpindahan
// kasnya juga mau resmi tercatat di pembukuan, itu tetap lewat "Kas Masuk"
// biasa — ini cuma angka pembanding di halaman Kas Kecil.
export async function addPettyCashAllocation(
  businessId: string,
  date: string,
  amount: number,
  note?: string,
): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("petty_cash_allocations").insert({
    business_id: businessId,
    date,
    amount,
    note: note?.trim() || null,
    created_by: user?.id ?? null,
  });

  if (error) return { error: error.message };

  await logActivity(
    supabase,
    businessId,
    "sistem",
    "info",
    "Petty cash dicatat",
    `Rp${amount.toLocaleString("id-ID")}${note ? ` · ${note}` : ""} (${date})`,
  );

  revalidatePath(`/business/${businessId}/kas-kecil`);
  return { error: null };
}

// Input Nota Hutang dari admin (bukan kasir — kasir sudah tidak punya jalur
// input di POS, semua lewat halaman ini). Insert biasa, sama seperti
// addPettyCashAllocation — tidak posting ke jurnal apa pun, murni catatan
// menunggu diverifikasi lalu dialihkan ke Pembelian & Hutang.
export async function addSupplierDebtNoteAdmin(
  businessId: string,
  supplierId: string | null,
  supplierNameManual: string | null,
  category: "Bahan Baku" | "Bukan Bahan Baku",
  amount: number,
  note: string | null,
  receiptUrl: string | null,
): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("supplier_debt_notes").insert({
    business_id: businessId,
    supplier_id: supplierId,
    supplier_name_manual: supplierNameManual,
    category,
    amount,
    note,
    receipt_url: receiptUrl,
    origin: "admin",
    created_by_user_id: user?.id ?? null,
  });

  if (error) return { error: error.message };

  await logActivity(
    supabase,
    businessId,
    "sistem",
    "info",
    `Nota Hutang dicatat: ${supplierNameManual ?? "supplier terdaftar"}`,
    `Rp${amount.toLocaleString("id-ID")} · ${category}`,
  );

  revalidatePath(`/business/${businessId}/kas-kecil`);
  return { error: null };
}

// Verifikasi = langsung tercatat sebagai pembelian kategori "Lainnya" (tanpa
// item/qty — nota hutang cuma catatan nominal, bukan per-item) berstatus
// utang penuh, biar admin bisa verifikasi cepat 1-klik per nota tanpa mampir
// ke form. Efek sampingnya: stok bahan baku TIDAK ikut ter-update otomatis
// dari nota ini (beda dari alur "Permintaan Barang -> Catat sebagai
// Pembelian") — kalau perlu, dicatat manual terpisah lewat Pembelian & Hutang.
//
// Insert pembelian dulu baru tandai nota terverifikasi (bukan sebaliknya):
// kalau langkah kedua gagal, nota tetap "pending" dan admin akan lihat masih
// perlu diverifikasi (aman, walau retry-nya bisa dobel-insert pembelian —
// best-effort, sama seperti posting jurnal di addPurchase, lihat [[mini-erp-scope]]).
export async function verifyDebtNoteAsPurchase(businessId: string, noteId: string): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: noteRow, error: fetchError } = await supabase
    .from("supplier_debt_notes")
    .select("id, supplier_id, supplier_name_manual, category, amount, note, created_at, suppliers(name)")
    .eq("id", noteId)
    .eq("business_id", businessId)
    .eq("status", "pending")
    .maybeSingle();

  if (fetchError) return { error: fetchError.message };
  if (!noteRow) return { error: "Nota tidak ditemukan atau sudah diproses." };

  const note = noteRow as unknown as {
    id: string;
    supplier_id: string | null;
    supplier_name_manual: string | null;
    category: "Bahan Baku" | "Bukan Bahan Baku";
    amount: number;
    note: string | null;
    created_at: string;
    suppliers: { name: string } | null;
  };

  const supplierName = note.suppliers?.name ?? note.supplier_name_manual;
  const noteParts = [supplierName ? `Supplier: ${supplierName}` : null, note.note].filter(Boolean);
  const purchaseNote = noteParts.length > 0 ? noteParts.join(" — ") : null;
  const amount = Number(note.amount);
  const itemName = purchaseNote || "Pembelian";
  // Tanggal pembelian ikut tanggal nota aslinya diinput kasir, bukan tanggal
  // admin sempat verifikasi (bisa beda hari) -- biar Riwayat Pembelian &
  // umur utang mencerminkan kapan transaksinya benar-benar terjadi.
  const date = wibDateString(note.created_at);
  // Kategori akun ikut nota aslinya biar laporan pembelian bahan baku tetap
  // akurat — cuma "Bahan Baku" tanpa ingredient_id/qty (kolom itu boleh
  // null, lihat purchases_category_check), jadi stok tetap tidak tersentuh.
  const category = note.category === "Bahan Baku" ? "Bahan Baku" : "Lainnya";

  const { error: insertError } = await supabase.from("purchases").insert({
    business_id: businessId,
    supplier_id: note.supplier_id,
    date,
    due_date: null,
    category,
    ingredient_id: null,
    product_id: null,
    qty: 0,
    note: purchaseNote,
    amount,
    paid_amount: 0,
    stock_only: false,
  });

  if (insertError) return { error: insertError.message };

  const journalError = await postPurchaseJournal(supabase, businessId, date, `Pembelian: ${itemName}`, amount, 0);

  const { error: verifyError } = await supabase
    .from("supplier_debt_notes")
    .update({ status: "verified", verified_by: user?.id ?? null, verified_at: new Date().toISOString() })
    .eq("id", noteId)
    .eq("business_id", businessId)
    .eq("status", "pending");

  if (verifyError) return { error: verifyError.message };

  await logActivity(
    supabase,
    businessId,
    "sistem",
    journalError ? "warning" : "sukses",
    `Nota hutang dialihkan ke Pembelian: ${itemName}`,
    journalError
      ? `Rp${amount.toLocaleString("id-ID")} — GAGAL posting ke jurnal: ${journalError}`
      : `Rp${amount.toLocaleString("id-ID")} · masuk sebagai Utang Dagang`,
  );

  revalidatePath(`/business/${businessId}/kas-kecil`);
  revalidatePath(`/business/${businessId}/purchases`);
  return { error: null };
}

export async function deleteSupplierDebtNote(businessId: string, noteId: string): Promise<ActionState> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("supplier_debt_notes")
    .delete()
    .eq("id", noteId)
    .eq("business_id", businessId)
    .eq("status", "pending");

  if (error) return { error: error.message };

  revalidatePath(`/business/${businessId}/kas-kecil`);
  return { error: null };
}

export type PettyCashClosureSummary = {
  id: string;
  date: string;
  totalAllocated: number;
  totalTunai: number;
  totalHutang: number;
  hutangCount: number;
  expectedRemaining: number;
  actualRemaining: number;
  difference: number;
};

export type ClosePettyCashResult =
  | { success: true; summary: PettyCashClosureSummary }
  | { success: false; error: string };

// "Tutup Petty Cash" hari itu — sama fungsinya dengan close_shift() untuk
// shift kasir. Angka dihitung ulang di RPC (bukan dipercaya dari browser);
// p_from/p_to dihitung di sini pakai getPeriodRange yang sama dipakai
// halaman-halaman laporan lain, supaya logic batas hari WIB tidak
// diduplikasi.
export async function closePettyCash(
  businessId: string,
  date: string,
  actualRemaining: number,
  notes: string | null,
): Promise<ClosePettyCashResult> {
  const supabase = await createClient();
  const { fromIso, toIsoExclusive } = getPeriodRange("custom", date, date);

  const { data, error } = await supabase
    .rpc("close_petty_cash", {
      p_business_id: businessId,
      p_date: date,
      p_from: fromIso ?? `${date}T00:00:00+07:00`,
      p_to: toIsoExclusive ?? `${date}T23:59:59+07:00`,
      p_actual_remaining: actualRemaining,
      p_notes: notes || null,
    })
    .single();

  if (error || !data) {
    return { success: false, error: error?.message ?? "Gagal menutup petty cash." };
  }

  const summary: PettyCashClosureSummary = {
    id: data.id,
    date: data.date,
    totalAllocated: Number(data.total_allocated),
    totalTunai: Number(data.total_tunai),
    totalHutang: Number(data.total_hutang),
    hutangCount: data.hutang_count,
    expectedRemaining: Number(data.expected_remaining),
    actualRemaining: Number(data.actual_remaining),
    difference: Number(data.difference),
  };

  try {
    await logActivity(
      supabase,
      businessId,
      "sistem",
      summary.difference === 0 ? "sukses" : "warning",
      "Petty cash ditutup",
      `${date} · Sisa ${summary.actualRemaining.toLocaleString("id-ID")} · Selisih ${summary.difference.toLocaleString("id-ID")}`,
    );
  } catch (err) {
    console.error(`closePettyCash: closure ${summary.id} sukses tapi log aktivitas gagal:`, err);
  }

  revalidatePath(`/business/${businessId}/kas-kecil`);
  return { success: true, summary };
}
