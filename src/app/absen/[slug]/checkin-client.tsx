"use client";

import { useEffect, useRef, useState } from "react";

type Employee = { id: string; name: string };
type CheckinResult = { ok: boolean; message?: string; error?: string };
type LocationStatus = "pending" | "ok" | "denied" | "unsupported";

export default function CheckinClient({
  slug,
  businessName,
  employees,
}: {
  slug: string;
  businessName: string;
  employees: Employee[];
}) {
  const [employeeId, setEmployeeId] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [pending, setPending] = useState<"in" | "out" | null>(null);
  const [result, setResult] = useState<CheckinResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationStatus, setLocationStatus] = useState<LocationStatus>(() =>
    typeof navigator !== "undefined" && "geolocation" in navigator ? "pending" : "unsupported",
  );

  // Diminta pas halaman dibuka (bukan pas klik tombol) supaya waktu klik
  // Absen Masuk/Pulang, lokasinya sudah siap — nggak nunggu GPS di momen
  // kritis. Absen tetap boleh jalan walau lokasi ditolak/gagal, cuma
  // datanya kosong buat record itu.
  useEffect(() => {
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocationStatus("ok");
      },
      () => setLocationStatus("denied"),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }, []);

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhoto(file);
    setPreview(URL.createObjectURL(file));
    setResult(null);
  }

  function resetPhoto() {
    setPhoto(null);
    setPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSubmit(action: "in" | "out") {
    if (!employeeId) {
      setResult({ ok: false, error: "Pilih nama dulu." });
      return;
    }
    if (!photo) {
      setResult({ ok: false, error: "Ambil foto selfie dulu." });
      return;
    }
    setPending(action);
    setResult(null);

    const formData = new FormData();
    formData.set("slug", slug);
    formData.set("employeeId", employeeId);
    formData.set("action", action);
    formData.set("photo", photo);
    if (location) {
      formData.set("lat", String(location.lat));
      formData.set("lng", String(location.lng));
    }

    try {
      const res = await fetch("/api/attendance-checkin", { method: "POST", body: formData });
      const data = (await res.json()) as CheckinResult;
      setResult(data);
      if (data.ok) resetPhoto();
    } catch {
      setResult({ ok: false, error: "Gagal mengirim — cek koneksi internet lalu coba lagi." });
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-sm">
      <p className="text-center text-xs font-semibold uppercase tracking-wide text-zinc-400">
        {businessName}
      </p>
      <h1 className="mt-1 text-center text-lg font-bold text-zinc-900">Absen Selfie</h1>
      <p
        className={`mt-1 text-center text-[11px] ${
          locationStatus === "ok" ? "text-brand-600" : "text-amber-600"
        }`}
      >
        {locationStatus === "pending" && "📍 Mendeteksi lokasi…"}
        {locationStatus === "ok" && "📍 Lokasi terdeteksi"}
        {locationStatus === "denied" && "⚠️ Lokasi tidak diizinkan — aktifkan izin lokasi di browser"}
        {locationStatus === "unsupported" && "⚠️ Perangkat tidak mendukung deteksi lokasi"}
      </p>

      <div className="mt-4">
        <label className="mb-1 block text-xs font-medium text-zinc-600">Nama Anda</label>
        <select
          value={employeeId}
          onChange={(e) => {
            setEmployeeId(e.target.value);
            setResult(null);
          }}
          className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        >
          <option value="">— Pilih nama —</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4">
        <label className="mb-1 block text-xs font-medium text-zinc-600">Foto Selfie</label>
        {preview ? (
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview}
              alt="Preview selfie"
              className="aspect-[3/4] w-full rounded-xl object-cover"
            />
            <button
              type="button"
              onClick={resetPhoto}
              className="absolute right-2 top-2 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white"
            >
              Ulangi
            </button>
          </div>
        ) : (
          <label className="flex aspect-[3/4] w-full cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-300 text-zinc-400">
            <span className="text-3xl">📷</span>
            <span className="mt-2 text-xs font-medium">Ketuk untuk ambil selfie</span>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="user"
              onChange={handlePhotoChange}
              className="hidden"
            />
          </label>
        )}
      </div>

      {result && (
        <p
          className={`mt-3 rounded-lg px-3 py-2 text-xs ${
            result.ok ? "bg-brand-50 text-brand-700" : "bg-red-50 text-red-600"
          }`}
        >
          {result.ok ? result.message : result.error}
        </p>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          onClick={() => handleSubmit("in")}
          disabled={pending !== null}
          className="rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending === "in" ? "Mengirim…" : "Absen Masuk"}
        </button>
        <button
          onClick={() => handleSubmit("out")}
          disabled={pending !== null}
          className="rounded-xl bg-zinc-800 py-3 text-sm font-semibold text-white transition-colors hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending === "out" ? "Mengirim…" : "Absen Pulang"}
        </button>
      </div>
    </div>
  );
}
