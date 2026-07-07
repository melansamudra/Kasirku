"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";

type ParsedMemberFields =
  | { error: string }
  | {
      error: null;
      name: string;
      phone: string;
      memberCode: string;
      validFrom: string;
      validUntil: string;
      note: string;
    };

function parseMemberFields(formData: FormData): ParsedMemberFields {
  const name = (formData.get("name") as string)?.trim();
  const phone = (formData.get("phone") as string)?.trim();
  const memberCode = (formData.get("memberCode") as string)?.trim();
  const validFrom = formData.get("validFrom") as string;
  const validUntil = formData.get("validUntil") as string;
  const note = (formData.get("note") as string)?.trim();

  if (!name) return { error: "Nama member wajib diisi." };
  if (!memberCode) return { error: "Kode member wajib diisi." };
  if (!validFrom || !/^\d{4}-\d{2}-\d{2}$/.test(validFrom)) {
    return { error: "Tanggal mulai berlaku wajib diisi." };
  }
  if (!validUntil || !/^\d{4}-\d{2}-\d{2}$/.test(validUntil)) {
    return { error: "Tanggal berakhir wajib diisi." };
  }
  if (validUntil < validFrom) {
    return { error: "Tanggal berakhir tidak boleh sebelum tanggal mulai." };
  }

  return { error: null, name, phone, memberCode, validFrom, validUntil, note };
}

export type AddMemberState = {
  error: string | null;
  member?: { id: string; name: string; memberCode: string; validUntil: string };
};

export async function addMember(
  businessId: string,
  _prevState: AddMemberState,
  formData: FormData,
): Promise<AddMemberState> {
  const parsed = parseMemberFields(formData);
  if (parsed.error !== null) return { error: parsed.error };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("members")
    .insert({
      business_id: businessId,
      name: parsed.name,
      phone: parsed.phone || null,
      member_code: parsed.memberCode,
      valid_from: parsed.validFrom,
      valid_until: parsed.validUntil,
      note: parsed.note || null,
    })
    .select("id, name, member_code, valid_until")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { error: "Kode member sudah dipakai member lain." };
    }
    return { error: error.message };
  }

  await logActivity(supabase, businessId, "produk", "sukses", `Member baru: ${parsed.name}`);
  revalidatePath(`/business/${businessId}/members`);
  return {
    error: null,
    member: {
      id: data.id,
      name: data.name,
      memberCode: data.member_code,
      validUntil: data.valid_until,
    },
  };
}

export type EditMemberState = { error: string | null };

export async function editMember(
  businessId: string,
  memberId: string,
  _prevState: EditMemberState,
  formData: FormData,
): Promise<EditMemberState> {
  const parsed = parseMemberFields(formData);
  if (parsed.error !== null) return { error: parsed.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("members")
    .update({
      name: parsed.name,
      phone: parsed.phone || null,
      member_code: parsed.memberCode,
      valid_from: parsed.validFrom,
      valid_until: parsed.validUntil,
      note: parsed.note || null,
    })
    .eq("id", memberId)
    .eq("business_id", businessId);

  if (error) {
    if (error.code === "23505") {
      return { error: "Kode member sudah dipakai member lain." };
    }
    return { error: error.message };
  }

  await logActivity(supabase, businessId, "produk", "info", `Member diubah: ${parsed.name}`);
  revalidatePath(`/business/${businessId}/members`);
  revalidatePath(`/business/${businessId}/members/${memberId}`);
  return { error: null };
}

export async function deleteMember(businessId: string, memberId: string) {
  const supabase = await createClient();
  await supabase
    .from("members")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", memberId)
    .eq("business_id", businessId);
  revalidatePath(`/business/${businessId}/members`);
}
