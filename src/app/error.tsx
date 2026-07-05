"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function ErrorPage({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-600">
          <span className="text-lg font-bold text-white">!</span>
        </div>
        <h1 className="text-xl font-bold text-zinc-900">Ada yang salah</h1>
        <p className="mt-2 text-sm text-zinc-500">
          Terjadi kesalahan tak terduga. Coba lagi, atau kembali ke dashboard kalau masih
          bermasalah.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <button
            onClick={unstable_retry}
            className="w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
          >
            Coba Lagi
          </button>
          <Link
            href="/dashboard"
            className="w-full rounded-xl border border-zinc-200 py-2.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100"
          >
            Ke Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
