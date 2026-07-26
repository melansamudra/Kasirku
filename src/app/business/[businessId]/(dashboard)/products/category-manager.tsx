"use client";

import { useActionState, useRef, useEffect, useState } from "react";
import { deleteProductCategory, type CategoryActionState } from "./actions";

const initialState: CategoryActionState = { error: null };

type Category = { id: string; name: string };

export default function CategoryManager({
  businessId,
  categories,
  action,
}: {
  businessId: string;
  categories: Category[];
  action: (state: CategoryActionState, formData: FormData) => Promise<CategoryActionState>;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!pending && !state.error) {
      formRef.current?.reset();
    }
  }, [pending, state.error]);

  async function handleDelete(categoryId: string) {
    setDeletingId(categoryId);
    await deleteProductCategory(businessId, categoryId);
    setDeletingId(null);
  }

  return (
    <div className="rounded-xl bg-white shadow-sm p-5">
      <h2 className="text-sm font-semibold text-zinc-900">Kategori</h2>
      <p className="mt-1 text-xs text-zinc-500">
        Produk memilih kategori dari daftar ini — mencegah salah ketik yang bisa membuat printer
        dapur/bar salah arah, dan dipakai untuk menyaring tampilan di kasir.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {categories.length === 0 && (
          <p className="text-xs text-zinc-400">Belum ada kategori — tambahkan dulu di bawah.</p>
        )}
        {categories.map((c) => (
          <span
            key={c.id}
            className="flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-medium text-zinc-700"
          >
            {c.name}
            <button
              type="button"
              onClick={() => handleDelete(c.id)}
              disabled={deletingId === c.id}
              className="text-zinc-400 hover:text-red-500 disabled:opacity-50"
              aria-label={`Hapus kategori ${c.name}`}
            >
              ✕
            </button>
          </span>
        ))}
      </div>

      <form ref={formRef} action={formAction} className="mt-3 flex gap-2">
        <input
          name="name"
          type="text"
          placeholder="mis. Minuman"
          className="flex-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
        <button
          type="submit"
          disabled={pending}
          className="shrink-0 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Menambah…" : "+ Tambah Kategori"}
        </button>
      </form>
      {state.error && <p className="mt-2 text-xs text-red-600">{state.error}</p>}
    </div>
  );
}
