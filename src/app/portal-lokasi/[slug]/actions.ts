"use server";

import { createClient } from "@/lib/supabase/server";
import { clearProductionSession, setProductionSession } from "@/lib/production-session";

export type LoginPortalState = { success: boolean; error: string | null };

export async function loginPortal(
  slug: string,
  businessId: string,
  locationId: string,
  employeeId: string,
  pin: string,
): Promise<LoginPortalState> {
  if (!/^\d{4}$/.test(pin)) {
    return { success: false, error: "PIN harus 4 digit angka." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("verify_employee_pin", { p_slug: slug, p_employee_id: employeeId, p_pin: pin })
    .single();

  if (error || !data) {
    if (error?.message.includes("pin not set")) {
      return { success: false, error: "PIN belum diset untuk staf ini. Hubungi admin." };
    }
    return { success: false, error: "PIN salah, coba lagi." };
  }

  const employee = data as { employee_id: string; employee_name: string };
  await setProductionSession({ employeeId: employee.employee_id, businessId, locationId, name: employee.employee_name });

  return { success: true, error: null };
}

export async function logoutPortal() {
  await clearProductionSession();
}
