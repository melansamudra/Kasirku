"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { generateMissingBarcodes } from "./actions";

export default function GenerateBarcodesButton({ businessId }: { businessId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setPending(true);
    setError(null);
    const result = await generateMissingBarcodes(businessId);
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.push(`/business/${businessId}/ingredients/print-barcodes`);
  }

  return (
    <div className="shrink-0 text-right">
      <button
        onClick={handleClick}
        disabled={pending}
        className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Menyiapkan…" : "🖨️ Generate & Cetak Barcode"}
      </button>
      {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}
    </div>
  );
}
