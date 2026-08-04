"use client";

import { useState } from "react";

export default function CopyPhonesButton({ phones }: { phones: string[] }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(phones.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      onClick={handleCopy}
      className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50"
    >
      {copied ? "✓ Tersalin!" : `📋 Salin ${phones.length} nomor HP`}
    </button>
  );
}
