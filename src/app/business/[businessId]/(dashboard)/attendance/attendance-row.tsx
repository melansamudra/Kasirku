"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AttendanceStatus } from "./actions";

const STATUS_OPTIONS: { value: AttendanceStatus; label: string }[] = [
  { value: "hadir", label: "Hadir" },
  { value: "izin", label: "Izin" },
  { value: "sakit", label: "Sakit" },
  { value: "alpa", label: "Alpa" },
  { value: "off", label: "Off" },
];

const STATUS_STYLES: Record<AttendanceStatus, string> = {
  hadir: "border-brand-600 bg-brand-50 text-brand-700",
  izin: "border-amber-500 bg-amber-50 text-amber-700",
  sakit: "border-blue-500 bg-blue-50 text-blue-700",
  alpa: "border-red-500 bg-red-50 text-red-700",
  off: "border-zinc-400 bg-zinc-100 text-zinc-600",
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("id-ID", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export type SelfieInfo = {
  attendanceId: string;
  checkInAt: string | null;
  checkInPhotoUrl: string | null;
  checkOutAt: string | null;
  checkOutPhotoUrl: string | null;
  lateMinutes: number;
  overtimeHours: number;
  verified: boolean;
};

export default function AttendanceRow({
  employeeName,
  currentStatus,
  late,
  action,
  lateAction,
  selfie,
  verifyAction,
}: {
  employeeName: string;
  currentStatus: AttendanceStatus | null;
  late: boolean;
  action: (status: AttendanceStatus) => Promise<{ error: string | null }>;
  lateAction: (late: boolean) => Promise<{ error: string | null }>;
  selfie?: SelfieInfo | null;
  verifyAction?: () => Promise<{ error: string | null }>;
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

  function handleToggleLate() {
    setError(null);
    startTransition(async () => {
      const result = await lateAction(!late);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function handleVerify() {
    if (!verifyAction) return;
    setError(null);
    startTransition(async () => {
      const result = await verifyAction();
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-zinc-900">{employeeName}</p>
        {currentStatus === "hadir" && (
          <button
            onClick={handleToggleLate}
            disabled={isPending}
            className={`shrink-0 rounded-lg border px-2 py-1 text-[11px] font-medium transition-colors disabled:opacity-50 ${
              late
                ? "border-amber-500 bg-amber-50 text-amber-700"
                : "border-zinc-200 text-zinc-400 hover:border-zinc-300"
            }`}
          >
            {late ? "⏰ Terlambat" : "Tandai Terlambat"}
          </button>
        )}
      </div>

      {selfie && (selfie.checkInAt || selfie.checkOutAt) && (
        <div className="mt-2 flex items-center gap-3 rounded-lg border border-zinc-100 bg-zinc-50 p-2">
          <div className="flex gap-1.5">
            {selfie.checkInPhotoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={selfie.checkInPhotoUrl}
                alt="Selfie absen masuk"
                className="h-12 w-12 rounded-lg object-cover"
              />
            )}
            {selfie.checkOutPhotoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={selfie.checkOutPhotoUrl}
                alt="Selfie absen pulang"
                className="h-12 w-12 rounded-lg object-cover"
              />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-zinc-500">
              {selfie.checkInAt && <>Masuk {formatTime(selfie.checkInAt)}</>}
              {selfie.checkOutAt && <> · Pulang {formatTime(selfie.checkOutAt)}</>}
            </p>
            <p className="text-[11px] text-zinc-400">
              {selfie.lateMinutes > 0 && <span className="text-amber-600">Telat {selfie.lateMinutes} mnt</span>}
              {selfie.lateMinutes > 0 && selfie.overtimeHours > 0 && " · "}
              {selfie.overtimeHours > 0 && (
                <span className="text-brand-700">Lembur {selfie.overtimeHours} jam</span>
              )}
              {selfie.lateMinutes === 0 && selfie.overtimeHours === 0 && "Selfie absen"}
            </p>
          </div>
          {verifyAction &&
            (selfie.verified ? (
              <span className="shrink-0 text-[11px] font-medium text-brand-600">✓ Terverifikasi</span>
            ) : (
              <button
                onClick={handleVerify}
                disabled={isPending}
                className="shrink-0 rounded-lg bg-brand-600 px-2.5 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
              >
                Verifikasi
              </button>
            ))}
        </div>
      )}

      <div className="mt-2 grid grid-cols-5 gap-1.5">
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
