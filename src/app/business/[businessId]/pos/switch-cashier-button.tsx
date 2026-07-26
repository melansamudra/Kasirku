"use client";

import { useRouter } from "next/navigation";
import { switchCashier } from "./actions";

export default function SwitchCashierButton({
  className,
  onBeforeSwitch,
}: {
  className?: string;
  onBeforeSwitch?: () => void;
} = {}) {
  const router = useRouter();

  async function handleClick() {
    onBeforeSwitch?.();
    await switchCashier();
    router.refresh();
  }

  return (
    <button
      onClick={handleClick}
      className={
        className ??
        "mt-6 w-full rounded-xl border border-zinc-200 py-2.5 text-sm font-semibold text-zinc-600 transition-colors hover:bg-zinc-50"
      }
    >
      Ganti Kasir
    </button>
  );
}
