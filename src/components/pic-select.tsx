"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Dropdown PIC (penanggung jawab) generik — dipakai untuk Gudang & Outlet.
export default function PicSelect({
  id,
  picEmployeeId,
  employees,
  action,
}: {
  id: string;
  picEmployeeId: string | null;
  employees: { id: string; name: string }[];
  action: (id: string, employeeId: string) => Promise<{ error: string | null }>;
}) {
  const router = useRouter();
  const [value, setValue] = useState(picEmployeeId ?? "");
  const [pending, setPending] = useState(false);

  function handleChange(next: string) {
    setValue(next);
    setPending(true);
    action(id, next)
      .then(() => {
        setPending(false);
        router.refresh();
      })
      .catch(() => {
        setPending(false);
      });
  }

  return (
    <select
      value={value}
      onChange={(e) => handleChange(e.target.value)}
      disabled={pending}
      className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] text-zinc-600 focus:border-brand-600 focus:outline-none disabled:opacity-50"
    >
      <option value="">— PIC belum ditentukan —</option>
      {employees.map((e) => (
        <option key={e.id} value={e.id}>
          {e.name}
        </option>
      ))}
    </select>
  );
}
