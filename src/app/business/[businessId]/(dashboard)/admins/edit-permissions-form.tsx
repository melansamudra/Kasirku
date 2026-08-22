"use client";

import { useActionState, useState } from "react";
import type { UpdatePermissionsState } from "./actions";
import PermissionChecklist from "./permission-checklist";

const initialState: UpdatePermissionsState = { error: null };

export default function EditPermissionsForm({
  currentPermissions,
  currentRole,
  action,
}: {
  currentPermissions: string[];
  currentRole: "kasir" | "admin";
  action: (state: UpdatePermissionsState, formData: FormData) => Promise<UpdatePermissionsState>;
}) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<"kasir" | "admin">(currentRole);
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
      <input type="hidden" name="role" value={role} />
      <div>
        <p className="mb-1.5 text-xs font-medium text-zinc-600">Tipe akun</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setRole("kasir")}
            className={`flex-1 rounded-lg border py-2 text-xs font-medium transition-colors ${
              role === "kasir"
                ? "border-brand-600 bg-brand-50 text-brand-700"
                : "border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-100"
            }`}
          >
            🧾 Kasir
          </button>
          <button
            type="button"
            onClick={() => setRole("admin")}
            className={`flex-1 rounded-lg border py-2 text-xs font-medium transition-colors ${
              role === "admin"
                ? "border-brand-600 bg-brand-50 text-brand-700"
                : "border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-100"
            }`}
          >
            ⚙️ Admin
          </button>
        </div>
        <p className="mt-1.5 text-[11px] text-zinc-400">
          Admin bisa Setujui/Tolak di Kas Kecil; Kasir cuma lihat ringkasan.
        </p>
      </div>
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
