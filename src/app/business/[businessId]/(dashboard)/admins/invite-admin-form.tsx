"use client";

import { useActionState, useRef, useEffect, useState } from "react";
import type { InviteAdminState } from "./actions";
import PermissionChecklist from "./permission-checklist";

const initialState: InviteAdminState = { error: null };

const KASIR_DEFAULT_PERMISSIONS = [
  "pos",
  "reports",
  "transactions",
  "shifts",
  "kas-harian",
  "products",
  "settings",
  "purchases",
  "suppliers",
];

export default function InviteAdminForm({
  action,
}: {
  action: (state: InviteAdminState, formData: FormData) => Promise<InviteAdminState>;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const [role, setRole] = useState<"kasir" | "admin">("kasir");

  useEffect(() => {
    if (!pending && !state.error) {
      // formRef.current?.reset() adalah DOM mutation lewat ref — harus di
      // effect, tidak bisa "adjust during render". setRole ikut di sini
      // karena triggernya sama (submit sukses).
      formRef.current?.reset();
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRole("kasir");
    }
  }, [pending, state.error]);

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="name" className="mb-1 block text-xs font-medium text-zinc-600">
            Nama
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
            placeholder="mis. Sari"
          />
        </div>
        <div>
          <label htmlFor="email" className="mb-1 block text-xs font-medium text-zinc-600">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
            placeholder="admin@email.com"
          />
        </div>
      </div>

      {/* Role toggle */}
      <div>
        <p className="mb-1.5 text-xs font-medium text-zinc-600">Tipe akun</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setRole("kasir")}
            className={`flex-1 rounded-xl border py-2.5 text-sm font-medium transition-colors ${
              role === "kasir"
                ? "border-brand-600 bg-brand-50 text-brand-700"
                : "border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-50"
            }`}
          >
            🧾 Kasir
          </button>
          <button
            type="button"
            onClick={() => setRole("admin")}
            className={`flex-1 rounded-xl border py-2.5 text-sm font-medium transition-colors ${
              role === "admin"
                ? "border-brand-600 bg-brand-50 text-brand-700"
                : "border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-50"
            }`}
          >
            ⚙️ Admin
          </button>
        </div>
        {role === "kasir" && (
          <p className="mt-1.5 text-[11px] text-zinc-400">
            Permission dasar kasir sudah dicentang otomatis. Bisa diubah sesuai kebutuhan.
          </p>
        )}
      </div>

      <div>
        <p className="mb-1.5 text-xs font-medium text-zinc-600">Fitur yang boleh diakses</p>
        <PermissionChecklist
          key={role}
          defaultChecked={role === "kasir" ? KASIR_DEFAULT_PERMISSIONS : []}
        />
      </div>

      {state.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Mengirim undangan…" : "Undang"}
      </button>
    </form>
  );
}
