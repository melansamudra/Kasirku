"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { createRecoveryClient } from "@/lib/supabase/recovery-client";
import AuthShell from "@/components/auth-shell";

// Client dibuat sekali per page load (bukan di dalam handleSubmit) supaya
// sesi yang dideteksi dari URL fragment (#access_token=...) saat halaman
// dimuat tetap ada di instance yang sama waktu updateUser() dipanggil nanti.
function useRecoveryClient() {
  const [client] = useState(() => createRecoveryClient());
  return client;
}

export default function ResetPasswordPage() {
  const supabase = useRecoveryClient();
  const [checking, setChecking] = useState(true);
  const [sessionReady, setSessionReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    // detectSessionInUrl butuh sedikit waktu memproses fragment URL saat
    // halaman baru dimuat — cek sesinya begitu itu selesai, supaya kita bisa
    // kasih tahu user secara jelas kalau link-nya sudah tidak valid, bukan
    // membiarkan mereka isi form lalu baru gagal pas submit ("Auth session
    // missing").
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSessionReady(!!data.session);
      setChecking(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) {
        setSessionReady(true);
        setChecking(false);
      }
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Password dan konfirmasi tidak sama.");
      return;
    }
    if (password.length < 6) {
      setError("Password minimal 6 karakter.");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    setDone(true);
  }

  if (checking) {
    return (
      <AuthShell>
        <p className="text-center text-sm text-zinc-400">Memeriksa link…</p>
      </AuthShell>
    );
  }

  if (!sessionReady) {
    return (
      <AuthShell>
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-500 shadow-lg shadow-red-500/20">
            <span className="text-lg font-bold text-white">!</span>
          </div>
          <h1 className="text-xl font-bold text-zinc-900">Link Tidak Valid atau Kedaluwarsa</h1>
          <p className="mt-2 text-sm text-zinc-500">
            Link reset password ini sudah dipakai atau kedaluwarsa. Minta link baru untuk
            melanjutkan.
          </p>
          <Link
            href="/forgot-password"
            className="mt-6 inline-block w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white shadow-md shadow-brand-600/20 transition-all hover:bg-brand-700"
          >
            Minta Link Baru
          </Link>
        </div>
      </AuthShell>
    );
  }

  if (done) {
    return (
      <AuthShell>
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600 shadow-lg shadow-brand-600/20">
            <span className="text-lg font-bold text-white">K</span>
          </div>
          <h1 className="text-xl font-bold text-zinc-900">Password diperbarui</h1>
          <p className="mt-2 text-sm text-zinc-500">
            Password baru kamu sudah aktif. Silakan masuk kembali pakai password baru.
          </p>
          <Link
            href="/login"
            className="mt-6 inline-block w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white shadow-md shadow-brand-600/20 transition-all hover:bg-brand-700 hover:shadow-lg hover:shadow-brand-600/25"
          >
            Ke Halaman Masuk
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600 shadow-lg shadow-brand-600/20">
          <span className="text-lg font-bold text-white">K</span>
        </div>
        <h1 className="text-xl font-bold text-zinc-900">Buat Password Baru</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Masukkan password baru untuk akun kamu.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="password" className="mb-1 block text-xs font-medium text-zinc-600">
            Password Baru
          </label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm transition-shadow focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
            placeholder="Minimal 6 karakter"
          />
        </div>
        <div>
          <label
            htmlFor="confirmPassword"
            className="mb-1 block text-xs font-medium text-zinc-600"
          >
            Ulangi Password
          </label>
          <input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm transition-shadow focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
            placeholder="••••••••"
          />
        </div>

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white shadow-md shadow-brand-600/20 transition-all hover:bg-brand-700 hover:shadow-lg hover:shadow-brand-600/25 disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none"
        >
          {loading ? "Menyimpan…" : "Simpan Password"}
        </button>
      </form>
    </AuthShell>
  );
}
