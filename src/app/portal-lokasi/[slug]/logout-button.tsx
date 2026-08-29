"use client";

import { useRouter } from "next/navigation";
import { logoutPortal } from "./actions";

export default function LogoutButton() {
  const router = useRouter();

  function handleLogout() {
    logoutPortal().then(() => router.refresh());
  }

  return (
    <button onClick={handleLogout} className="text-xs font-medium text-zinc-400 hover:text-red-600">
      Ganti Staf
    </button>
  );
}
