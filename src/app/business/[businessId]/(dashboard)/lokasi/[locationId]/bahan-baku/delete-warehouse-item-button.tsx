"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

export default function DeleteWarehouseItemButton({
  itemName,
  action,
}: {
  itemName: string;
  action: () => Promise<{ error: string | null }>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    if (!confirm(`Hapus barang "${itemName}" dari Gudang? Riwayat penyesuaian stoknya tetap tersimpan.`)) return;
    startTransition(async () => {
      await action();
      router.refresh();
    });
  }

  return (
    <button
      onClick={handleDelete}
      disabled={isPending}
      className="shrink-0 text-xs font-medium text-zinc-400 hover:text-red-600 hover:underline disabled:opacity-50"
    >
      Hapus
    </button>
  );
}
