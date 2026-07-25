"use client";

import { useState } from "react";
import { PERMISSION_GROUPS } from "@/lib/permissions";

export default function PermissionChecklist({ defaultChecked = [] }: { defaultChecked?: string[] }) {
  const [checked, setChecked] = useState(new Set(defaultChecked));

  function toggle(key: string) {
    setChecked((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="space-y-3">
      {PERMISSION_GROUPS.map((group) => (
        <div key={group.title}>
          <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-zinc-400">
            {group.title}
          </p>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {group.items.map((item) => (
              <label
                key={item.key}
                className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-200 px-2 py-1.5 text-xs has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50"
              >
                <input
                  type="checkbox"
                  name="permissions"
                  value={item.key}
                  checked={checked.has(item.key)}
                  onChange={() => toggle(item.key)}
                  className="accent-brand-600"
                />
                {item.label}
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
