"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";

export type InvoiceLineInput = { description: string; qty: number; unitPrice: number };

export type CreateInvoiceInput = {
  customerId: string | null;
  customerName: string;
  date: string;
  dueDate: string | null;
  dpAmount: number;
  note: string | null;
  lines: InvoiceLineInput[];
};

export type CreateInvoiceResult = { error: string | null; invoiceId: string | null };

export async function createInvoice(
  businessId: string,
  input: CreateInvoiceInput,
): Promise<CreateInvoiceResult> {
  const customerName = input.customerName.trim();
  if (!customerName) {
    return { error: "Nama klien wajib diisi.", invoiceId: null };
  }
  if (!input.date) {
    return { error: "Tanggal wajib diisi.", invoiceId: null };
  }

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
  const invoiceNumber = `INV-${dateCompact}-${Date.now().toString().slice(-6)}`;

  const supabase = await createClient();

  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .insert({
      business_id: businessId,
      customer_id: input.customerId,
      customer_name: customerName,
      invoice_number: invoiceNumber,
      date: input.date,
      due_date: input.dueDate || null,
      subtotal,
      dp_amount: dpAmount,
      status,
      note: input.note?.trim() || null,
    })
    .select("id")
    .single();

  if (invoiceError || !invoice) {
    return { error: invoiceError?.message ?? "Gagal membuat invoice.", invoiceId: null };
  }

  const { error: linesError } = await supabase.from("invoice_lines").insert(
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

  await logActivity(supabase, businessId, "sistem", "sukses", `Invoice dibuat: ${invoiceNumber} — ${customerName}`);
  revalidatePath(`/business/${businessId}/invoices`);
  return { error: null, invoiceId: invoice.id };
}

export type MarkInvoicePaidResult = { error: string | null };

export async function markInvoicePaid(
  businessId: string,
  invoiceId: string,
): Promise<MarkInvoicePaidResult> {
  const supabase = await createClient();

  const { data: invoice } = await supabase
    .from("invoices")
    .select("invoice_number")
    .eq("id", invoiceId)
    .eq("business_id", businessId)
    .maybeSingle();

  if (!invoice) {
    return { error: "Invoice tidak ditemukan." };
  }

  const { error } = await supabase
    .from("invoices")
    .update({ status: "paid" })
    .eq("id", invoiceId)
    .eq("business_id", businessId);

  if (error) {
    return { error: error.message };
  }

  await logActivity(supabase, businessId, "sistem", "sukses", `Invoice ditandai lunas: ${invoice.invoice_number}`);
  revalidatePath(`/business/${businessId}/invoices`);
  revalidatePath(`/business/${businessId}/invoices/${invoiceId}`);
  return { error: null };
}
