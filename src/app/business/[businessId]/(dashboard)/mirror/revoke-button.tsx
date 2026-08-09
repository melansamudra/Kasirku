"use client";

import { useState, useTransition, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { revokeMirrorAccess } from "./actions";

type Step = "idle" | "confirming" | "sending" | "otp_entry" | "verifying" | "revoking";

export default function RevokeButton({
  businessId,
  mirrorAccountId,
  email,
  ownerEmail,
}: {
  businessId: string;
  mirrorAccountId: string;
  email: string;
  ownerEmail: string;
}) {
  const [step, setStep] = useState<Step>("idle");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setStep("idle");
    setOtp("");
    setError(null);
  }

  async function handleSendOtp() {
    setStep("sending");
    setError(null);
    const supabase = createClient();
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: ownerEmail,
      options: { shouldCreateUser: false },
    });
    if (otpError) {
      setError(otpError.message);
      setStep("otp_entry"); // tetap tampilkan input, beri tahu error
      return;
    }
    setStep("otp_entry");
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  async function handleVerifyAndRevoke() {
    if (otp.length !== 6) {
      setError("Kode harus 6 digit.");
      return;
    }
    setStep("verifying");
    setError(null);
    const supabase = createClient();
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: ownerEmail,
      token: otp,
      type: "email",
    });
    if (verifyError) {
      setError("Kode salah atau kedaluwarsa. Coba kirim ulang.");
      setStep("otp_entry");
      return;
    }
    setStep("revoking");
    startTransition(async () => {
      await revokeMirrorAccess(businessId, mirrorAccountId);
    });
  }

  if (step === "idle") {
    return (
      <button
        type="button"
        onClick={() => setStep("confirming")}
        className="text-[11px] font-medium text-red-600 hover:underline"
      >
        Cabut Akses
      </button>
    );
  }

  if (step === "confirming") {
    return (
      <div className="space-y-2 rounded-lg border border-red-100 bg-red-50 p-2.5">
        <p className="text-[11px] font-medium text-red-700">
          Cabut akses <span className="font-bold">{email}</span>?
        </p>
        <p className="text-[11px] text-zinc-500">
          Kode verifikasi akan dikirim ke email Anda (<span className="font-medium">{ownerEmail}</span>).
        </p>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={handleSendOtp}
            className="rounded-lg bg-red-600 px-3 py-1 text-[11px] font-semibold text-white hover:bg-red-700"
          >
            Kirim Kode
          </button>
          <button
            type="button"
            onClick={reset}
            className="rounded-lg border border-zinc-200 px-3 py-1 text-[11px] font-medium text-zinc-600 hover:bg-zinc-50"
          >
            Batal
          </button>
        </div>
      </div>
    );
  }

  if (step === "sending") {
    return (
      <p className="text-[11px] text-zinc-400">Mengirim kode ke {ownerEmail}…</p>
    );
  }

  if (step === "otp_entry" || step === "verifying") {
    return (
      <div className="space-y-2 rounded-lg border border-red-100 bg-red-50 p-2.5">
        <p className="text-[11px] font-medium text-red-700">
          Masukkan kode 6 digit yang dikirim ke <span className="font-bold">{ownerEmail}</span>
        </p>
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          value={otp}
          onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
          placeholder="_ _ _ _ _ _"
          disabled={step === "verifying"}
          className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-center text-sm font-bold tracking-widest focus:border-red-400 focus:outline-none disabled:opacity-60"
        />
        {error && <p className="text-[11px] text-red-600">{error}</p>}
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={handleVerifyAndRevoke}
            disabled={step === "verifying" || otp.length !== 6}
            className="rounded-lg bg-red-600 px-3 py-1 text-[11px] font-semibold text-white hover:bg-red-700 disabled:opacity-60"
          >
            {step === "verifying" ? "Memverifikasi…" : "Konfirmasi Cabut"}
          </button>
          <button
            type="button"
            onClick={() => setStep("confirming")}
            disabled={step === "verifying"}
            className="rounded-lg border border-zinc-200 px-3 py-1 text-[11px] font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-60"
          >
            Kirim Ulang
          </button>
          <button
            type="button"
            onClick={reset}
            disabled={step === "verifying"}
            className="text-[11px] text-zinc-400 hover:underline disabled:opacity-60"
          >
            Batal
          </button>
        </div>
      </div>
    );
  }

  // step === "revoking"
  return (
    <p className="text-[11px] text-zinc-400">Mencabut akses…</p>
  );
}
