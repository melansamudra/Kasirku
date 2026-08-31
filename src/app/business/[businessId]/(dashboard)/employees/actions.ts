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
  const dailyMealAllowanceRaw = formData.get("dailyMealAllowance") as string;
  const dailyAttendanceAllowanceRaw = formData.get("dailyAttendanceAllowance") as string;
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

  const dailyMealAllowance = dailyMealAllowanceRaw ? Number(dailyMealAllowanceRaw) : 0;
  if (Number.isNaN(dailyMealAllowance) || dailyMealAllowance < 0) {
    return { error: "Uang makan harian harus angka dan tidak boleh negatif." } as const;
  }

  const dailyAttendanceAllowance = dailyAttendanceAllowanceRaw ? Number(dailyAttendanceAllowanceRaw) : 0;
  if (Number.isNaN(dailyAttendanceAllowance) || dailyAttendanceAllowance < 0) {
    return { error: "Tunjangan kehadiran harian harus angka dan tidak boleh negatif." } as const;
  }

  return {
    error: null,
    name,
    salaryType,
    dailyRate,
    monthlyRate,
    lemburRatePerHour,
    dailyMealAllowance,
    dailyAttendanceAllowance,
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
    daily_meal_allowance: parsed.dailyMealAllowance,
    daily_attendance_allowance: parsed.dailyAttendanceAllowance,
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
      daily_meal_allowance: parsed.dailyMealAllowance,
      daily_attendance_allowance: parsed.dailyAttendanceAllowance,
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

// Soft-delete -- baris TIDAK dihapus fisik supaya riwayat lama (absensi,
// payroll, produksi, dll) tetap utuh, cuma disembunyikan dari daftar &
// semua dropdown pemilihan nama. Set active=false SEKALIAN karena semua
// query "pilih karyawan" lain di aplikasi ini sudah filter eq("active",
// true) -- jadi otomatis ikut hilang dari sana tanpa perlu ubah 12+ file
// lain satu-satu.
export async function deleteEmployee(businessId: string, employeeId: string) {
  const supabase = await createClient();

  const { data: employee } = await supabase
    .from("employees")
    .select("name")
    .eq("id", employeeId)
    .eq("business_id", businessId)
    .maybeSingle();

  await supabase
    .from("employees")
    .update({ deleted_at: new Date().toISOString(), active: false })
    .eq("id", employeeId)
    .eq("business_id", businessId);

  if (employee) {
    await logActivity(
      supabase,
      businessId,
      "pengaturan",
      "warning",
      `Karyawan dihapus: ${employee.name}`,
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

export type AddPersonalLoanState = { error: string | null };

// Pinjaman Pribadi -- BEDA dari Kasbon (yang lewat Kas Kecil, ada jurnal
// & kas beneran keluar). Ini cuma catatan/tanda, tidak menyentuh kas atau
// jurnal sama sekali -- lihat migration 20260830130000. Potongannya nanti
// dipilih manual per-slip di halaman detail slip gaji (mirip Kasbon).
export async function addPersonalLoan(
  businessId: string,
  employeeId: string,
  _prevState: AddPersonalLoanState,
  formData: FormData,
): Promise<AddPersonalLoanState> {
  const amount = Number(formData.get("amount"));
  const note = (formData.get("note") as string)?.trim();
  const dateRaw = formData.get("date") as string;
  const date = dateRaw || new Date().toISOString().slice(0, 10);

  if (Number.isNaN(amount) || amount <= 0) {
    return { error: "Nominal pinjaman harus angka lebih dari 0." };
  }

  const supabase = await createClient();

  const { data: employee } = await supabase
    .from("employees")
    .select("name")
    .eq("id", employeeId)
    .eq("business_id", businessId)
    .maybeSingle();

  const { error } = await supabase.from("employee_personal_loans").insert({
    business_id: businessId,
    employee_id: employeeId,
    date,
    amount,
    note: note || null,
  });

  if (error) {
    return { error: error.message };
  }

  if (employee) {
    await logActivity(
      supabase,
      businessId,
      "pengaturan",
      "info",
      `Pinjaman pribadi dicatat: ${employee.name}`,
      `Rp${amount.toLocaleString("id-ID")}${note ? ` — ${note}` : ""}`,
    );
  }

  revalidatePath(`/business/${businessId}/employees`);
  return { error: null };
}

export type AddRecurringAllowanceState = { error: string | null };

// Tunjangan Tetap -- template yang otomatis disalin ke payslip_adjustments
// tiap kali slip gaji baru dibuat (lihat createPayslip di payroll/actions.ts),
// jadi tidak perlu diketik ulang tiap bulan. Bisa lebih dari satu per
// karyawan (mis. Tunjangan Jabatan + Kesehatan + Bonus Bulanan sekaligus).
export async function addRecurringAllowance(
  businessId: string,
  employeeId: string,
  _prevState: AddRecurringAllowanceState,
  formData: FormData,
): Promise<AddRecurringAllowanceState> {
  const label = (formData.get("label") as string)?.trim();
  const amount = Number(formData.get("amount"));

  if (!label) {
    return { error: "Nama tunjangan wajib diisi." };
  }
  if (Number.isNaN(amount) || amount < 0) {
    return { error: "Nominal tunjangan harus angka 0 atau lebih." };
  }

  const supabase = await createClient();

  const { data: employee } = await supabase
    .from("employees")
    .select("name")
    .eq("id", employeeId)
    .eq("business_id", businessId)
    .maybeSingle();

  const { error } = await supabase.from("employee_recurring_allowances").insert({
    business_id: businessId,
    employee_id: employeeId,
    label,
    amount,
  });

  if (error) {
    return { error: error.message };
  }

  if (employee) {
    await logActivity(
      supabase,
      businessId,
      "pengaturan",
      "info",
      `Tunjangan tetap ditambahkan: ${employee.name}`,
      `${label} — Rp${amount.toLocaleString("id-ID")}/bulan`,
    );
  }

  revalidatePath(`/business/${businessId}/employees`);
  return { error: null };
}

export async function updateRecurringAllowance(
  businessId: string,
  allowanceId: string,
  label: string,
  amount: number,
): Promise<{ error: string | null }> {
  const trimmedLabel = label.trim();
  if (!trimmedLabel) {
    return { error: "Nama tunjangan wajib diisi." };
  }
  if (Number.isNaN(amount) || amount < 0) {
    return { error: "Nominal tunjangan harus angka 0 atau lebih." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("employee_recurring_allowances")
    .update({ label: trimmedLabel, amount })
    .eq("id", allowanceId)
    .eq("business_id", businessId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/business/${businessId}/employees`);
  return { error: null };
}

export async function toggleRecurringAllowanceActive(
  businessId: string,
  allowanceId: string,
  active: boolean,
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("employee_recurring_allowances")
    .update({ active })
    .eq("id", allowanceId)
    .eq("business_id", businessId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/business/${businessId}/employees`);
  return { error: null };
}

export async function deleteRecurringAllowance(
  businessId: string,
  allowanceId: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("employee_recurring_allowances")
    .delete()
    .eq("id", allowanceId)
    .eq("business_id", businessId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/business/${businessId}/employees`);
  return { error: null };
}
