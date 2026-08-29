"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";

function parseEmployeeFields(formData: FormData) {
  const name = (formData.get("name") as string)?.trim();
  const salaryTypeRaw = formData.get("salaryType") as string;
  const dailyRateRaw = formData.get("dailyRate") as string;
  const monthlyRateRaw = formData.get("monthlyRate") as string;
  const lemburRateRaw = formData.get("lemburRatePerHour") as string;
  const note = (formData.get("note") as string)?.trim();
  const cashierId = (formData.get("cashierId") as string) || null;
  const contractEnd = (formData.get("contractEnd") as string) || null;
  const locationId = (formData.get("locationId") as string) || null;

  if (!name) return { error: "Nama karyawan wajib diisi." } as const;

  const salaryType = salaryTypeRaw === "bulanan" ? "bulanan" : "harian";

  const dailyRate = dailyRateRaw ? Number(dailyRateRaw) : 0;
  if (Number.isNaN(dailyRate) || dailyRate < 0) {
    return { error: "Gaji harian harus angka dan tidak boleh negatif." } as const;
  }

  const monthlyRate = monthlyRateRaw ? Number(monthlyRateRaw) : 0;
  if (Number.isNaN(monthlyRate) || monthlyRate < 0) {
    return { error: "Gaji bulanan harus angka dan tidak boleh negatif." } as const;
  }

  // Kosong = pakai rate lembur default toko, bukan 0 — beda dari
  // dailyRate/monthlyRate yang defaultnya memang 0 kalau dikosongkan.
  let lemburRatePerHour: number | null = null;
  if (lemburRateRaw && lemburRateRaw.trim() !== "") {
    lemburRatePerHour = Number(lemburRateRaw);
    if (Number.isNaN(lemburRatePerHour) || lemburRatePerHour < 0) {
      return { error: "Rate lembur per jam harus angka dan tidak boleh negatif." } as const;
    }
  }

  return {
    error: null,
    name,
    salaryType,
    dailyRate,
    monthlyRate,
    lemburRatePerHour,
    note: note || null,
    cashierId,
    contractEnd,
    locationId,
  } as const;
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
    salary_type: parsed.salaryType,
    daily_rate: parsed.dailyRate,
    monthly_rate: parsed.monthlyRate,
    lembur_rate_per_hour: parsed.lemburRatePerHour,
    note: parsed.note,
    cashier_id: parsed.cashierId,
    contract_end: parsed.contractEnd,
    location_id: parsed.locationId,
  });

  if (error) {
    if (error.code === "23505") {
      return { error: "Akun kasir itu sudah dihubungkan ke karyawan lain." };
    }
    return { error: error.message };
  }

  await logActivity(supabase, businessId, "pengaturan", "sukses", `Karyawan baru: ${parsed.name}`);
  revalidatePath(`/business/${businessId}/employees`);
  if (parsed.locationId) {
    revalidatePath(`/business/${businessId}/lokasi/${parsed.locationId}/staf`);
  }
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
      salary_type: parsed.salaryType,
      daily_rate: parsed.dailyRate,
      monthly_rate: parsed.monthlyRate,
      lembur_rate_per_hour: parsed.lemburRatePerHour,
      note: parsed.note,
      cashier_id: parsed.cashierId,
      contract_end: parsed.contractEnd,
      location_id: parsed.locationId,
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

  const { error } = await supabase
    .from("employees")
    .update({ active })
    .eq("id", employeeId)
    .eq("business_id", businessId);
  if (error) {
    console.error(`setEmployeeActive gagal untuk employee ${employeeId}:`, error);
  }

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

export type SetPinState = { error: string | null };

// PIN Portal Lokasi -- terpisah total dari PIN kasir (cashiers.pin_hash).
// Hash dilakukan di RPC (pgcrypto), bukan di sini -- lihat migration
// 20260829040000_location_portal_pin.sql.
export async function setEmployeePin(
  businessId: string,
  employeeId: string,
  locationId: string,
  _prevState: SetPinState,
  formData: FormData,
): Promise<SetPinState> {
  const pin = formData.get("pin") as string;
  const confirmPin = formData.get("confirmPin") as string;

  if (!/^\d{4}$/.test(pin)) {
    return { error: "PIN harus 4 digit angka." };
  }
  if (pin !== confirmPin) {
    return { error: "PIN dan konfirmasi PIN tidak sama." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_employee_pin", {
    p_business_id: businessId,
    p_employee_id: employeeId,
    p_pin: pin,
  });

  if (error) {
    return { error: error.message };
  }

  await logActivity(supabase, businessId, "pengaturan", "info", "PIN Portal Lokasi diset/diganti untuk staf");
  revalidatePath(`/business/${businessId}/lokasi/${locationId}/staf`);
  return { error: null };
}
