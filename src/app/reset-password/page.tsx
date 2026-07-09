"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import AuthShell from "@/components/auth-shell";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

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
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    setDone(true);
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
            Password baru kamu sudah aktif.
          </p>
          <button
            onClick={() => {
              router.push("/dashboard");
              router.refresh();
            }}
            className="mt-6 w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white shadow-md shadow-brand-600/20 transition-all hover:bg-brand-700 hover:shadow-lg hover:shadow-brand-600/25"
          >
            Ke Dashboard
          </button>
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
