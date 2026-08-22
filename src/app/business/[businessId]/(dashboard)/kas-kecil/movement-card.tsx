"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { reviewCashMovement } from "./actions";

type Account = { code: string; name: string };

function formatRupiah(value: number) {
  return `Rp${Math.round(value).toLocaleString("id-ID")}`;
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function MovementCard({
  businessId,
  accounts,
  movement,
}: {
  businessId: string;
  accounts: Account[];
  movement: {
    id: string;
    amount: number;
    category: string | null;
    description: string;
    receiptUrl: string | null;
    createdAt: string;
    origin: "kasir" | "admin";
    cashierName: string | null;
  };
}) {
  const router = useRouter();
  // Sengaja tidak default ke accounts[0] — kalau admin tidak sadar dan
  // langsung klik Setujui, pengeluaran ini harus tetap gagal (bukan
  // kepilih akun sembarangan/pertama di daftar).
  const [accountCode, setAccountCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmReject, setConfirmReject] = useState(false);

  function handleApprove() {
    if (!accountCode) {
      setError("Pilih akun dulu.");
      return;
    }
    setError(null);
    setPending(true);
    reviewCashMovement(businessId, movement.id, "approve", accountCode).then((res) => {
      setPending(false);
      if (res.error) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  function handleReject() {
    setError(null);
    setPending(true);
    reviewCashMovement(businessId, movement.id, "reject").then((res) => {
      setPending(false);
      setConfirmReject(false);
      if (res.error) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-zinc-900">{movement.description}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-400">
            <span>{formatDateTime(movement.createdAt)}</span>
            <span>·</span>
            <span>{movement.origin === "admin" ? "Input Admin" : movement.cashierName ?? "Kasir"}</span>
            {movement.category && (
              <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 font-medium text-zinc-600">
                {movement.category}
              </span>
            )}
            {movement.receiptUrl && (
              <a
                href={movement.receiptUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-full bg-amber-50 px-1.5 py-0.5 font-medium text-amber-700 hover:bg-amber-100"
              >
                🧾 Lihat Nota
              </a>
            )}
          </div>
        </div>
        <p className="shrink-0 text-sm font-bold text-red-600">-{formatRupiah(movement.amount)}</p>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select
          value={accountCode}
          onChange={(e) => setAccountCode(e.target.value)}
          disabled={pending}
          className="flex-1 min-w-[180px] rounded-lg border border-zinc-200 px-2.5 py-2 text-xs focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        >
          <option value="" disabled>— Pilih akun —</option>
          {accounts.map((a) => (
            <option key={a.code} value={a.code}>
              {a.code} — {a.name}
            </option>
          ))}
        </select>
        <button
          onClick={handleApprove}
          disabled={pending}
          className="rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
        >
          {pending ? "Memproses…" : "✅ Setujui"}
        </button>
        {confirmReject ? (
          <span className="flex items-center gap-1.5 text-[11px]">
            <button
              onClick={handleReject}
              disabled={pending}
              className="font-semibold text-red-600 hover:underline disabled:opacity-50"
            >
              Yakin tolak?
            </button>
            <button
              onClick={() => setConfirmReject(false)}
              className="text-zinc-400 hover:text-zinc-600"
            >
              Batal
            </button>
          </span>
        ) : (
          <button
            onClick={() => setConfirmReject(true)}
            disabled={pending}
            className="rounded-lg border border-zinc-200 px-3 py-2 text-xs font-medium text-zinc-500 transition-colors hover:bg-zinc-50 disabled:opacity-50"
          >
            ✕ Tolak
          </button>
        )}
      </div>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
