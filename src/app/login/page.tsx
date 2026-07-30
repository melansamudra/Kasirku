"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import AuthShell from "@/components/auth-shell";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    // App Android selalu buka persis di /login tiap kali dibuka dari icon
    // (lihat android-app/capacitor.config.ts) — bukan cuma pertama kali,
    // TIAP cold-launch, bahkan kalau kasir sudah login sebelumnya. Tanpa
    // ini, kasir yang sudah login pun harus login ulang tiap buka app, dan
    // kalau lagi offline itu mustahil (form submit butuh network). getSession()
    // baca dari local storage/cookie, tidak perlu roundtrip ke server —
    // jadi ini tetap jalan walau offline total, asal sesi sebelumnya masih
    // tersimpan di device.
    let cancelled = false;
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session) {
        router.replace("/dashboard");
        return;
      }
      setCheckingSession(false);
    });
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  if (checkingSession) {
    // Sebentar saja (baca local storage, bukan network) — tapi tanpa guard
    // ini form login sempat kekedip sekilas sebelum redirect ke /dashboard
    // buat yang sebenarnya sudah login.
    return (
      <AuthShell>
        <div className="flex justify-center py-10">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-200 border-t-brand-600" />
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
        <h1 className="text-xl font-bold text-zinc-900">Masuk ke KasirKu</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Masuk dengan akun pemilik toko kamu
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="mb-1 block text-xs font-medium text-zinc-600">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm transition-shadow focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
            placeholder="kamu@toko.com"
          />
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label htmlFor="password" className="block text-xs font-medium text-zinc-600">
              Password
            </label>
            <Link href="/forgot-password" className="text-xs font-medium text-brand-600 hover:underline">
              Lupa password?
            </Link>
          </div>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
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
          {loading ? "Memproses…" : "Masuk"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-zinc-500">
        Belum punya akun?{" "}
        <Link href="/signup" className="font-medium text-brand-600 hover:underline">
          Daftar
        </Link>
      </p>
    </AuthShell>
  );
}
