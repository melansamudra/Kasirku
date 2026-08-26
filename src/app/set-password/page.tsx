"use client";

import { useState, useEffect, useCallback, type FormEvent } from "react";
import Link from "next/link";
import { createRecoveryClient } from "@/lib/supabase/recovery-client";
import Logo from "@/components/logo";

// Dibuat sekali per page load supaya sesi dari hash URL (#access_token=...)
// tetap ada di instance yang sama saat updateUser() dipanggil nanti.
function useInviteClient() {
  const [client] = useState(() => createRecoveryClient());
  return client;
}

const POLL_INTERVAL_MS = 1500;
const MAX_POLL_ATTEMPTS = 8; // 8 × 1.5s = 12s total

export default function SetPasswordPage() {
  const supabase = useInviteClient();
  const [checking, setChecking] = useState(true);
  const [sessionReady, setSessionReady] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const startChecking = useCallback(() => {
    setChecking(true);
    setTimedOut(false);

    let cancelled = false;
    let attempts = 0;
    let pollTimer: ReturnType<typeof setTimeout>;

    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get("code");

    if (code) {
      // PKCE: tukar code dengan sesi langsung, tanpa butuh code_verifier
      supabase.auth.exchangeCodeForSession(code).then(({ error: exchErr }) => {
        if (cancelled) return;
        if (!exchErr) setSessionReady(true);
        setChecking(false);
      });
      return () => { cancelled = true; };
    }

    // Implicit flow: poll getSession() tiap POLL_INTERVAL_MS sampai MAX_POLL_ATTEMPTS.
    // onAuthStateChange jadi sinyal cepat kalau sesi sudah siap sebelum poll berikutnya.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if ((event === "SIGNED_IN" || event === "USER_UPDATED") && session) {
        cancelled = true;
        clearTimeout(pollTimer);
        sub.subscription.unsubscribe();
        setSessionReady(true);
        setChecking(false);
      }
    });

    function poll() {
      supabase.auth.getSession().then(({ data }) => {
        if (cancelled) return;
        if (data.session) {
          cancelled = true;
          sub.subscription.unsubscribe();
          setSessionReady(true);
          setChecking(false);
          return;
        }
        attempts++;
        if (attempts >= MAX_POLL_ATTEMPTS) {
          sub.subscription.unsubscribe();
          setTimedOut(true);
          setChecking(false);
          return;
        }
        pollTimer = setTimeout(poll, POLL_INTERVAL_MS);
      });
    }

    poll();

    return () => {
      cancelled = true;
      clearTimeout(pollTimer);
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    // startChecking men-subscribe ke onAuthStateChange dan mulai polling
    // getSession() — pola effect standar untuk sinkronisasi dengan sistem
    // eksternal (auth state), termasuk setChecking/setTimedOut di awalnya.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    const cleanup = startChecking();
    return cleanup;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Kata sandi minimal 8 karakter.");
      return;
    }
    if (password !== confirm) {
      setError("Konfirmasi kata sandi tidak cocok.");
      return;
    }

    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      setLoading(false);

      if (updateError) {
        setError(updateError.message);
        return;
      }

      setDone(true);
    } catch {
      setLoading(false);
      setError("Gagal terhubung ke server. Cek koneksi internet lalu coba lagi.");
    }
  }

  if (checking) {
    return (
      <Shell>
        <p className="text-center text-sm text-zinc-400">Memverifikasi undangan…</p>
      </Shell>
    );
  }

  if (!sessionReady) {
    if (timedOut) {
      return (
        <Shell>
          <div className="text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-2xl">
              ⏱
            </div>
            <h1 className="text-xl font-bold text-zinc-900">Koneksi Lambat</h1>
            <p className="mt-2 text-sm text-zinc-500">
              Verifikasi belum selesai. Pastikan koneksi internet stabil, lalu coba lagi.
              Jika link memang sudah kedaluwarsa, hubungi pengelola untuk kirim ulang undangan.
            </p>
            <button
              type="button"
              onClick={startChecking}
              className="mt-6 w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
            >
              Coba Lagi
            </button>
          </div>
        </Shell>
      );
    }
    return (
      <Shell>
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-2xl">
            !
          </div>
          <h1 className="text-xl font-bold text-zinc-900">Link Tidak Valid atau Kedaluwarsa</h1>
          <p className="mt-2 text-sm text-zinc-500">
            Link undangan ini sudah digunakan atau kedaluwarsa. Hubungi pengelola untuk dikirim undangan baru.
          </p>
        </div>
      </Shell>
    );
  }

  if (done) {
    return (
      <Shell>
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-2xl">
            ✓
          </div>
          <h1 className="text-xl font-bold text-zinc-900">Kata Sandi Tersimpan!</h1>
          <p className="mt-2 text-sm text-zinc-500">
            Akun Anda sudah aktif. Silakan masuk untuk melanjutkan.
          </p>
          <Link
            href="/login"
            className="mt-6 inline-block w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
          >
            Masuk Sekarang
          </Link>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="mb-6 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100 text-2xl">
          👁
        </div>
        <h1 className="text-xl font-bold text-zinc-900">Atur Kata Sandi</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Buat kata sandi untuk akun mirror Anda agar bisa login kapan saja.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="password" className="mb-1.5 block text-xs font-medium text-zinc-600">
            Kata Sandi Baru
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            placeholder="Minimal 8 karakter"
            className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>

        <div>
          <label htmlFor="confirm" className="mb-1.5 block text-xs font-medium text-zinc-600">
            Konfirmasi Kata Sandi
          </label>
          <input
            id="confirm"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            autoComplete="new-password"
            placeholder="Ulangi kata sandi"
            className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-60"
        >
          {loading ? "Menyimpan…" : "Simpan & Aktifkan Akun"}
        </button>
      </form>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-zinc-100">
      <header className="flex h-14 shrink-0 items-center bg-zinc-900 px-6">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-600 p-1">
            <Logo className="h-full w-full brightness-0 invert" />
          </div>
          <span className="text-sm font-bold tracking-tight text-white">KasirKu</span>
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-sm">
          {children}
        </div>
      </main>
    </div>
  );
}
