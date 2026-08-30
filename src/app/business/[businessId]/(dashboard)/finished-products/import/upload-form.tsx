"use client";

import { useActionState, useState } from "react";
import type { ParseState, ConfirmState, BahanResolution, BahanDecision, MatchCandidate } from "./upload-actions";

const emptyParseState: ParseState = { error: null, fileName: null, rows: null, resolutions: null, skipped: [] };
const emptyConfirmState: ConfirmState = { error: null, report: null };

type DecisionLocal = {
  action: "existing" | "new";
  componentId: string;
  componentType: "ingredient" | "semi_finished";
  name: string;
  unit: string;
  price: number;
};

const STATUS_LABEL: Record<BahanResolution["status"], { label: string; className: string }> = {
  matched: { label: "Cocok", className: "bg-green-50 text-green-700" },
  similar: { label: "Mirip — perlu dicek", className: "bg-amber-50 text-amber-700" },
  new: { label: "Baru", className: "bg-blue-50 text-blue-700" },
};

function candidateLabel(c: MatchCandidate) {
  return `${c.name} (${c.type === "semi_finished" ? "BSJ" : "Bahan Baku"})`;
}

export default function UploadForm({
  parseAction,
  confirmAction,
}: {
  parseAction: (state: ParseState, formData: FormData) => Promise<ParseState>;
  confirmAction: (state: ConfirmState, formData: FormData) => Promise<ConfirmState>;
}) {
  const [resetToken, setResetToken] = useState(0);
  return (
    <UploadWizard
      key={resetToken}
      parseAction={parseAction}
      confirmAction={confirmAction}
      onReset={() => setResetToken((n) => n + 1)}
    />
  );
}

function UploadWizard({
  parseAction,
  confirmAction,
  onReset,
}: {
  parseAction: (state: ParseState, formData: FormData) => Promise<ParseState>;
  confirmAction: (state: ConfirmState, formData: FormData) => Promise<ConfirmState>;
  onReset: () => void;
}) {
  const [parseState, runParse, parsePending] = useActionState(parseAction, emptyParseState);
  const [confirmState, runConfirm, confirmPending] = useActionState(confirmAction, emptyConfirmState);
  const [decisions, setDecisions] = useState<Record<string, DecisionLocal>>({});

  // Turunan dari parseState.resolutions tiap kali hasil parse berubah --
  // "adjusting state during render" (bukan useEffect+setState) sesuai pola
  // resmi React buat kasus prop/state berubah, biar tidak kena lint
  // react-hooks/set-state-in-effect.
  const [prevResolutions, setPrevResolutions] = useState(parseState.resolutions);
  if (parseState.resolutions !== prevResolutions) {
    setPrevResolutions(parseState.resolutions);
    if (parseState.resolutions) {
      const init: Record<string, DecisionLocal> = {};
      for (const r of parseState.resolutions) {
        const firstCandidate = r.candidates[0];
        init[r.bahan] = {
          action: r.status === "new" ? "new" : "existing",
          componentId: r.matchedId ?? firstCandidate?.id ?? "",
          componentType: r.matchedType ?? firstCandidate?.type ?? "ingredient",
          name: r.bahan,
          unit: r.suggestedUnit,
          price: r.suggestedPrice,
        };
      }
      setDecisions(init);
    }
  }

  if (confirmState.report && !confirmPending) {
    return (
      <div className="space-y-3">
        <div className="rounded-lg bg-green-50 px-3 py-2 text-xs text-green-700">
          <p>
            Berhasil: {confirmState.report.itemCount} menu, {confirmState.report.rowCount} baris bahan tersimpan.
          </p>
          {confirmState.report.newIngredients.length > 0 && (
            <p className="mt-1">Bahan baku baru dibuat: {confirmState.report.newIngredients.join(", ")}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onReset}
          className="rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
        >
          Upload File Lain
        </button>
      </div>
    );
  }

  if (parseState.rows && parseState.resolutions) {
    const needsAttention = parseState.resolutions.filter((r) => r.status !== "matched");
    const matchedCount = parseState.resolutions.length - needsAttention.length;

    return (
      <div className="space-y-4">
        <div className="text-xs text-zinc-500">
          File <span className="font-medium text-zinc-700">{parseState.fileName}</span> — {parseState.rows.length}{" "}
          baris bahan, {parseState.resolutions.length} nama bahan unik ({matchedCount} langsung cocok).
        </div>

        {parseState.skipped.length > 0 && (
          <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
            <p className="font-medium">{parseState.skipped.length} baris dilewati:</p>
            <ul className="mt-1 list-disc pl-4">
              {parseState.skipped.slice(0, 10).map((s) => (
                <li key={s.rowNum}>
                  Baris {s.rowNum}: {s.reason}
                </li>
              ))}
              {parseState.skipped.length > 10 && <li>...dan {parseState.skipped.length - 10} baris lain</li>}
            </ul>
          </div>
        )}

        {needsAttention.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-semibold text-zinc-700">
              Perlu dicek ({needsAttention.length} bahan):
            </p>
            <div className="space-y-2">
              {needsAttention.map((r) => {
                const d = decisions[r.bahan];
                if (!d) return null;
                const badge = STATUS_LABEL[r.status];
                return (
                  <div key={r.bahan} className="rounded-xl border border-zinc-200 p-3">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="text-sm font-medium text-zinc-800">{r.bahan}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${badge.className}`}>
                        {badge.label}
                      </span>
                    </div>
                    <div className="space-y-2 text-xs">
                      {r.candidates.length > 0 && (
                        <label className="flex items-center gap-2">
                          <input
                            type="radio"
                            checked={d.action === "existing"}
                            onChange={() =>
                              setDecisions((prev) => ({ ...prev, [r.bahan]: { ...prev[r.bahan], action: "existing" } }))
                            }
                          />
                          Pakai yang sudah ada:
                          <select
                            value={d.componentId}
                            disabled={d.action !== "existing"}
                            onChange={(e) => {
                              const chosen = r.candidates.find((c) => c.id === e.target.value);
                              setDecisions((prev) => ({
                                ...prev,
                                [r.bahan]: {
                                  ...prev[r.bahan],
                                  componentId: e.target.value,
                                  componentType: chosen?.type ?? prev[r.bahan].componentType,
                                },
                              }));
                            }}
                            className="rounded-lg border border-zinc-200 px-2 py-1"
                          >
                            {r.candidates.map((c) => (
                              <option key={c.id} value={c.id}>
                                {candidateLabel(c)}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                      <label className="flex flex-wrap items-center gap-2">
                        <input
                          type="radio"
                          checked={d.action === "new"}
                          onChange={() =>
                            setDecisions((prev) => ({ ...prev, [r.bahan]: { ...prev[r.bahan], action: "new" } }))
                          }
                        />
                        Buat bahan baku baru:
                        <input
                          type="text"
                          value={d.name}
                          disabled={d.action !== "new"}
                          onChange={(e) =>
                            setDecisions((prev) => ({ ...prev, [r.bahan]: { ...prev[r.bahan], name: e.target.value } }))
                          }
                          className="w-36 rounded-lg border border-zinc-200 px-2 py-1"
                        />
                        <input
                          type="text"
                          value={d.unit}
                          placeholder="satuan"
                          disabled={d.action !== "new"}
                          onChange={(e) =>
                            setDecisions((prev) => ({ ...prev, [r.bahan]: { ...prev[r.bahan], unit: e.target.value } }))
                          }
                          className="w-20 rounded-lg border border-zinc-200 px-2 py-1"
                        />
                        <input
                          type="number"
                          value={d.price}
                          placeholder="harga awal"
                          disabled={d.action !== "new"}
                          onChange={(e) =>
                            setDecisions((prev) => ({
                              ...prev,
                              [r.bahan]: { ...prev[r.bahan], price: Number(e.target.value) },
                            }))
                          }
                          className="w-24 rounded-lg border border-zinc-200 px-2 py-1"
                        />
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {confirmState.error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{confirmState.error}</p>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onReset}
            className="rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
          >
            Batal
          </button>
          <form
            action={(fd) => {
              const decisionList: BahanDecision[] = (parseState.resolutions ?? []).map((r) => {
                const d = decisions[r.bahan];
                return d.action === "existing"
                  ? { bahan: r.bahan, action: "existing", componentId: d.componentId, componentType: d.componentType }
                  : { bahan: r.bahan, action: "new", name: d.name, unit: d.unit, price: d.price };
              });
              fd.set("rows", JSON.stringify(parseState.rows));
              fd.set("decisions", JSON.stringify(decisionList));
              fd.set("fileName", parseState.fileName ?? "upload.xlsx");
              runConfirm(fd);
            }}
          >
            <button
              type="submit"
              disabled={confirmPending}
              className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {confirmPending ? "Menyimpan…" : "Konfirmasi & Simpan"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <form action={runParse} className="space-y-3">
      <div>
        <label htmlFor="file" className="mb-1 block text-xs font-medium text-zinc-600">
          File Excel (.xlsx)
        </label>
        <input
          id="file"
          name="file"
          type="file"
          accept=".xlsx"
          required
          className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-brand-700"
        />
        <p className="mt-1 text-[11px] text-zinc-400">
          Format kolom harus sesuai template:{" "}
          <a href="/template-resep-produk-jadi" className="font-medium text-brand-600 hover:underline">
            download template di sini
          </a>
          . &quot;Nama Bahan&quot; boleh Bahan Baku atau Bahan Setengah Jadi yang sudah ada.
        </p>
      </div>

      {parseState.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{parseState.error}</p>}

      <button
        type="submit"
        disabled={parsePending}
        className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {parsePending ? "Membaca file…" : "Baca File"}
      </button>
    </form>
  );
}
