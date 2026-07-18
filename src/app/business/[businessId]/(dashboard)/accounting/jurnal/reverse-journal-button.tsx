"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { reverseJournalEntry } from "./actions";

export default function ReverseJournalButton({
  businessId,
  entryId,
}: {
  businessId: string;
  entryId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <div className="flex justify-end px-4 py-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="shrink-0 text-[11px] font-semibold text-zinc-400 hover:text-brand-600"
        >
          ↩ Koreksi
        </button>
      </div>
    );
  }

  return (
    <div className="border-t border-zinc-100 bg-zinc-50 px-4 py-3">
      <p className="text-xs text-zinc-600">
        Ini akan membuat jurnal baru yang membalikkan seluruh baris jurnal ini (debit ↔ kredit
        ditukar, tanggal hari ini). Jurnal asli tetap tersimpan sebagai riwayat — bukan dihapus.
      </p>
      <input
        type="text"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Alasan koreksi (opsional)"
        className="mt-2 w-full rounded-lg border border-zinc-200 px-2.5 py-2 text-xs focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
      />
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={async () => {
            setPending(true);
            setError(null);
            const result = await reverseJournalEntry(businessId, entryId, note);
            setPending(false);
            if (result.error) {
              setError(result.error);
              return;
            }
            setOpen(false);
            router.refresh();
          }}
          className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Memproses…" : "Ya, Buat Jurnal Koreksi"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={pending}
          className="rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-700"
        >
          Batal
        </button>
      </div>
    </div>
  );
}
