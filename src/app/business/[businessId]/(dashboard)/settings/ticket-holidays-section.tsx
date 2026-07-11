"use client";

import { useActionState, useRef, useEffect } from "react";
import { addTicketHoliday, deleteTicketHoliday, type TicketHolidayState } from "./actions";

const initialState: TicketHolidayState = { error: null };

type TicketHoliday = { id: string; holiday_date: string; label: string | null };

export default function TicketHolidaysSection({
  businessId,
  holidays,
}: {
  businessId: string;
  holidays: TicketHoliday[];
}) {
  const boundAddAction = addTicketHoliday.bind(null, businessId);
  const [state, formAction, pending] = useActionState(boundAddAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!pending && !state.error) {
      formRef.current?.reset();
    }
  }, [pending, state.error]);

  const sorted = [...holidays].sort((a, b) => a.holiday_date.localeCompare(b.holiday_date));

  return (
    <div className="mt-6 rounded-xl bg-white shadow-sm p-5">
      <h2 className="text-sm font-semibold text-zinc-900">Kalender Libur</h2>
      <p className="mt-1 text-xs text-zinc-500">
        Tandai tanggal tambahan (mis. libur nasional/cuti bersama) yang ikut kena harga hari
        libur, selain Sabtu-Minggu yang sudah otomatis.
      </p>

      <div className="mt-4 space-y-2">
        {sorted.length > 0 ? (
          sorted.map((h) => (
            <div
              key={h.id}
              className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-4 py-2.5"
            >
              <div>
                <p className="text-sm font-medium text-zinc-900">
                  {new Date(`${h.holiday_date}T00:00:00`).toLocaleDateString("id-ID", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </p>
                {h.label && <p className="text-xs text-zinc-500">{h.label}</p>}
              </div>
              <button
                onClick={() => deleteTicketHoliday(businessId, h.id)}
                className="text-xs font-medium text-red-600 hover:underline"
              >
                Hapus
              </button>
            </div>
          ))
        ) : (
          <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-4 text-center text-xs text-zinc-400">
            Belum ada tanggal libur tambahan yang ditandai.
          </p>
        )}
      </div>

      <form
        ref={formRef}
        action={formAction}
        className="mt-4 flex flex-wrap gap-2 border-t border-zinc-100 pt-4"
      >
        <input
          name="holidayDate"
          type="date"
          required
          className="rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
        <input
          name="label"
          type="text"
          placeholder="Label (opsional), mis. Tahun Baru"
          className="min-w-[10rem] flex-1 rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
        <button
          type="submit"
          disabled={pending}
          className="shrink-0 whitespace-nowrap rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Menyimpan…" : "+ Tandai"}
        </button>
        {state.error && <p className="w-full text-xs text-red-600">{state.error}</p>}
      </form>
    </div>
  );
}
