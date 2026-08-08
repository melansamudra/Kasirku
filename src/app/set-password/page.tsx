"use client";

import { useState, useEffect, type FormEvent } from "react";
import Link from "next/link";
import { createRecoveryClient } from "@/lib/supabase/recovery-client";
import Logo from "@/components/logo";

// Dibuat sekali per page load supaya sesi dari hash URL (#access_token=...)
// tetap ada di instance yang sama saat updateUser() dipanggil nanti.
function useInviteClient() {
  const [client] = useState(() => createRecoveryClient());
  return client;
}

export default function SetPasswordPage() {
  const supabase = useInviteClient();
  const [checking, setChecking] = useState(true);
  const [sessionReady, setSessionReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;

    // Cek apakah URL punya ?code= (PKCE flow dari invite Supabase)
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get("code");

    if (code) {
      // PKCE: tukar code dengan sesi langsung, tanpa butuh code_verifier
      supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
        if (cancelled) return;
        if (!error) {
          setSessionReady(true);
        }
        setChecking(false);
      });
      return () => { cancelled = true; };
    }

    // Implicit flow: sesi dari hash URL (#access_token=...)
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session) {
        setSessionReady(true);
        setChecking(false);
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if ((event === "SIGNED_IN" || event === "USER_UPDATED") && session) {
        setSessionReady(true);
        setChecking(false);
      }
    });
    // Timeout fallback
    const timer = setTimeout(() => {
      if (!cancelled) setChecking(false);
    }, 4000);
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, [supabase]);

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
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setDone(true);
  }

  if (checking) {
    return (
      <Shell>
        <p className="text-center text-sm text-zinc-400">Memverifikasi undangan…</p>
      </Shell>
    );
  }

  if (!sessionReady) {
    return (
      <Shell>
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-2xl">
            !
          </div>
          <h1 className="text-xl font-bold text-zinc-900">Link Tidak Valid atau Kedaluwarsa</h1>
          <p className="mt-2 text-sm text-zinc-500">
            Link undangan ini sudah digunakan atau kedaluwarsa. Hubungi pemilik toko untuk dikirim undangan baru.
          </p>
        </div>
      </Shell>
    );
  }

  if (done) {
    return (
      <Shell>
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100 text-2xl">
            👁
          </div>
          <h1 className="text-xl font-bold text-zinc-900">Kata Sandi Tersimpan!</h1>
          <p className="mt-2 text-sm text-zinc-500">
            Akun mirror Anda sudah aktif. Silakan masuk untuk melihat data toko.
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
