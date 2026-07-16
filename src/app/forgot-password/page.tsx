"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import AuthShell from "@/components/auth-shell";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    // Link reset password Supabase pakai token di URL fragment (#access_token=...),
    // bukan query param ?code= — jadi harus arahkan langsung ke /reset-password
    // (diproses supabase-js di browser), bukan lewat /auth/callback yang cuma bisa
    // menukar ?code= server-side. Lewat /auth/callback di sini bikin exchangeCodeForSession
    // selalu gagal (tidak ada "code") dan jatuh ke /login — bug yang dilaporkan user.
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    setSubmitted(true);
  }

  if (submitted) {
    return (
      <AuthShell>
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600 shadow-lg shadow-brand-600/20">
            <span className="text-lg font-bold text-white">K</span>
          </div>
          <h1 className="text-xl font-bold text-zinc-900">Cek email kamu</h1>
          <p className="mt-2 text-sm text-zinc-500">
            Kalau <strong>{email}</strong> terdaftar, kami sudah kirim link untuk membuat
            password baru. Klik link itu untuk melanjutkan.
          </p>
          <Link
            href="/login"
            className="mt-6 inline-block text-sm font-medium text-brand-600 hover:underline"
          >
            Kembali ke halaman masuk
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
        <h1 className="text-xl font-bold text-zinc-900">Lupa Password</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Masukkan email akun kamu, kami kirim link untuk buat password baru.
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

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white shadow-md shadow-brand-600/20 transition-all hover:bg-brand-700 hover:shadow-lg hover:shadow-brand-600/25 disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none"
        >
          {loading ? "Mengirim…" : "Kirim Link Reset"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-zinc-500">
        Sudah ingat password?{" "}
        <Link href="/login" className="font-medium text-brand-600 hover:underline">
          Masuk
        </Link>
      </p>
    </AuthShell>
  );
}
