"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { lookupMemberByCode } from "./ticket-actions";
import { addMember, type AddMemberState } from "../(dashboard)/members/actions";
import AddMemberForm from "../(dashboard)/members/add-member-form";

export type SelectedMember = { id: string; name: string; memberCode: string; validUntil: string };

export type FullMember = {
  id: string;
  name: string;
  phone: string | null;
  memberCode: string;
  validFrom: string;
  validUntil: string;
};

export default function MemberPanel({
  businessId,
  members,
  member,
  onSelect,
  onRelease,
}: {
  businessId: string;
  members: FullMember[];
  member: SelectedMember | null;
  onSelect: (member: SelectedMember) => void;
  onRelease: () => void;
}) {
  const router = useRouter();
  const [memberCode, setMemberCode] = useState("");
  const [memberError, setMemberError] = useState<string | null>(null);
  const [memberBusy, setMemberBusy] = useState(false);
  const codeInputRef = useRef<HTMLInputElement>(null);

  const [listOpen, setListOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    if (!member) {
      codeInputRef.current?.focus();
    }
  }, [member]);

  const filteredMembers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return members;
    return members.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.memberCode.toLowerCase().includes(q) ||
        m.phone?.toLowerCase().includes(q),
    );
  }, [search, members]);

  async function handleLookup() {
    setMemberError(null);
    setMemberBusy(true);
    const result = await lookupMemberByCode(businessId, memberCode);
    setMemberBusy(false);
    if (!result.success) {
      setMemberError(result.error);
      return;
    }
    onSelect(result.member);
    setMemberCode("");
  }

  async function handleAddMember(state: AddMemberState, formData: FormData) {
    const result = await addMember(businessId, state, formData);
    if (!result.error) {
      router.refresh();
    }
    return result;
  }

  if (member) {
    return (
      <div className="mb-4 rounded-xl border border-zinc-200 bg-white p-3.5">
        <p className="mb-2 text-xs font-medium text-zinc-600">Member</p>
        <div className="flex items-center justify-between rounded-lg bg-brand-50 px-3 py-2">
          <div>
            <p className="text-sm font-semibold text-brand-700">{member.name}</p>
            <p className="text-[11px] text-brand-600">
              {member.memberCode} · berlaku s/d{" "}
              {new Date(member.validUntil).toLocaleDateString("id-ID")}
            </p>
          </div>
          <button
            onClick={onRelease}
            className="text-xs font-medium text-brand-700 hover:underline"
          >
            Lepas
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-4 rounded-xl border border-zinc-200 bg-white p-3.5">
      <p className="mb-2 text-xs font-medium text-zinc-600">Member (opsional)</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleLookup();
        }}
        className="flex gap-2"
      >
        <input
          ref={codeInputRef}
          type="text"
          value={memberCode}
          onChange={(e) => setMemberCode(e.target.value)}
          placeholder="Scan / ketik kode member"
          className="flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
        <button
          type="submit"
          disabled={memberBusy}
          className="rounded-lg bg-zinc-900 px-4 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
        >
          {memberBusy ? "Mencari…" : "Cari"}
        </button>
      </form>
      {memberError && <p className="mt-1.5 text-xs text-red-600">{memberError}</p>}

      <div className="mt-2 flex gap-3">
        <button
          onClick={() => setListOpen((v) => !v)}
          className="text-xs font-medium text-zinc-500 hover:text-brand-700"
        >
          📋 Daftar Member
        </button>
        <button
          onClick={() => setAddOpen((v) => !v)}
          className="text-xs font-medium text-zinc-500 hover:text-brand-700"
        >
          + Member Baru
        </button>
      </div>

      {listOpen && (
        <div className="mt-2 rounded-lg border border-zinc-200 bg-zinc-50 p-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama / kode / telepon…"
            className="w-full rounded-lg border border-zinc-200 px-2 py-1.5 text-xs focus:border-brand-600 focus:outline-none"
          />
          <div className="mt-1.5 max-h-40 overflow-y-auto">
            {filteredMembers.length === 0 ? (
              <p className="px-2 py-1.5 text-xs text-zinc-400">Tidak ditemukan.</p>
            ) : (
              filteredMembers.map((m) => {
                const today = new Date().toISOString().slice(0, 10);
                const active = m.validUntil >= today;
                return (
                  <button
                    key={m.id}
                    onClick={() => {
                      onSelect({
                        id: m.id,
                        name: m.name,
                        memberCode: m.memberCode,
                        validUntil: m.validUntil,
                      });
                      setListOpen(false);
                      setSearch("");
                    }}
                    disabled={!active}
                    className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs text-zinc-700 hover:bg-white disabled:opacity-40"
                  >
                    <span>
                      {m.name} <span className="text-zinc-400">· {m.memberCode}</span>
                    </span>
                    {!active && <span className="text-red-500">Kadaluarsa</span>}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      {addOpen && (
        <div className="mt-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
          <AddMemberForm action={handleAddMember} />
        </div>
      )}
    </div>
  );
}
