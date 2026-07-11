"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";

function parseEmployeeFields(formData: FormData) {
  const name = (formData.get("name") as string)?.trim();
  const dailyRateRaw = formData.get("dailyRate") as string;
  const note = (formData.get("note") as string)?.trim();
  const cashierId = (formData.get("cashierId") as string) || null;

  if (!name) return { error: "Nama karyawan wajib diisi." } as const;

  const dailyRate = dailyRateRaw ? Number(dailyRateRaw) : 0;
  if (Number.isNaN(dailyRate) || dailyRate < 0) {
    return { error: "Gaji harian harus angka dan tidak boleh negatif." } as const;
  }

  return { error: null, name, dailyRate, note: note || null, cashierId } as const;
}

export type AddEmployeeState = { error: string | null };

export async function addEmployee(
  businessId: string,
  _prevState: AddEmployeeState,
  formData: FormData,
): Promise<AddEmployeeState> {
  const parsed = parseEmployeeFields(formData);
  if (parsed.error !== null) return { error: parsed.error };

  const supabase = await createClient();
  const { error } = await supabase.from("employees").insert({
    business_id: businessId,
    name: parsed.name,
    daily_rate: parsed.dailyRate,
    note: parsed.note,
    cashier_id: parsed.cashierId,
  });

  if (error) {
    if (error.code === "23505") {
      return { error: "Akun kasir itu sudah dihubungkan ke karyawan lain." };
    }
    return { error: error.message };
  }

  await logActivity(supabase, businessId, "pengaturan", "sukses", `Karyawan baru: ${parsed.name}`);
  revalidatePath(`/business/${businessId}/employees`);
  return { error: null };
}

export type EditEmployeeState = { error: string | null };

export async function editEmployee(
  businessId: string,
  employeeId: string,
  _prevState: EditEmployeeState,
  formData: FormData,
): Promise<EditEmployeeState> {
  const parsed = parseEmployeeFields(formData);
  if (parsed.error !== null) return { error: parsed.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("employees")
    .update({
      name: parsed.name,
      daily_rate: parsed.dailyRate,
      note: parsed.note,
      cashier_id: parsed.cashierId,
    })
    .eq("id", employeeId)
    .eq("business_id", businessId);

  if (error) {
    if (error.code === "23505") {
      return { error: "Akun kasir itu sudah dihubungkan ke karyawan lain." };
    }
    return { error: error.message };
  }

  await logActivity(supabase, businessId, "pengaturan", "info", `Karyawan diubah: ${parsed.name}`);
  revalidatePath(`/business/${businessId}/employees`);
  return { error: null };
}

export async function setEmployeeActive(businessId: string, employeeId: string, active: boolean) {
  const supabase = await createClient();

  const { data: employee } = await supabase
    .from("employees")
    .select("name")
    .eq("id", employeeId)
    .eq("business_id", businessId)
    .maybeSingle();

  await supabase
    .from("employees")
    .update({ active })
    .eq("id", employeeId)
    .eq("business_id", businessId);

  if (employee) {
    await logActivity(
      supabase,
      businessId,
      "pengaturan",
      active ? "sukses" : "warning",
      `Karyawan ${active ? "diaktifkan" : "dinonaktifkan"}: ${employee.name}`,
    );
  }
  revalidatePath(`/business/${businessId}/employees`);
}
