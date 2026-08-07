"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import Logo from "@/components/logo";

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
    //
    // window.location.href, BUKAN router.replace() dari next/navigation —
    // router.replace() itu "soft navigation" yang minta payload RSC lewat
    // fetch() ke server; kalau lagi offline dan payload itu belum tentu
    // persis ada di cache Service Worker (beda dari cache HTML biasa),
    // fetch-nya bisa gagal dan errornya naik sampai ke error.tsx ("Ada yang
    // salah"). window.location.href memicu navigasi dokumen penuh, yang
    // DIPASTIKAN lewat fetch handler Service Worker (public/sw.js) yang
    // sudah punya fallback ke cache — jauh lebih tahan banting saat offline.
    let cancelled = false;
    const supabase = createClient();
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (cancelled) return;
        if (data.session) {
          window.location.href = "/dashboard";
          return;
        }
        setCheckingSession(false);
      })
      .catch(() => {
        if (cancelled) return;
        setCheckingSession(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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

  return (
    <div className="flex min-h-screen flex-col bg-zinc-100">
      {/* Navbar */}
      <header className="flex h-14 shrink-0 items-center bg-zinc-900 px-6">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-600 p-1">
            <Logo className="h-full w-full brightness-0 invert" />
          </div>
          <span className="text-sm font-bold tracking-tight text-white">KasirKu</span>
        </div>
        <div className="ml-auto flex items-center gap-5">
          <a
            href="mailto:support@kasirku.id"
            className="text-xs font-medium text-zinc-400 hover:text-white"
          >
            Bantuan
          </a>
          <Link href="/signup" className="text-xs font-medium text-zinc-400 hover:text-white">
            Daftar
          </Link>
        </div>
      </header>

      {/* Content */}
      <div className="flex flex-1 items-center justify-center px-4 py-12">
        {checkingSession ? (
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-zinc-300 border-t-brand-600" />
        ) : (
          <div className="w-full max-w-sm rounded-2xl bg-white px-8 py-9 shadow-sm">
            <h1 className="mb-6 text-xl font-bold text-zinc-900">Masuk</h1>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="mb-1.5 block text-xs font-medium text-zinc-600">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 transition-shadow focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
                  placeholder="email@toko.com"
                />
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label htmlFor="password" className="block text-xs font-medium text-zinc-600">
                    Password
                  </label>
                  <Link
                    href="/forgot-password"
                    className="text-xs font-medium text-brand-600 hover:underline"
                  >
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
                  className="w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 transition-shadow focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
                  placeholder="••••••••"
                />
              </div>

              {error && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="mt-1 w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Memproses…" : "Masuk"}
              </button>
            </form>

            <p className="mt-5 text-center text-xs text-zinc-500">
              Belum punya akun?{" "}
              <Link href="/signup" className="font-medium text-brand-600 hover:underline">
                Daftar sekarang
              </Link>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
