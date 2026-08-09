"use client";

import { useState } from "react";
import MirrorSidebar, { type MirrorPerms } from "./mirror-sidebar";
import LogoutButton from "@/app/dashboard/logout-button";

export default function MirrorViewShell({
  businessId,
  businessName,
  businessType,
  perms,
  today,
  children,
}: {
  businessId: string;
  businessName: string;
  businessType: string;
  perms: MirrorPerms;
  today: string;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen w-full bg-[#F4F6F9]">
      {/* Sidebar — desktop */}
      <aside className="hidden w-64 shrink-0 bg-white shadow-[1px_0_3px_rgba(0,0,0,0.04)] md:block">
        <div className="sticky top-0 h-screen">
          <MirrorSidebar
            businessId={businessId}
            businessName={businessName}
            businessType={businessType}
            perms={perms}
          />
        </div>
      </aside>

      {/* Sidebar drawer — mobile */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-72 bg-white shadow-xl">
            <MirrorSidebar
              businessId={businessId}
              businessName={businessName}
              businessType={businessType}
              perms={perms}
              onNavigate={() => setMobileOpen(false)}
            />
          </div>
        </div>
      )}

      <div className="min-w-0 flex-1 overflow-y-auto h-dvh">
        {/* Topbar — desktop */}
        <div className="sticky top-0 z-10 hidden items-center justify-between bg-white px-8 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.06)] md:flex">
          <div>
            <p className="text-sm font-bold text-zinc-800">{businessName}</p>
            <p className="text-[11.5px] text-zinc-400">{today}</p>
          </div>
          <LogoutButton variant="inline" />
        </div>

        {/* Topbar — mobile */}
        <div className="flex items-center gap-3 bg-white px-4 py-3 shadow-[0_1px_3px_rgba(0,0,0,0.06)] md:hidden">
          <button
            onClick={() => setMobileOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600"
            aria-label="Buka menu"
          >
            ☰
          </button>
          <p className="flex-1 truncate text-sm font-bold text-zinc-800">{businessName}</p>
          <LogoutButton variant="inline" />
        </div>

        <main className="w-full px-4 py-8 md:px-8 md:py-10">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
