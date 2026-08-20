"use client";

import { useRouter } from "next/navigation";

export default function AttendanceDatePicker({
  businessId,
  date,
  today,
  label,
}: {
  businessId: string;
  date: string;
  today: string;
  label: string;
}) {
  const router = useRouter();

  return (
    <div className="mt-4 rounded-xl border border-zinc-200 bg-white px-3 py-2.5">
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={date}
          max={today}
          onChange={(e) => {
            if (e.target.value) {
              router.push(`/business/${businessId}/attendance?date=${e.target.value}`);
            }
          }}
          className="flex-1 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
        {date !== today && (
          <button
            onClick={() => router.push(`/business/${businessId}/attendance`)}
            className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium text-brand-600 hover:bg-brand-50"
          >
            Hari Ini
          </button>
        )}
      </div>
      <p className="mt-1.5 text-center text-xs font-semibold text-zinc-500">{label}</p>
    </div>
  );
}
