"use client";

import { useCallback, useEffect, useState } from "react";
import { auth } from "@/lib/firebase";

type Ticket = {
  id: string;
  ownerUid?: string;
  email?: string | null;
  subject?: string;
  message?: string;
  plan?: string;
  priority?: boolean;
  status?: string;
  createdAt?: string;
};

export default function SupportQueue() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = await auth?.currentUser?.getIdToken();
    if (!token) throw new Error("Sign in as an admin.");
    const response = await fetch("/api/admin/support", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    const result = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string; tickets?: Ticket[] };
    if (!response.ok || result.ok !== true) throw new Error(result.error ?? "Could not load support requests.");
    return result.tickets ?? [];
  }, []);

  useEffect(() => {
    let alive = true;
    void load()
      .then((result) => { if (alive) setTickets(result); })
      .catch((cause) => { if (alive) setError(cause instanceof Error ? cause.message : "Could not load support requests."); });
    return () => { alive = false; };
  }, [load]);

  async function updateStatus(ticket: Ticket, status: "open" | "in_progress" | "resolved") {
    setBusy(ticket.id); setError(null);
    try {
      const token = await auth?.currentUser?.getIdToken();
      if (!token) throw new Error("Sign in as an admin.");
      const response = await fetch("/api/admin/support", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ id: ticket.id, status }),
      });
      const result = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!response.ok || result.ok !== true) throw new Error(result.error ?? "Could not update request.");
      setTickets((current) => current.map((item) => item.id === ticket.id ? { ...item, status } : item));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update request.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-y-3">
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {tickets.map((ticket) => (
        <article key={ticket.id} className="rounded-2xl border border-[#e7eef5] p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-black text-[#10243e]">{ticket.subject}</h3>
            {ticket.priority && <span className="rounded-full bg-[#fff4d6] px-2 py-1 text-[10px] font-black uppercase text-[#a36508]">Business priority</span>}
            <span className="ml-auto text-xs text-[#1d3a5f]/60">{ticket.status} · {ticket.plan}</span>
          </div>
          <p className="mt-2 whitespace-pre-wrap text-sm text-[#1d3a5f]/80">{ticket.message}</p>
          <p className="mt-2 text-xs text-[#1d3a5f]/55">{ticket.email || ticket.ownerUid} · {ticket.createdAt}</p>
          <div className="mt-3 flex gap-2">
            {(["open", "in_progress", "resolved"] as const).map((status) => (
              <button key={status} disabled={busy === ticket.id || ticket.status === status} onClick={() => void updateStatus(ticket, status)} className="rounded-full border px-3 py-1 text-xs font-bold disabled:opacity-40">
                {status.replace("_", " ")}
              </button>
            ))}
          </div>
        </article>
      ))}
      {tickets.length === 0 && !error && <p className="text-sm text-[#1d3a5f]/60">No support requests are waiting.</p>}
    </section>
  );
}
