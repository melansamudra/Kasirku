import Link from "next/link";

export type ManualDocHistoryEntry = {
  id: string;
  docNumber: string;
  contextLine: string;
  createdByName: string | null;
  createdAt: string;
  href: string;
};

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ManualDocHistory({
  entries,
  emptyText,
}: {
  entries: ManualDocHistoryEntry[];
  emptyText: string;
}) {
  if (entries.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400">
        {emptyText}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {entries.map((e) => (
        <Link
          key={e.id}
          href={e.href}
          className="block rounded-xl border border-zinc-200 bg-white px-4 py-3 hover:border-brand-300"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-zinc-900">{e.docNumber}</p>
            <p className="text-[10.5px] text-zinc-400">{formatDateTime(e.createdAt)}</p>
          </div>
          <p className="text-xs text-zinc-500">{e.contextLine}</p>
          {e.createdByName && <p className="text-[10.5px] text-zinc-400">Oleh {e.createdByName}</p>}
        </Link>
      ))}
    </div>
  );
}
