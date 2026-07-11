"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AttendanceStatus } from "./actions";

const STATUS_OPTIONS: { value: AttendanceStatus; label: string }[] = [
  { value: "hadir", label: "Hadir" },
  { value: "izin", label: "Izin" },
  { value: "sakit", label: "Sakit" },
  { value: "alpa", label: "Alpa" },
];

const STATUS_STYLES: Record<AttendanceStatus, string> = {
  hadir: "border-brand-600 bg-brand-50 text-brand-700",
  izin: "border-amber-500 bg-amber-50 text-amber-700",
  sakit: "border-blue-500 bg-blue-50 text-blue-700",
  alpa: "border-red-500 bg-red-50 text-red-700",
};

export default function AttendanceRow({
  employeeName,
  currentStatus,
  action,
}: {
  employeeName: string;
  currentStatus: AttendanceStatus | null;
  action: (status: AttendanceStatus) => Promise<{ error: string | null }>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick(status: AttendanceStatus) {
    setError(null);
    startTransition(async () => {
      const result = await action(status);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
      <p className="text-sm font-medium text-zinc-900">{employeeName}</p>
      <div className="mt-2 grid grid-cols-4 gap-1.5">
        {STATUS_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => handleClick(opt.value)}
            disabled={isPending}
            className={`rounded-lg border py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
              currentStatus === opt.value
                ? STATUS_STYLES[opt.value]
                : "border-zinc-200 text-zinc-500 hover:border-zinc-300"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
    </div>
  );
}
