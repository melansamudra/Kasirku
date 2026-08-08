"use client";

import { useState, useTransition } from "react";
import { Eye, EyeOff } from "lucide-react";
import { toggleTransactionMirrorVisibility } from "./mirror-actions";

export default function MirrorToggle({
  businessId,
  transactionId,
  visible: initialVisible,
}: {
  businessId: string;
  transactionId: string;
  visible: boolean;
}) {
  const [visible, setVisible] = useState(initialVisible);
  const [pending, startTransition] = useTransition();

  function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const next = !visible;
    setVisible(next);
    startTransition(() => {
      toggleTransactionMirrorVisibility(businessId, transactionId, next);
    });
  }

  return (
    <button
      onClick={toggle}
      disabled={pending}
      title={visible ? "Tampil di akun mirror (klik untuk sembunyikan)" : "Tersembunyi dari akun mirror (klik untuk tampilkan)"}
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-50 ${
        visible
          ? "bg-brand-50 text-brand-600 hover:bg-brand-100"
          : "bg-zinc-100 text-zinc-400 hover:bg-zinc-200"
      }`}
    >
      {visible ? <Eye size={15} /> : <EyeOff size={15} />}
    </button>
  );
}
