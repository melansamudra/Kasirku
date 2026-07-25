"use client";

import { useActionState, useState } from "react";
import type { UpdatePermissionsState } from "./actions";
import PermissionChecklist from "./permission-checklist";

const initialState: UpdatePermissionsState = { error: null };

export default function EditPermissionsForm({
  currentPermissions,
  action,
}: {
  currentPermissions: string[];
  action: (state: UpdatePermissionsState, formData: FormData) => Promise<UpdatePermissionsState>;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(action, initialState);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="shrink-0 text-xs font-medium text-zinc-400 hover:text-brand-600 hover:underline"
      >
        Ubah Izin
      </button>
    );
  }

  return (
    <form action={formAction} className="mt-3 w-full space-y-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
      <PermissionChecklist defaultChecked={currentPermissions} />
      {state.error && <p className="text-xs text-red-600">{state.error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {pending ? "Menyimpan…" : "Simpan"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-zinc-400 hover:text-zinc-600"
        >
          Batal
        </button>
      </div>
    </form>
  );
}
