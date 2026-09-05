"use client";

import { useActionState, useRef, useEffect, useState } from "react";
import { deleteOpnameSection, type OpnameSectionActionState } from "./actions";

const initialState: OpnameSectionActionState = { error: null };

type Section = { id: string; name: string };

export default function OpnameSectionManager({
  businessId,
  sections,
  action,
}: {
  businessId: string;
  sections: Section[];
  action: (state: OpnameSectionActionState, formData: FormData) => Promise<OpnameSectionActionState>;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  useEffect(() => {
    if (!pending && !state.error) {
      formRef.current?.reset();
    }
  }, [pending, state.error]);

  async function handleDelete(sectionId: string) {
    setDeletingId(sectionId);
    await deleteOpnameSection(businessId, sectionId);
    setDeletingId(null);
    setConfirmingId(null);
  }

  return (
    <div className="rounded-xl bg-white shadow-sm p-5">
      <h2 className="text-sm font-semibold text-zinc-900">Bagian Stok Opname</h2>
      <p className="mt-1 text-xs text-zinc-500">
        Tandai tiap bahan baku masuk bagian apa (mis. Adonan, Topping, Kemasan) — supaya link Stok
        Opname bisa dipecah per bagian dan dikerjakan beberapa orang sekaligus, bukan 1 orang
        hitung semua bahan.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {sections.length === 0 && (
          <p className="text-xs text-zinc-400">Belum ada bagian — tambahkan dulu di bawah.</p>
        )}
        {sections.map((s) =>
          confirmingId === s.id ? (
            <span
              key={s.id}
              className="flex items-center gap-1.5 rounded-full border border-red-300 bg-red-50 px-3 py-1 text-xs font-medium text-red-700"
            >
              Hapus &quot;{s.name}&quot;? Semua bahan yang ditandai bagian ini akan lepas tag.
              <button
                type="button"
                onClick={() => handleDelete(s.id)}
                disabled={deletingId === s.id}
                className="font-semibold text-red-700 hover:underline disabled:opacity-50"
              >
                {deletingId === s.id ? "Menghapus…" : "Ya, Hapus"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmingId(null)}
                disabled={deletingId === s.id}
                className="font-medium text-zinc-500 hover:underline disabled:opacity-50"
              >
                Batal
              </button>
            </span>
          ) : (
            <span
              key={s.id}
              className="flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-medium text-zinc-700"
            >
              {s.name}
              <button
                type="button"
                onClick={() => setConfirmingId(s.id)}
                className="text-zinc-400 hover:text-red-500"
                aria-label={`Hapus bagian ${s.name}`}
              >
                ✕
              </button>
            </span>
          ),
        )}
      </div>

      <form ref={formRef} action={formAction} className="mt-3 flex gap-2">
        <input
          name="name"
          type="text"
          placeholder="mis. Adonan"
          className="flex-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
        <button
          type="submit"
          disabled={pending}
          className="shrink-0 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Menambah…" : "+ Tambah Bagian"}
        </button>
      </form>
      {state.error && <p className="mt-2 text-xs text-red-600">{state.error}</p>}
    </div>
  );
}
