"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { auth } from "@/lib/firebase";
import { KIcon } from "@/lib/icons";

type Member = {
  id: string;
  ownerUid: string;
  memberUid: string;
  email?: string;
  name?: string;
  ownerName?: string;
  role?: string;
  status?: string;
};
type TeamResponse = { ok?: boolean; error?: string; canManage?: boolean; limit?: number | null; members?: Member[]; memberOf?: Member[] };

export default function TeamManagement() {
  const [team, setTeam] = useState<TeamResponse | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"manager" | "editor">("editor");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadTeam = useCallback(async () => {
    const token = await auth?.currentUser?.getIdToken();
    if (!token) throw new Error("Sign in to manage your team.");
    const response = await fetch("/api/team", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    const result = (await response.json().catch(() => ({}))) as TeamResponse;
    if (!response.ok || result.ok !== true) throw new Error(result.error ?? "Could not load team members.");
    return result;
  }, []);

  useEffect(() => {
    let active = true;
    void loadTeam()
      .then((result) => { if (active) setTeam(result); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Could not load team members."); });
    return () => { active = false; };
  }, [loadTeam]);

  async function invite(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError(null); setMessage(null);
    try {
      const token = await auth?.currentUser?.getIdToken();
      if (!token) throw new Error("Sign in to manage your team.");
      const response = await fetch("/api/team", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      });
      const result = (await response.json().catch(() => ({}))) as TeamResponse;
      if (!response.ok || result.ok !== true) throw new Error(result.error ?? "Could not send team invitation.");
      setEmail("");
      setMessage("Invitation sent. The seller must accept before they can access your shared listings.");
      setTeam(await loadTeam());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not send team invitation.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(ownerUid: string, memberUid: string) {
    setBusy(true); setError(null); setMessage(null);
    try {
      const token = await auth?.currentUser?.getIdToken();
      if (!token) throw new Error("Sign in to manage your team.");
      const response = await fetch("/api/team", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ownerUid, memberUid }),
      });
      const result = (await response.json().catch(() => ({}))) as TeamResponse;
      if (!response.ok || result.ok !== true) throw new Error(result.error ?? "Could not remove team member.");
      setMessage("Team membership removed.");
      setTeam(await loadTeam());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not remove team member.");
    } finally {
      setBusy(false);
    }
  }

  async function respond(ownerUid: string, memberUid: string, decision: "accept" | "decline") {
    setBusy(true); setError(null); setMessage(null);
    try {
      const token = await auth?.currentUser?.getIdToken();
      if (!token) throw new Error("Sign in to respond to a team invitation.");
      const response = await fetch("/api/team", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ownerUid, memberUid, decision }),
      });
      const result = (await response.json().catch(() => ({}))) as TeamResponse;
      if (!response.ok || result.ok !== true) throw new Error(result.error ?? "Could not respond to invitation.");
      setMessage(decision === "accept" ? "Team invitation accepted. Shared listing access is now active." : "Team invitation declined.");
      setTeam(await loadTeam());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not respond to invitation.");
    } finally {
      setBusy(false);
    }
  }

  if (!team && !error) return <p className="text-sm text-[#1d3a5f]/60">Loading team…</p>;

  const incomingInvitations = (team?.memberOf ?? []).filter((member) => member.status === "pending");
  const activeMemberships = (team?.memberOf ?? []).filter((member) => (member.status ?? "active") === "active");

  if (!team?.canManage) {
    return (
      <section className="min-w-0 space-y-5">
        <div className="flex flex-wrap items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#e8f6d8] text-[#558c2b]">
            <KIcon name="profile" size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-black text-[#10243e]">Your team</h2>
              <span className="rounded-full bg-[#fff4d6] px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-[#805c0a]">
                Premium plan
              </span>
            </div>
            <p className="mt-1 text-sm leading-6 text-[#1d3a5f]/70">
              Manage shared listing access and respond to team invitations.
            </p>
          </div>
        </div>
        <div className="rounded-2xl border border-[#dcebcf] bg-[#f3f9ec] p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-[#558c2b] shadow-sm">
              <KIcon name="shieldCheck" size={17} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-extrabold text-[#27461a]">Team access is a Premium feature</p>
              <p className="mt-1 text-sm leading-6 text-[#35522a]/80">
                Invited sellers can manage shared listings after they accept. Billing, leads and buyer contacts stay private to the account owner.
              </p>
              <Link href="/pricing" className="mt-3 inline-flex min-h-10 items-center rounded-xl bg-[#558c2b] px-4 py-2 text-sm font-extrabold text-white transition hover:bg-[#3f6f1d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#10243e] focus-visible:ring-offset-2">
                Explore plans
              </Link>
            </div>
          </div>
        </div>
        {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        {message && <p role="status" className="rounded-xl bg-green-50 p-3 text-sm text-green-800">{message}</p>}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-black text-[#10243e]">Invitations for you</h3>
            <span className="rounded-full bg-[#f2f6fa] px-2.5 py-1 text-xs font-bold text-[#1d3a5f]/65">{incomingInvitations.length} pending</span>
          </div>
          {incomingInvitations.map((invitation) => (
            <div key={invitation.id} className="rounded-2xl border border-[#e7eef5] bg-white p-4 shadow-[0_5px_18px_-16px_rgba(11,30,51,0.55)]">
              <div className="flex flex-wrap items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#f2f6fa] text-[#558c2b]">
                  <KIcon name="profile" size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-extrabold text-[#10243e]">{invitation.ownerName || "A DevhulonConnect seller"}</p>
                  <p className="mt-1 text-xs leading-5 text-[#1d3a5f]/65">
                    Invited you as a {invitation.role === "manager" ? "Manager" : "Editor"} · Shared listing access starts after you accept.
                  </p>
                </div>
                <span className="rounded-full bg-[#fff4d6] px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-[#805c0a]">Pending</span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2 border-t border-[#eef2f6] pt-3">
                <button type="button" disabled={busy} onClick={() => void respond(invitation.ownerUid, invitation.memberUid, "accept")} className="btn-hippo min-h-10 flex-1 text-sm disabled:opacity-50">
                  Accept invitation
                </button>
                <button type="button" disabled={busy} onClick={() => void respond(invitation.ownerUid, invitation.memberUid, "decline")} className="min-h-10 rounded-xl border border-[#d6e1ec] px-4 py-2 text-sm font-bold text-[#1d3a5f] transition hover:bg-[#f2f6fa] disabled:opacity-50">
                  Decline
                </button>
              </div>
            </div>
          ))}
          {incomingInvitations.length === 0 && (
            <p className="rounded-2xl border border-dashed border-[#d6e1ec] bg-[#f8fafc] px-4 py-5 text-sm text-[#1d3a5f]/60">
              No pending invitations. New team requests will appear here.
            </p>
          )}
        </div>
        {activeMemberships.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-black text-[#10243e]">Shared listing access</h3>
            {activeMemberships.map((member) => (
              <div key={member.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-[#e7eef5] bg-white p-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#e8f6d8] text-[#558c2b]">
                  <KIcon name="layers" size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-extrabold text-[#10243e]">{member.ownerName || "A DevhulonConnect seller"}</p>
                  <p className="mt-1 text-xs text-[#1d3a5f]/60">Shared listing access · {member.role === "manager" ? "Manager" : "Editor"}</p>
                </div>
                <button type="button" disabled={busy} onClick={() => void remove(member.ownerUid, member.memberUid)} className="min-h-10 rounded-xl border border-[#f0d9d9] px-3 py-2 text-xs font-bold text-red-700 transition hover:bg-red-50 disabled:opacity-50">Leave team</button>
              </div>
            ))}
          </div>
        )}
      </section>
    );
  }

  const ownerRoster = team.members ?? [];
  const activeMembers = ownerRoster.filter((member) => (member.status ?? "active") === "active");
  const pendingMembers = ownerRoster.filter((member) => member.status === "pending");

  return (
    <section className="min-w-0 space-y-5">
      <div className="flex flex-wrap items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#e8f6d8] text-[#558c2b]">
          <KIcon name="profile" size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-black text-[#10243e]">Your team</h2>
            <span className="rounded-full bg-[#e8f6d8] px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-[#3c6b1d]">Premium plan</span>
          </div>
          <p className="mt-1 text-sm leading-6 text-[#1d3a5f]/70">Invite verified sellers to help manage your business listings. Billing, leads, buyer contacts and credits remain private to you.</p>
        </div>
      </div>
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {message && <p role="status" className="rounded-xl bg-green-50 p-3 text-sm text-green-800">{message}</p>}
      {incomingInvitations.length > 0 && (
        <div className="space-y-3 rounded-2xl border border-[#e7eef5] bg-[#f8fafc] p-4">
          <h3 className="text-sm font-black text-[#10243e]">Invitations for you</h3>
          {incomingInvitations.map((invitation) => (
            <div key={invitation.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-[#e7eef5] bg-white p-3">
              <span className="min-w-0 flex-1 text-sm text-[#10243e]">
                <b>{invitation.ownerName || invitation.ownerUid}</b> invited you as a {invitation.role === "manager" ? "Manager" : "Editor"}.
              </span>
              <button type="button" disabled={busy} onClick={() => void respond(invitation.ownerUid, invitation.memberUid, "accept")} className="btn-hippo text-xs disabled:opacity-50">Accept</button>
              <button type="button" disabled={busy} onClick={() => void respond(invitation.ownerUid, invitation.memberUid, "decline")} className="rounded-xl border border-[#d6e1ec] px-3 py-2 text-xs font-bold text-[#1d3a5f] disabled:opacity-50">Decline</button>
            </div>
          ))}
        </div>
      )}
      {activeMemberships.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-black text-[#10243e]">Shared listing access</h3>
          {activeMemberships.map((member) => (
            <div key={member.id} className="flex items-center gap-3 rounded-xl bg-[#f8fafc] p-3">
              <span className="min-w-0 flex-1 text-sm font-bold text-[#10243e]">Access from {member.ownerName || member.ownerUid}</span>
              <button type="button" disabled={busy} onClick={() => void remove(member.ownerUid, member.memberUid)} className="text-xs font-bold text-red-700 disabled:opacity-50">Leave team</button>
            </div>
          ))}
        </div>
      )}
      <form onSubmit={invite} className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,auto)_auto]">
        <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required maxLength={254} placeholder="Seller account email" className="min-w-0 w-full rounded-xl border-2 border-[#e7eef5] px-3 py-2 text-sm" />
        <select value={role} onChange={(event) => setRole(event.target.value as "manager" | "editor")} className="min-w-0 w-full rounded-xl border-2 border-[#e7eef5] px-3 py-2 text-sm" aria-label="Team role">
          <option value="editor">Editor — listing details</option>
          <option value="manager">Manager — all listing fields</option>
        </select>
        <button type="submit" disabled={busy} className="btn-hippo min-h-11 w-full text-sm disabled:opacity-50 sm:w-auto">{busy ? "Sending…" : "Send invitation"}</button>
      </form>
      <div className="grid min-w-0 gap-1 rounded-xl bg-[#f2f6fa] px-3 py-2.5 sm:grid-cols-2 sm:items-center sm:justify-between sm:gap-2">
        <p className="min-w-0 break-words text-xs font-semibold text-[#1d3a5f]/70">{activeMembers.length} active · {pendingMembers.length} pending</p>
        <p className="min-w-0 break-words text-xs font-bold text-[#1d3a5f]/55 sm:text-right">{team.limit === null ? "Unlimited seats" : `${activeMembers.length + pendingMembers.length} / ${team.limit ?? 0} seats used`}</p>
      </div>
      <div className="space-y-3">
        {activeMembers.map((member) => (
          <div key={member.id} className="grid min-w-0 grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2 rounded-2xl border border-[#e7eef5] bg-white p-4 sm:flex sm:items-center sm:gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#e8f6d8] text-[#558c2b]">
              <KIcon name="profile" size={18} />
            </span>
            <span className="min-w-0 break-words text-sm font-extrabold text-[#10243e] sm:w-auto sm:flex-1">{member.name || member.email || "Team member"}</span>
            <span className="col-start-2 row-start-2 flex min-w-0 flex-wrap items-center gap-2 sm:contents">
              <span className="max-w-full break-words rounded-full bg-[#e8f6d8] px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-[#3c6b1d]">{member.role === "manager" ? "Manager" : "Editor"} · Active</span>
              <button type="button" disabled={busy} onClick={() => void remove(member.ownerUid, member.memberUid)} className="min-h-10 rounded-xl border border-[#f0d9d9] px-3 py-2 text-xs font-bold text-red-700 transition hover:bg-red-50 disabled:opacity-50">Remove</button>
            </span>
          </div>
        ))}
        {pendingMembers.map((member) => (
          <div key={member.id} className="grid min-w-0 grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2 rounded-2xl border border-dashed border-[#d6e1ec] bg-[#f8fafc] p-4 sm:flex sm:items-center sm:gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-[#1d3a5f]/60 ring-1 ring-[#e7eef5]">
              <KIcon name="profile" size={18} />
            </span>
            <span className="min-w-0 break-words text-sm font-extrabold text-[#10243e] sm:w-auto sm:flex-1">{member.name || member.email || "Invited seller"}</span>
            <span className="col-start-2 row-start-2 flex min-w-0 flex-wrap items-center gap-2 sm:contents">
              <span className="max-w-full break-words rounded-full bg-[#fff4d6] px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-[#805c0a]">{member.role === "manager" ? "Manager" : "Editor"} · Pending</span>
              <button type="button" disabled={busy} onClick={() => void remove(member.ownerUid, member.memberUid)} className="min-h-10 rounded-xl border border-[#d6e1ec] px-3 py-2 text-xs font-bold text-[#1d3a5f] transition hover:bg-white disabled:opacity-50">Cancel request</button>
            </span>
          </div>
        ))}
        {ownerRoster.length === 0 && <p className="rounded-2xl border border-dashed border-[#d6e1ec] bg-[#f8fafc] px-4 py-5 text-sm text-[#1d3a5f]/60">No team members or pending requests yet. Send an invitation to get started.</p>}
      </div>
    </section>
  );
}
