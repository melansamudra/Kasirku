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

// HH:mm buat prefill <input type="time"> dari ISO — pakai en-GB (format
// 24 jam) di zona WIB, bukan formatTime yang bertujuan tampilan (id-ID bisa
// nyelip AM/PM tergantung locale environment).
function toTimeInputValue(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export type SelfieInfo = {
  attendanceId: string;
  checkInAt: string | null;
  checkInPhotoUrl: string | null;
  checkInLat: number | null;
  checkInLng: number | null;
  checkOutAt: string | null;
  checkOutPhotoUrl: string | null;
  checkOutLat: number | null;
  checkOutLng: number | null;
  lateMinutes: number;
  overtimeHours: number;
  verified: boolean;
};

function mapsUrl(lat: number, lng: number) {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

export default function AttendanceRow({
  employeeName,
  currentStatus,
  late,
  note,
  action,
  noteAction,
  lateAction,
  selfie,
  verifyAction,
  deleteSelfieAction,
  timeAction,
  overtimeHours,
  overtimeAction,
}: {
  employeeName: string;
  currentStatus: AttendanceStatus | null;
  late: boolean;
  note?: string | null;
  action: (status: AttendanceStatus) => Promise<{ error: string | null }>;
  noteAction?: (note: string) => Promise<{ error: string | null }>;
  lateAction: (late: boolean) => Promise<{ error: string | null }>;
  selfie?: SelfieInfo | null;
  verifyAction?: () => Promise<{ error: string | null }>;
  deleteSelfieAction?: () => Promise<{ error: string | null }>;
  timeAction?: (checkInTime: string | null, checkOutTime: string | null) => Promise<{ error: string | null }>;
  overtimeHours?: number;
  overtimeAction?: (hours: number) => Promise<{ error: string | null }>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editingTime, setEditingTime] = useState(false);
  const [checkInTime, setCheckInTime] = useState(selfie?.checkInAt ? toTimeInputValue(selfie.checkInAt) : "");
  const [checkOutTime, setCheckOutTime] = useState(selfie?.checkOutAt ? toTimeInputValue(selfie.checkOutAt) : "");
  const [noteDraft, setNoteDraft] = useState(note ?? "");
  const [noteSaved, setNoteSaved] = useState(true);
  const [editingOvertime, setEditingOvertime] = useState(false);
  const [overtimeDraft, setOvertimeDraft] = useState(overtimeHours ? String(overtimeHours) : "");

  function handleSaveTime() {
    if (!timeAction) return;
    setError(null);
    startTransition(async () => {
      const result = await timeAction(checkInTime || null, checkOutTime || null);
      if (result.error) {
        setError(result.error);
        return;
      }
      setEditingTime(false);
      router.refresh();
    });
  }

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

  function handleSaveNote() {
    if (!noteAction) return;
    setError(null);
    startTransition(async () => {
      const result = await noteAction(noteDraft);
      if (result.error) {
        setError(result.error);
        return;
      }
      setNoteSaved(true);
      router.refresh();
    });
  }

  function handleSaveOvertime() {
    if (!overtimeAction) return;
    setError(null);
    startTransition(async () => {
      const result = await overtimeAction(Number(overtimeDraft) || 0);
      if (result.error) {
        setError(result.error);
        return;
      }
      setEditingOvertime(false);
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

  function handleDeleteSelfie() {
    if (!deleteSelfieAction) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteSelfieAction();
      setConfirmDelete(false);
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
        <div className="flex shrink-0 items-center gap-1.5">
          {timeAction && (
            <button
              onClick={() => setEditingTime((v) => !v)}
              disabled={isPending}
              className="rounded-lg border border-zinc-200 px-2 py-1 text-[11px] font-medium text-zinc-400 transition-colors hover:border-zinc-300 disabled:opacity-50"
            >
              🕒 Jam
            </button>
          )}
          {currentStatus === "hadir" && (
            <button
              onClick={handleToggleLate}
              disabled={isPending}
              className={`rounded-lg border px-2 py-1 text-[11px] font-medium transition-colors disabled:opacity-50 ${
                late
                  ? "border-amber-500 bg-amber-50 text-amber-700"
                  : "border-zinc-200 text-zinc-400 hover:border-zinc-300"
              }`}
            >
              {late ? "⏰ Terlambat" : "Tandai Terlambat"}
            </button>
          )}
          {currentStatus === "hadir" && overtimeAction && (
            <button
              onClick={() => setEditingOvertime((v) => !v)}
              disabled={isPending}
              className={`rounded-lg border px-2 py-1 text-[11px] font-medium transition-colors disabled:opacity-50 ${
                overtimeHours && overtimeHours > 0
                  ? "border-brand-500 bg-brand-50 text-brand-700"
                  : "border-zinc-200 text-zinc-400 hover:border-zinc-300"
              }`}
            >
              {overtimeHours && overtimeHours > 0 ? `⏱️ Lembur ${overtimeHours} jam` : "Isi Lembur"}
            </button>
          )}
        </div>
      </div>

      {currentStatus === "hadir" && overtimeAction && editingOvertime && (
        <div className="mt-2 flex items-end gap-2 rounded-lg border border-zinc-100 bg-zinc-50 p-2">
          <div className="flex-1">
            <label className="mb-1 block text-[10px] font-medium text-zinc-500">Jam Lembur Hari Ini</label>
            <input
              type="number"
              min="0"
              step="0.5"
              value={overtimeDraft}
              onChange={(e) => setOvertimeDraft(e.target.value)}
              placeholder="0"
              className="w-full rounded-lg border border-zinc-200 px-2 py-1.5 text-xs focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </div>
          <button
            onClick={handleSaveOvertime}
            disabled={isPending}
            className="rounded-lg bg-brand-600 px-2.5 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
          >
            Simpan
          </button>
        </div>
      )}

      {timeAction && editingTime && (
        <div className="mt-2 flex items-end gap-2 rounded-lg border border-zinc-100 bg-zinc-50 p-2">
          <div className="flex-1">
            <label className="mb-1 block text-[10px] font-medium text-zinc-500">Jam Masuk</label>
            <input
              type="time"
              value={checkInTime}
              onChange={(e) => setCheckInTime(e.target.value)}
              className="w-full rounded-lg border border-zinc-200 px-2 py-1.5 text-xs focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-[10px] font-medium text-zinc-500">Jam Pulang</label>
            <input
              type="time"
              value={checkOutTime}
              onChange={(e) => setCheckOutTime(e.target.value)}
              className="w-full rounded-lg border border-zinc-200 px-2 py-1.5 text-xs focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </div>
          <button
            onClick={handleSaveTime}
            disabled={isPending}
            className="rounded-lg bg-brand-600 px-2.5 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
          >
            Simpan
          </button>
        </div>
      )}

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
              {selfie.lateMinutes === 0 &&
                selfie.overtimeHours === 0 &&
                (selfie.checkInPhotoUrl || selfie.checkOutPhotoUrl ? "Selfie absen" : "Jam manual")}
            </p>
            {(selfie.checkInLat !== null || selfie.checkOutLat !== null) && (
              <p className="mt-0.5 flex flex-wrap gap-x-2 text-[11px]">
                {selfie.checkInLat !== null && selfie.checkInLng !== null && (
                  <a
                    href={mapsUrl(selfie.checkInLat, selfie.checkInLng)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-600 hover:underline"
                  >
                    📍 Lokasi masuk
                  </a>
                )}
                {selfie.checkOutLat !== null && selfie.checkOutLng !== null && (
                  <a
                    href={mapsUrl(selfie.checkOutLat, selfie.checkOutLng)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-600 hover:underline"
                  >
                    📍 Lokasi pulang
                  </a>
                )}
              </p>
            )}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            {verifyAction &&
              (selfie.verified ? (
                <span className="text-[11px] font-medium text-brand-600">✓ Terverifikasi</span>
              ) : (
                <button
                  onClick={handleVerify}
                  disabled={isPending}
                  className="rounded-lg bg-brand-600 px-2.5 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
                >
                  Verifikasi
                </button>
              ))}
            {deleteSelfieAction &&
              (confirmDelete ? (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={handleDeleteSelfie}
                    disabled={isPending}
                    className="text-[10px] font-semibold text-red-600 hover:underline disabled:opacity-50"
                  >
                    Ya, hapus
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="text-[10px] text-zinc-400 hover:text-zinc-600"
                  >
                    Batal
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="text-[10px] text-zinc-400 hover:text-red-600"
                >
                  Hapus
                </button>
              ))}
          </div>
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

      {currentStatus === "izin" && noteAction && (
        <div className="mt-2 flex items-center gap-1.5">
          <input
            type="text"
            value={noteDraft}
            onChange={(e) => {
              setNoteDraft(e.target.value);
              setNoteSaved(false);
            }}
            placeholder="Keterangan izin (opsional, mis. izin resmi cuti)"
            className="flex-1 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
          {!noteSaved && (
            <button
              onClick={handleSaveNote}
              disabled={isPending}
              className="shrink-0 rounded-lg bg-amber-600 px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-amber-700 disabled:opacity-50"
            >
              Simpan
            </button>
          )}
        </div>
      )}
      {currentStatus === "izin" && note && (
        <p className="mt-1 text-[11px] text-amber-600">
          ℹ️ Ada keterangan — kalau izin ini jatuh di weekend, dianggap dispensasi (dipotong seperti
          hari biasa, tanpa denda tambahan weekend).
        </p>
      )}

      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
    </div>
  );
}
