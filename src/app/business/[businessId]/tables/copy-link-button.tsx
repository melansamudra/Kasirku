"use client";

import { useState } from "react";

export default function CopyLinkButton({ qrSlug }: { qrSlug: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const url = `${window.location.origin}/order/${qrSlug}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      onClick={handleCopy}
      className="rounded-lg border border-zinc-200 px-2.5 py-1 text-[11px] font-medium text-zinc-600 transition-colors hover:border-brand-300 hover:text-brand-700"
    >
      {copied ? "✓ Tersalin" : "Salin Link"}
    </button>
  );
}
