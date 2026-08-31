import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CheckinClient from "./checkin-client";

export default async function AbsenPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: rows } = await supabase.rpc("get_attendance_checkin_info", { p_slug: slug });

  if (!rows || rows.length === 0) {
    notFound();
  }

  const businessName = rows[0].business_name;
  const breakEnabled = rows[0].break_attendance_enabled ?? false;
  const employees = rows.map((r) => ({ id: r.employee_id, name: r.employee_name }));

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-4">
      <CheckinClient
        slug={slug}
        businessName={businessName}
        employees={employees}
        breakEnabled={breakEnabled}
      />
    </div>
  );
}
