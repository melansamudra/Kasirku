"use client";

import { useActionState, useRef, useEffect, useState } from "react";
import {
  addTicketCategory,
  updateTicketCategory,
  deleteTicketCategory,
  type TicketCategoryState,
} from "./actions";

const initialState: TicketCategoryState = { error: null };

function formatRupiah(value: number) {
  return `Rp${value.toLocaleString("id-ID")}`;
}

type TicketCategory = {
  id: string;
  name: string;
  price_weekday: number;
  price_holiday: number;
  member_price: number;
};

function CategoryEditForm({
  businessId,
  category,
  onDone,
}: {
  businessId: string;
  category: TicketCategory;
  onDone: () => void;
}) {
  const boundAction = updateTicketCategory.bind(null, businessId, category.id);
  const [state, formAction, pending] = useActionState(boundAction, initialState);

  useEffect(() => {
    if (!pending && !state.error) {
      onDone();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, state.error]);

  return (
    <form action={formAction} className="grid grid-cols-2 gap-2 rounded-xl bg-zinc-50 p-3">
      <input
        name="name"
        type="text"
        defaultValue={category.name}
        required
        placeholder="Nama kategori"
        className="col-span-2 rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
      />
      <div>
        <label className="mb-1 block text-[11px] text-zinc-500">Harga Hari Kerja</label>
        <input
          name="priceWeekday"
          type="number"
          min="0"
          defaultValue={category.price_weekday}
          required
          className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </div>
      <div>
        <label className="mb-1 block text-[11px] text-zinc-500">Harga Hari Libur</label>
        <input
          name="priceHoliday"
          type="number"
          min="0"
          defaultValue={category.price_holiday}
          required
          className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </div>
      <div className="col-span-2">
        <label className="mb-1 block text-[11px] text-zinc-500">Harga Member</label>
        <input
          name="memberPrice"
          type="number"
          min="0"
          defaultValue={category.member_price}
          required
          className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </div>
      {state.error && <p className="col-span-2 text-xs text-red-600">{state.error}</p>}
      <div className="col-span-2 flex gap-2">
        <button
          type="button"
          onClick={onDone}
          className="flex-1 rounded-lg border border-zinc-200 bg-white py-2 text-xs font-semibold text-zinc-600 hover:bg-zinc-50"
        >
          Batal
        </button>
        <button
          type="submit"
          disabled={pending}
          className="flex-1 rounded-lg bg-brand-600 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-60"
        >
          {pending ? "Menyimpan…" : "Simpan"}
        </button>
      </div>
    </form>
  );
}

function CategoryRow({ businessId, category }: { businessId: string; category: TicketCategory }) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <CategoryEditForm
        businessId={businessId}
        category={category}
        onDone={() => setEditing(false)}
      />
    );
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-zinc-900">{category.name}</p>
        <div className="flex gap-3">
          <button
            onClick={() => setEditing(true)}
            className="text-xs font-medium text-brand-700 hover:underline"
          >
            Edit
          </button>
          <button
            onClick={() => deleteTicketCategory(businessId, category.id)}
            className="text-xs font-medium text-red-600 hover:underline"
          >
            Hapus
          </button>
        </div>
      </div>
      <p className="mt-1 text-xs text-zinc-500">
        Hari kerja {formatRupiah(category.price_weekday)} · Hari libur{" "}
        {formatRupiah(category.price_holiday)} · Member {formatRupiah(category.member_price)}
      </p>
    </div>
  );
}

export default function TicketCategoriesSection({
  businessId,
  categories,
}: {
  businessId: string;
  categories: TicketCategory[];
}) {
  const boundAddAction = addTicketCategory.bind(null, businessId);
  const [state, formAction, pending] = useActionState(boundAddAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!pending && !state.error) {
      formRef.current?.reset();
    }
  }, [pending, state.error]);

  return (
    <div className="mt-6 rounded-xl bg-white shadow-sm p-5">
      <h2 className="text-sm font-semibold text-zinc-900">Kategori & Harga Tiket</h2>
      <p className="mt-1 text-xs text-zinc-500">
        Harga hari libur berlaku otomatis tiap Sabtu-Minggu, ditambah tanggal yang ditandai
        manual di bawah.
      </p>

      <div className="mt-4 space-y-2">
        {categories.length > 0 ? (
          categories.map((c) => (
            <CategoryRow key={c.id} businessId={businessId} category={c} />
          ))
        ) : (
          <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-4 text-center text-xs text-zinc-400">
            Belum ada kategori tiket. Tambahkan minimal satu supaya kasir bisa mulai jualan.
          </p>
        )}
      </div>

      <form
        ref={formRef}
        action={formAction}
        className="mt-4 grid grid-cols-2 gap-2 border-t border-zinc-100 pt-4"
      >
        <input
          name="name"
          type="text"
          required
          placeholder="mis. Pengunjung"
          className="col-span-2 rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
        <div>
          <label className="mb-1 block text-[11px] text-zinc-500">Harga Hari Kerja</label>
          <input
            name="priceWeekday"
            type="number"
            min="0"
            required
            placeholder="mis. 25000"
            className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] text-zinc-500">Harga Hari Libur</label>
          <input
            name="priceHoliday"
            type="number"
            min="0"
            required
            placeholder="mis. 35000"
            className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>
        <div className="col-span-2">
          <label className="mb-1 block text-[11px] text-zinc-500">Harga Member</label>
          <input
            name="memberPrice"
            type="number"
            min="0"
            required
            placeholder="mis. 0"
            className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>
        {state.error && <p className="col-span-2 text-xs text-red-600">{state.error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="col-span-2 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Menyimpan…" : "+ Tambah Kategori"}
        </button>
      </form>
    </div>
  );
}
