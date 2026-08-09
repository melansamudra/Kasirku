"use client";

import { useState, useTransition } from "react";
import { resendMirrorInvite } from "./actions";

export default function ResendInviteButton({
  businessId,
  mirrorAccountId,
}: {
  businessId: string;
  mirrorAccountId: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ error: string | null; success: boolean } | null>(null);

  function handleResend() {
    startTransition(async () => {
      const res = await resendMirrorInvite(businessId, mirrorAccountId);
      setResult(res);
      if (res.success) {
        setTimeout(() => setResult(null), 4000);
      }
    });
  }

  if (result?.success) {
    return <span className="text-[11px] font-medium text-green-600">✓ Email terkirim</span>;
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleResend}
        disabled={isPending}
        className="text-[11px] font-medium text-brand-600 hover:underline disabled:opacity-60"
      >
        {isPending ? "Mengirim…" : "Kirim Ulang Invite"}
      </button>
      {result?.error && (
        <span className="text-[11px] text-red-600">{result.error}</span>
      )}
    </div>
  );
}
