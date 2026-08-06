"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";

export type BannerState = { error: string | null; saved?: boolean };

export async function saveSelfOrderBanner(
  businessId: string,
  _prevState: BannerState,
  formData: FormData,
): Promise<BannerState> {
  const banner = (formData.get("banner") as string)?.trim() || null;
  const supabase = await createClient();
  const { error } = await supabase
    .from("businesses")
    .update({ self_order_banner: banner })
    .eq("id", businessId);
  if (error) return { error: error.message };
  revalidatePath(`/business/${businessId}/settings`);
  return { error: null, saved: true };
}

export type PaymentMethodState = { error: string | null };

export async function addPaymentMethod(
  businessId: string,
  _prevState: PaymentMethodState,
  formData: FormData,
): Promise<PaymentMethodState> {
  const name = (formData.get("name") as string)?.trim();

  if (!name) {
    return { error: "Nama metode pembayaran wajib diisi." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("custom_payment_methods").insert({
    business_id: businessId,
    name,
  });

  if (error) {
    return { error: error.message };
  }

  await logActivity(
    supabase,
    businessId,
    "pengaturan",
    "sukses",
    `Metode pembayaran baru: ${name}`,
  );
  revalidatePath(`/business/${businessId}/settings`);
  return { error: null };
}

export async function deletePaymentMethod(businessId: string, methodId: string) {
  const supabase = await createClient();
  await supabase.from("custom_payment_methods").delete().eq("id", methodId).eq("business_id", businessId);
  revalidatePath(`/business/${businessId}/settings`);
}

export type KitchenPrinterState = { error: string | null };

export async function addKitchenPrinter(
  businessId: string,
  _prevState: KitchenPrinterState,
  formData: FormData,
): Promise<KitchenPrinterState> {
  const name = (formData.get("name") as string)?.trim();
  const connectionType = formData.get("connectionType") as string;
  const address = (formData.get("address") as string)?.trim();
  const deviceLabel = (formData.get("deviceLabel") as string)?.trim();
  const categories = formData.getAll("categories").map((c) => String(c));
  const printsReceipt = formData.get("printsReceipt") === "on";
  const paperWidth = Number(formData.get("paperWidth")) || 58;

  if (!name) {
    return { error: "Nama stasiun printer wajib diisi." };
  }
  if (connectionType !== "bluetooth" && connectionType !== "lan") {
    return { error: "Pilih jenis koneksi dulu." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("kitchen_printers").insert({
    business_id: businessId,
    name,
    connection_type: connectionType,
    address: address || null,
    device_label: deviceLabel || null,
    categories,
    prints_receipt: printsReceipt,
    paper_width: paperWidth,
  });

  if (error) {
    return { error: error.message };
  }

  await logActivity(
    supabase,
    businessId,
    "pengaturan",
    "sukses",
    `Printer dapur baru: ${name}`,
    connectionType === "lan"
      ? `LAN${address ? ` · ${address}` : ""}`
      : `Bluetooth${deviceLabel ? ` · ${deviceLabel}` : ""}`,
  );
  revalidatePath(`/business/${businessId}/settings`);
  return { error: null };
}

export async function updateKitchenPrinter(
  businessId: string,
  printerId: string,
  _prevState: KitchenPrinterState,
  formData: FormData,
): Promise<KitchenPrinterState> {
  const name = (formData.get("name") as string)?.trim();
  const connectionType = formData.get("connectionType") as string;
  const address = (formData.get("address") as string)?.trim();
  const deviceLabel = (formData.get("deviceLabel") as string)?.trim();
  const categories = formData.getAll("categories").map((c) => String(c));
  const printsReceipt = formData.get("printsReceipt") === "on";
  const paperWidth = Number(formData.get("paperWidth")) || 58;

  if (!name) return { error: "Nama stasiun printer wajib diisi." };
  if (connectionType !== "bluetooth" && connectionType !== "lan") {
    return { error: "Pilih jenis koneksi dulu." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("kitchen_printers")
    .update({
      name,
      connection_type: connectionType,
      address: address || null,
      device_label: deviceLabel || null,
      categories,
      prints_receipt: printsReceipt,
      paper_width: paperWidth,
    })
    .eq("id", printerId)
    .eq("business_id", businessId);

  if (error) return { error: error.message };

  await logActivity(
    supabase,
    businessId,
    "pengaturan",
    "info",
    `Printer diubah: ${name}`,
    connectionType === "lan"
      ? `LAN${address ? ` · ${address}` : ""}`
      : `Bluetooth${deviceLabel ? ` · ${deviceLabel}` : ""}`,
  );
  revalidatePath(`/business/${businessId}/settings`);
  return { error: null };
}

export async function deleteKitchenPrinter(businessId: string, printerId: string) {
  const supabase = await createClient();
  await supabase.from("kitchen_printers").delete().eq("id", printerId).eq("business_id", businessId);
  revalidatePath(`/business/${businessId}/settings`);
}

export async function setKitchenPrinterPrintsReceipt(
  businessId: string,
  printerId: string,
  printsReceipt: boolean,
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("kitchen_printers")
    .update({ prints_receipt: printsReceipt })
    .eq("id", printerId)
    .eq("business_id", businessId);

  if (!error) {
    await logActivity(
      supabase,
      businessId,
      "pengaturan",
      "info",
      printsReceipt
        ? "Printer diatur mencetak struk pelanggan otomatis"
        : "Printer tidak lagi mencetak struk pelanggan otomatis",
    );
  }
  revalidatePath(`/business/${businessId}/settings`);
}

export type TicketCategoryState = { error: string | null };

type ParsedTicketCategoryFields =
  | { error: string }
  | {
      error: null;
      name: string;
      priceWeekday: number;
      priceHoliday: number;
      memberPrice: number;
      groupMinQty: number;
      groupPrice: number | null;
    };

function parseTicketCategoryFields(formData: FormData): ParsedTicketCategoryFields {
  const name = (formData.get("name") as string)?.trim();
  const priceWeekday = Number(formData.get("priceWeekday"));
  const priceHoliday = Number(formData.get("priceHoliday"));
  const memberPrice = Number(formData.get("memberPrice"));
  const groupMinQtyRaw = (formData.get("groupMinQty") as string)?.trim();
  const groupPriceRaw = (formData.get("groupPrice") as string)?.trim();

  if (!name) return { error: "Nama kategori wajib diisi." };
  if (Number.isNaN(priceWeekday) || priceWeekday < 0) {
    return { error: "Harga hari kerja harus angka dan tidak boleh negatif." };
  }
  if (Number.isNaN(priceHoliday) || priceHoliday < 0) {
    return { error: "Harga hari libur harus angka dan tidak boleh negatif." };
  }
  if (Number.isNaN(memberPrice) || memberPrice < 0) {
    return { error: "Harga member harus angka dan tidak boleh negatif." };
  }

  const groupMinQty = groupMinQtyRaw ? Number(groupMinQtyRaw) : 0;
  if (Number.isNaN(groupMinQty) || groupMinQty < 0) {
    return { error: "Minimal qty rombongan harus angka dan tidak boleh negatif." };
  }
  const groupPrice = groupPriceRaw ? Number(groupPriceRaw) : null;
  if (groupPrice !== null && (Number.isNaN(groupPrice) || groupPrice < 0)) {
    return { error: "Harga rombongan harus angka dan tidak boleh negatif." };
  }

  return { error: null, name, priceWeekday, priceHoliday, memberPrice, groupMinQty, groupPrice };
}

export async function addTicketCategory(
  businessId: string,
  _prevState: TicketCategoryState,
  formData: FormData,
): Promise<TicketCategoryState> {
  const parsed = parseTicketCategoryFields(formData);
  if (parsed.error !== null) return { error: parsed.error };

  const supabase = await createClient();
  const { error } = await supabase.from("ticket_categories").insert({
    business_id: businessId,
    name: parsed.name,
    price_weekday: parsed.priceWeekday,
    price_holiday: parsed.priceHoliday,
    member_price: parsed.memberPrice,
    group_min_qty: parsed.groupMinQty,
    group_price: parsed.groupPrice,
  });

  if (error) {
    if (error.code === "23505") {
      return { error: "Nama kategori sudah dipakai." };
    }
    return { error: error.message };
  }

  await logActivity(
    supabase,
    businessId,
    "pengaturan",
    "sukses",
    `Kategori tiket baru: ${parsed.name}`,
  );
  revalidatePath(`/business/${businessId}/settings`);
  return { error: null };
}

export async function updateTicketCategory(
  businessId: string,
  categoryId: string,
  _prevState: TicketCategoryState,
  formData: FormData,
): Promise<TicketCategoryState> {
  const parsed = parseTicketCategoryFields(formData);
  if (parsed.error !== null) return { error: parsed.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("ticket_categories")
    .update({
      name: parsed.name,
      price_weekday: parsed.priceWeekday,
      price_holiday: parsed.priceHoliday,
      member_price: parsed.memberPrice,
      group_min_qty: parsed.groupMinQty,
      group_price: parsed.groupPrice,
    })
    .eq("id", categoryId)
    .eq("business_id", businessId);

  if (error) {
    if (error.code === "23505") {
      return { error: "Nama kategori sudah dipakai." };
    }
    return { error: error.message };
  }

  await logActivity(
    supabase,
    businessId,
    "pengaturan",
    "info",
    `Kategori tiket diubah: ${parsed.name}`,
  );
  revalidatePath(`/business/${businessId}/settings`);
  return { error: null };
}

export async function deleteTicketCategory(businessId: string, categoryId: string) {
  const supabase = await createClient();
  await supabase
    .from("ticket_categories")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", categoryId)
    .eq("business_id", businessId);
  revalidatePath(`/business/${businessId}/settings`);
}

export type TicketHolidayState = { error: string | null };

export async function addTicketHoliday(
  businessId: string,
  _prevState: TicketHolidayState,
  formData: FormData,
): Promise<TicketHolidayState> {
  const holidayDate = formData.get("holidayDate") as string;
  const label = (formData.get("label") as string)?.trim();

  if (!holidayDate || !/^\d{4}-\d{2}-\d{2}$/.test(holidayDate)) {
    return { error: "Tanggal libur wajib diisi." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("ticket_holidays").insert({
    business_id: businessId,
    holiday_date: holidayDate,
    label: label || null,
  });

  if (error) {
    if (error.code === "23505") {
      return { error: "Tanggal ini sudah ditandai sebagai hari libur." };
    }
    return { error: error.message };
  }

  await logActivity(
    supabase,
    businessId,
    "pengaturan",
    "sukses",
    `Hari libur ditandai: ${holidayDate}`,
    label || undefined,
  );
  revalidatePath(`/business/${businessId}/settings`);
  return { error: null };
}

export async function deleteTicketHoliday(businessId: string, holidayId: string) {
  const supabase = await createClient();
  await supabase
    .from("ticket_holidays")
    .delete()
    .eq("id", holidayId)
    .eq("business_id", businessId);
  revalidatePath(`/business/${businessId}/settings`);
}

export type BusinessTypeState = { error: string | null; saved: boolean };

const BUSINESS_TYPE_LABELS: Record<string, string> = {
  fnb: "F&B",
};

export async function updateBusinessType(
  businessId: string,
  _prevState: BusinessTypeState,
  formData: FormData,
): Promise<BusinessTypeState> {
  const businessType = formData.get("businessType") as string;

  if (!["fnb"].includes(businessType)) {
    return { error: "Pilih jenis usaha dulu.", saved: false };
  }

  const supabase = await createClient();

  const [{ data: tx }, { data: ticketTx }] = await Promise.all([
    supabase.from("transactions").select("id").eq("business_id", businessId).limit(1),
    supabase.from("ticket_transactions").select("id").eq("business_id", businessId).limit(1),
  ]);

  if ((tx && tx.length > 0) || (ticketTx && ticketTx.length > 0)) {
    return {
      error:
        "Toko ini sudah punya transaksi, jenis usaha tidak bisa diganti lagi. Hubungi kami kalau butuh bantuan.",
      saved: false,
    };
  }

  const { error } = await supabase
    .from("businesses")
    .update({ business_type: businessType })
    .eq("id", businessId);

  if (error) {
    return { error: error.message, saved: false };
  }

  await logActivity(
    supabase,
    businessId,
    "pengaturan",
    "sukses",
    `Jenis usaha diubah ke ${BUSINESS_TYPE_LABELS[businessType]}`,
  );
  revalidatePath(`/business/${businessId}`, "layout");
  return { error: null, saved: true };
}

export type BusinessProfileState = { error: string | null; saved?: boolean };

export async function updateBusinessProfile(
  businessId: string,
  _prevState: BusinessProfileState,
  formData: FormData,
): Promise<BusinessProfileState> {
  const name = (formData.get("name") as string)?.trim();
  const address = (formData.get("address") as string)?.trim() || null;
  const phone = (formData.get("phone") as string)?.trim() || null;

  if (!name) return { error: "Nama toko tidak boleh kosong." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("businesses")
    .update({ name, address, phone })
    .eq("id", businessId);

  if (error) return { error: error.message };
  revalidatePath(`/business/${businessId}`, "layout");
  return { error: null, saved: true };
}

export type DiscountRuleState = { error: string | null };

export async function addProductDiscountRule(
  businessId: string,
  _prevState: DiscountRuleState,
  formData: FormData,
): Promise<DiscountRuleState> {
  const productId = (formData.get("productId") as string)?.trim();
  const valueRaw = Number(formData.get("value"));
  const valueType = formData.get("valueType") as string;

  if (!productId) return { error: "Pilih menu dulu." };
  if (!["pct", "amt"].includes(valueType)) return { error: "Pilih tipe diskon." };
  if (Number.isNaN(valueRaw) || valueRaw < 0) return { error: "Nilai diskon tidak valid." };
  if (valueType === "pct" && valueRaw > 100) return { error: "Diskon persen maksimal 100%." };

  const supabase = await createClient();
  const { error } = await supabase.from("discount_rules").insert({
    business_id: businessId,
    type: "per_product",
    product_id: productId,
    value: valueRaw,
    value_type: valueType,
    active: true,
  });

  if (error) return { error: error.message };

  revalidatePath(`/business/${businessId}/settings`);
  return { error: null };
}

export async function addPromoDiscountRule(
  businessId: string,
  _prevState: DiscountRuleState,
  formData: FormData,
): Promise<DiscountRuleState> {
  const name = (formData.get("name") as string)?.trim();
  const valueRaw = Number(formData.get("value"));
  const valueType = formData.get("valueType") as string;
  const validFrom = (formData.get("validFrom") as string)?.trim() || null;
  const validUntil = (formData.get("validUntil") as string)?.trim() || null;

  if (!name) return { error: "Nama promo wajib diisi." };
  if (!["pct", "amt"].includes(valueType)) return { error: "Pilih tipe diskon." };
  if (Number.isNaN(valueRaw) || valueRaw < 0) return { error: "Nilai diskon tidak valid." };
  if (valueType === "pct" && valueRaw > 100) return { error: "Diskon persen maksimal 100%." };

  const supabase = await createClient();
  const { error } = await supabase.from("discount_rules").insert({
    business_id: businessId,
    type: "promo",
    name,
    value: valueRaw,
    value_type: valueType,
    active: true,
    valid_from: validFrom || null,
    valid_until: validUntil || null,
  });

  if (error) return { error: error.message };

  revalidatePath(`/business/${businessId}/settings`);
  return { error: null };
}

export async function deleteDiscountRule(businessId: string, ruleId: string) {
  const supabase = await createClient();
  await supabase.from("discount_rules").delete().eq("id", ruleId).eq("business_id", businessId);
  revalidatePath(`/business/${businessId}/settings`);
}

export async function toggleDiscountRuleActive(businessId: string, ruleId: string, active: boolean) {
  const supabase = await createClient();
  await supabase.from("discount_rules").update({ active }).eq("id", ruleId).eq("business_id", businessId);
  revalidatePath(`/business/${businessId}/settings`);
}

export type TaxServiceState = { error: string | null; saved: boolean };

export async function updateTaxService(
  businessId: string,
  _prevState: TaxServiceState,
  formData: FormData,
): Promise<TaxServiceState> {
  const taxEnabled = formData.get("taxEnabled") === "on";
  const serviceEnabled = formData.get("serviceEnabled") === "on";
  const taxRate = Number(formData.get("taxRate"));
  const serviceRate = Number(formData.get("serviceRate"));

  if (taxEnabled && (Number.isNaN(taxRate) || taxRate < 0 || taxRate > 100)) {
    return { error: "Tarif PPN harus 0–100%.", saved: false };
  }
  if (serviceEnabled && (Number.isNaN(serviceRate) || serviceRate < 0 || serviceRate > 100)) {
    return { error: "Tarif biaya layanan harus 0–100%.", saved: false };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("businesses")
    .update({
      tax_enabled: taxEnabled,
      tax_rate: taxEnabled ? taxRate : 0,
      service_enabled: serviceEnabled,
      service_rate: serviceEnabled ? serviceRate : 0,
    })
    .eq("id", businessId);

  if (error) {
    return { error: error.message, saved: false };
  }

  await logActivity(
    supabase,
    businessId,
    "pengaturan",
    "sukses",
    "Pajak & biaya layanan diperbarui",
    `PPN ${taxEnabled ? `${taxRate}%` : "nonaktif"} · Layanan ${serviceEnabled ? `${serviceRate}%` : "nonaktif"}`,
  );
  revalidatePath(`/business/${businessId}/settings`);
  return { error: null, saved: true };
}

export async function saveReceiptSettings(
  businessId: string,
  settings: Record<string, unknown>,
): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from("businesses")
    .update({ receipt_settings: settings })
    .eq("id", businessId);
  revalidatePath(`/business/${businessId}/settings`);
}

