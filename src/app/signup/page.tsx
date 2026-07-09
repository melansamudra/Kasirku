"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import AuthShell from "@/components/auth-shell";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

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
    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({ email, password });
    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    // If email confirmation is disabled (or already confirmed), signUp
    // returns an active session right away — no need to wait for email.
    if (data.session) {
      router.push("/onboarding");
      router.refresh();
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
            Kami sudah kirim link konfirmasi ke <strong>{email}</strong>. Klik link
            itu dulu sebelum bisa masuk.
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
        <h1 className="text-xl font-bold text-zinc-900">Daftar KasirKu</h1>
        <p className="mt-1 text-sm text-zinc-500">Buat akun pemilik toko baru</p>
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
          <label htmlFor="password" className="mb-1 block text-xs font-medium text-zinc-600">
            Password
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
          {loading ? "Memproses…" : "Daftar"}
        </button>
      </form>

      <p className="mt-4 text-center text-xs text-zinc-400">
        Dengan mendaftar, kamu menyetujui{" "}
        <Link href="/terms" className="font-medium text-brand-600 hover:underline">
          Syarat &amp; Ketentuan
        </Link>{" "}
        dan{" "}
        <Link href="/privacy" className="font-medium text-brand-600 hover:underline">
          Kebijakan Privasi
        </Link>{" "}
        kami.
      </p>

      <p className="mt-4 text-center text-sm text-zinc-500">
        Sudah punya akun?{" "}
        <Link href="/login" className="font-medium text-brand-600 hover:underline">
          Masuk
        </Link>
      </p>
    </AuthShell>
  );
}
