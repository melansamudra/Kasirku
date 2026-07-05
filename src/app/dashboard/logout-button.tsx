"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LogoutButton({
  variant = "block",
}: {
  variant?: "block" | "inline";
}) {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  if (variant === "inline") {
    return (
      <button
        onClick={handleLogout}
        className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-600 transition-colors hover:bg-zinc-50"
      >
        Keluar
      </button>
    );
  }

  return (
    <button
      onClick={handleLogout}
      className="mt-6 w-full rounded-xl border border-zinc-200 py-2.5 text-sm font-semibold text-zinc-600 transition-colors hover:bg-zinc-50"
    >
      Keluar
    </button>
  );
}
