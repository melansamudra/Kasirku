"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function deleteShift(businessId: string, shiftId: string) {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  const { data: business } = await supabase
    .from("businesses")
    .select("owner_id")
    .eq("id", businessId)
    .single();

  if (!business || business.owner_id !== userData.user?.id) {
    return { error: "Hanya pemilik yang bisa menghapus shift." };
  }

  const { error } = await supabase
    .from("shifts")
    .delete()
    .eq("id", shiftId)
    .eq("business_id", businessId);

  if (error) return { error: "Gagal menghapus shift." };

  revalidatePath(`/business/${businessId}/shifts`);
  return { error: null };
}
