"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type CreateBusinessState = { error: string | null };

export async function createBusiness(
  _prevState: CreateBusinessState,
  formData: FormData,
): Promise<CreateBusinessState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const name = (formData.get("name") as string)?.trim();
  const businessType = formData.get("business_type") as string;

  if (!name) {
    return { error: "Nama toko wajib diisi." };
  }
  if (businessType !== "fnb" && businessType !== "retail" && businessType !== "tiket") {
    return { error: "Pilih jenis bisnis dulu." };
  }

  const { data: business, error } = await supabase
    .from("businesses")
    .insert({
      owner_id: user.id,
      name,
      business_type: businessType,
    })
    .select("id")
    .single();

  if (error || !business) {
    return { error: error?.message ?? "Gagal membuat bisnis." };
  }

  // Belum ada trial — pemilik baru harus pilih & bayar paket dulu sebelum
  // bisa masuk ke dashboard/kasir (lihat gating di layout.tsx dashboard & pos).
  const { error: subscriptionError } = await supabase.from("subscriptions").insert({
    business_id: business.id,
    plan_code: "",
    status: "unpaid",
  });

  if (subscriptionError) {
    return { error: subscriptionError.message };
  }

  redirect(`/business/${business.id}/billing`);
}
