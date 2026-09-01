"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";
import { getCurrentActor, canApprovePo, canApprovePoLevel1, type CurrentActor } from "@/lib/current-actor";

export type ActionState = { error: string | null };

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Cek "boleh approve PO ini atau tidak" dari sisi IDENTITAS (bukan
// permission -- itu sudah dicek terpisah lewat canApprovePo). Ditemukan
// audit 2026-08-31, 2 celah:
// 1. PO yang di-merge (barang ditambahkan ke PO "issued" oleh akun LAIN dari
//    penerbit pertama, lihat forwardAllocationsToSupplier) -- akun kedua itu
//    tidak pernah tercatat di `issued_by_user_id` tunggal, jadi bisa lolos
//    approve PO yang sebagian isinya dia sendiri minta. Fix: cek ke tabel
//    purchase_order_contributors (SEMUA akun yang pernah menerbitkan/nambah
//    barang ke PO ini), bukan cuma issued_by_user_id.
// 2. PO lama (dibuat sebelum kolom issued_by_user_id ada, jadi NULL) bikin
//    pengecekan lama `if (issued_by_user_id && ...)` diam-diam DILEWATI
//    TOTAL (fail-open). Fix: fail-closed -- PO tanpa identitas penerbit
//    cuma boleh diproses Owner.
export async function findApprovalBlockReason(
  supabase: SupabaseServerClient,
  poId: string,
  issuedByUserId: string | null,
  actor: CurrentActor,
): Promise<string | null> {
  if (!issuedByUserId) {
    return actor.isOwner
      ? null
      : "PO ini dibuat sebelum sistem identitas penerbit ada (data lama) — hanya akun Owner yang bisa menyetujuinya.";
  }
  if (issuedByUserId === actor.userId) {
    return "Tidak bisa menyetujui PO yang Anda terbitkan sendiri.";
  }
  const { data: contributors } = await supabase
    .from("purchase_order_contributors")
    .select("user_id")
    .eq("purchase_order_id", poId);
  if ((contributors ?? []).some((c) => c.user_id === actor.userId)) {
    return "Tidak bisa menyetujui PO ini — Anda ikut menambahkan barang ke PO gabungan ini.";
  }
  return null;
}

export async function approvePurchaseOrder(businessId: string, poId: string): Promise<ActionState> {
  const supabase = await createClient();

  const actor = await getCurrentActor(supabase, businessId);
  if (!actor) return { error: "Sesi login tidak ditemukan. Silakan login ulang." };

  const { data: po } = await supabase
    .from("purchase_orders")
    .select("id, po_number, status, issued_by_user_id, approval_levels, level1_approved_at, level1_approved_by_user_id")
    .eq("id", poId)
    .eq("business_id", businessId)
    .single();
  if (!po) return { error: "PO tidak ditemukan." };
  if (po.status !== "issued") return { error: "PO ini sudah diproses sebelumnya." };

  const isTwoLevel = po.approval_levels === 2;
  const level1Pending = isTwoLevel && po.level1_approved_at === null;

  if (level1Pending) {
    if (!canApprovePoLevel1(actor)) {
      return { error: "Akun Anda tidak punya izin Setujui PO Level 1. Minta Owner aktifkan permission ini." };
    }
    const blockReason = await findApprovalBlockReason(supabase, poId, po.issued_by_user_id, actor);
    if (blockReason) return { error: blockReason };

    // .eq("level1_approved_at", null) di klausa UPDATE -- mencegah race 2
    // approve Level 1 nyaris bersamaan sama-sama lolos pengecekan di atas.
    const { data: updated, error } = await supabase
      .from("purchase_orders")
      .update({
        level1_approved_by: actor.name,
        level1_approved_by_user_id: actor.userId,
        level1_approved_at: new Date().toISOString(),
      })
      .eq("id", poId)
      .eq("business_id", businessId)
      .eq("status", "issued")
      .is("level1_approved_at", null)
      .select("id")
      .maybeSingle();

    if (error) return { error: error.message };
    if (!updated) return { error: "PO ini baru saja diproses pihak lain — refresh halaman untuk lihat status terbaru." };

    await logActivity(supabase, businessId, "produk", "sukses", `PO disetujui (Level 1): ${po.po_number}`, `Oleh ${actor.name}`);
    revalidatePath(`/business/${businessId}/purchase-orders`);
    revalidatePath(`/business/${businessId}/purchase-orders/${poId}`);
    return { error: null };
  }

  // Approval final (Level 2 kalau 2-level, atau satu-satunya level kalau 1-level).
  if (isTwoLevel) {
    if (!actor.isOwner) {
      return { error: "PO ini butuh persetujuan Level 2 (Owner)." };
    }
    if (po.level1_approved_by_user_id && actor.userId === po.level1_approved_by_user_id) {
      return { error: "Tidak bisa menyetujui Level 2 untuk PO yang Anda sendiri setujui di Level 1." };
    }
  } else if (!canApprovePo(actor)) {
    return { error: "Akun Anda tidak punya izin Setujui PO. Minta Owner aktifkan permission ini." };
  }

  const blockReason = await findApprovalBlockReason(supabase, poId, po.issued_by_user_id, actor);
  if (blockReason) return { error: blockReason };

  // .eq("status", "issued") di klausa UPDATE-nya sendiri (bukan cuma dicek
  // terpisah di atas) -- mencegah race 2 approve/reject nyaris bersamaan
  // sama-sama lolos pengecekan status yang sama lalu dua-duanya jalan.
  const { data: updated, error } = await supabase
    .from("purchase_orders")
    .update({
      status: "approved",
      approved_by: actor.name,
      approved_by_user_id: actor.userId,
      approved_at: new Date().toISOString(),
    })
    .eq("id", poId)
    .eq("business_id", businessId)
    .eq("status", "issued")
    .select("id")
    .maybeSingle();

  if (error) return { error: error.message };
  if (!updated) return { error: "PO ini baru saja diproses pihak lain — refresh halaman untuk lihat status terbaru." };

  await logActivity(supabase, businessId, "produk", "sukses", `PO disetujui: ${po.po_number}`, `Oleh ${actor.name}`);
  revalidatePath(`/business/${businessId}/purchase-orders`);
  revalidatePath(`/business/${businessId}/purchase-orders/${poId}`);
  return { error: null };
}

export async function rejectPurchaseOrder(businessId: string, poId: string, reason: string): Promise<ActionState> {
  if (!reason.trim()) {
    return { error: "Alasan penolakan wajib diisi." };
  }

  const supabase = await createClient();

  const actor = await getCurrentActor(supabase, businessId);
  if (!actor) return { error: "Sesi login tidak ditemukan. Silakan login ulang." };
  if (!canApprovePo(actor)) {
    return { error: "Akun Anda tidak punya izin Setujui PO. Minta Owner aktifkan permission ini." };
  }

  const { data: po } = await supabase
    .from("purchase_orders")
    .select("id, po_number, status")
    .eq("id", poId)
    .eq("business_id", businessId)
    .single();
  if (!po) return { error: "PO tidak ditemukan." };
  if (po.status !== "issued") return { error: "PO ini sudah diproses sebelumnya." };

  const { data: updated, error } = await supabase
    .from("purchase_orders")
    .update({ status: "rejected", note: reason.trim() })
    .eq("id", poId)
    .eq("business_id", businessId)
    .eq("status", "issued")
    .select("id")
    .maybeSingle();

  if (error) return { error: error.message };
  if (!updated) return { error: "PO ini baru saja diproses pihak lain — refresh halaman untuk lihat status terbaru." };

  await logActivity(supabase, businessId, "produk", "warning", `PO ditolak: ${po.po_number}`, `Oleh ${actor.name} — ${reason.trim()}`);
  revalidatePath(`/business/${businessId}/purchase-orders`);
  revalidatePath(`/business/${businessId}/purchase-orders/${poId}`);
  return { error: null };
}
