"use client";

import { useEffect } from "react";

export default function GlobalError({
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
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 antialiased">
        <div className="w-full max-w-sm text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-600">
            <span className="text-lg font-bold text-white">!</span>
          </div>
          <h1 className="text-xl font-bold text-zinc-900">Aplikasi bermasalah</h1>
          <p className="mt-2 text-sm text-zinc-500">
            Terjadi kesalahan yang tidak terduga. Coba muat ulang halaman.
          </p>
          <button
            onClick={unstable_retry}
            className="mt-6 w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
          >
            Muat Ulang
          </button>
        </div>
      </body>
    </html>
  );
}
