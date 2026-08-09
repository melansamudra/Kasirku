"use client";

import { Capacitor } from "@capacitor/core";

export default function MirrorHint() {
  if (Capacitor.isNativePlatform()) return null;
  return (
    <p className="mt-2 text-xs text-zinc-400">
      Ikon <span className="font-medium text-brand-600">👁</span> di setiap transaksi mengontrol visibilitas di akun mirror.
    </p>
  );
}
