"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const service = createServiceClient();
  const { data: adminRow } = await service
    .from("admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!adminRow) return null;

  return { user, service };
}

export type AdminInvoiceLineInput = { description: string; qty: number; unitPrice: number };

export type CreateAdminInvoiceInput = {
  businessId: string;
  date: string;
  dueDate: string | null;
  dpAmount: number;
  note: string | null;
  lines: AdminInvoiceLineInput[];
};

export type CreateAdminInvoiceResult = { error: string | null; invoiceId: string | null };

export async function createAdminInvoice(
  input: CreateAdminInvoiceInput,
): Promise<CreateAdminInvoiceResult> {
  const admin = await requireAdmin();
  if (!admin) return { error: "Akun ini bukan admin.", invoiceId: null };

  if (!input.businessId) return { error: "Bisnis wajib dipilih.", invoiceId: null };
  if (!input.date) return { error: "Tanggal wajib diisi.", invoiceId: null };

  const lines = input.lines
    .map((l) => ({ description: l.description.trim(), qty: Number(l.qty), unitPrice: Number(l.unitPrice) }))
    .filter((l) => l.description.length > 0);

  if (lines.length === 0) {
    return { error: "Minimal 1 item invoice harus diisi.", invoiceId: null };
  }
  for (const l of lines) {
    if (Number.isNaN(l.qty) || l.qty <= 0) {
      return { error: `Qty untuk "${l.description}" harus angka lebih dari 0.`, invoiceId: null };
    }
    if (Number.isNaN(l.unitPrice) || l.unitPrice < 0) {
      return { error: `Harga satuan untuk "${l.description}" tidak valid.`, invoiceId: null };
    }
  }

  const subtotal = Math.round(lines.reduce((sum, l) => sum + l.qty * l.unitPrice, 0));

  const dpAmount = Number(input.dpAmount) || 0;
  if (dpAmount < 0) {
    return { error: "DP tidak boleh negatif.", invoiceId: null };
  }
  if (dpAmount > subtotal) {
    return { error: "DP tidak boleh lebih besar dari subtotal.", invoiceId: null };
  }

  const status = dpAmount <= 0 ? "unpaid" : dpAmount >= subtotal ? "paid" : "partial";

  const dateCompact = input.date.replaceAll("-", "");
  const invoiceNumber = `ADM-${dateCompact}-${Date.now().toString().slice(-6)}`;

  const { data: invoice, error: invoiceError } = await admin.service
    .from("admin_invoices")
    .insert({
      business_id: input.businessId,
      invoice_number: invoiceNumber,
      date: input.date,
      due_date: input.dueDate || null,
      subtotal,
      dp_amount: dpAmount,
      status,
      note: input.note?.trim() || null,
      created_by: admin.user.id,
    })
    .select("id")
    .single();

  if (invoiceError || !invoice) {
    return { error: invoiceError?.message ?? "Gagal membuat invoice.", invoiceId: null };
  }

  const { error: linesError } = await admin.service.from("admin_invoice_lines").insert(
    lines.map((l) => ({
      invoice_id: invoice.id,
      description: l.description,
      qty: l.qty,
      unit_price: l.unitPrice,
    })),
  );

  if (linesError) {
    return {
      error: `Invoice tersimpan, tapi gagal menyimpan item (${linesError.message}). Hapus dan buat ulang invoice ini.`,
      invoiceId: invoice.id,
    };
  }

  revalidatePath("/admin/invoices");
  return { error: null, invoiceId: invoice.id };
}

export type MarkAdminInvoicePaidResult = { error: string | null };

export async function markAdminInvoicePaid(invoiceId: string): Promise<MarkAdminInvoicePaidResult> {
  const admin = await requireAdmin();
  if (!admin) return { error: "Akun ini bukan admin." };

  const { error } = await admin.service
    .from("admin_invoices")
    .update({ status: "paid" })
    .eq("id", invoiceId);

  if (error) return { error: error.message };

  revalidatePath("/admin/invoices");
  revalidatePath(`/admin/invoices/${invoiceId}`);
  return { error: null };
}
