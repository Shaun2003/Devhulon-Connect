"use client";

/**
 * Admin console → Plans (§21).
 *
 * Prices, limits and marketing copy live in `subscription_plans`,
 * merged over the built-in defaults in `lib/plans.ts`. That matters for more than
 * display: checkout, entitlement and every feature gate read the SAME merged
 * config on the server, so editing a price here changes what customers are
 * actually charged — not just what the pricing page prints.
 *
 * Plan ids and capability lists are intentionally NOT editable (the API rejects
 * them): `CAP_MIN_PLAN` and `PLAN_RANK` are derived from those once at import and
 * drive all upgrade logic, so reconfiguring them would corrupt it rather than
 * reconfigure pricing.
 */

import { useCallback, useEffect, useState } from "react";
import { auth } from "@/lib/firebase";
import type { PlanConfig, PlanId } from "@/lib/plans";

type Snapshot = {
  id: PlanId;
  effective: PlanConfig;
  defaults: PlanConfig;
  overridden: boolean;
  active: boolean;
};

type LimitKey = "services" | "portfolio" | "leadsPerMonth" | "locations" | "teamMembers";

const LIMIT_FIELDS: { key: LimitKey; label: string; hint: string }[] = [
  { key: "services", label: "Services", hint: "Max published services" },
  { key: "portfolio", label: "Portfolio items", hint: "Max portfolio uploads" },
  { key: "leadsPerMonth", label: "Leads / month", hint: "Matched leads per period" },
  { key: "locations", label: "Locations", hint: "Business locations" },
  { key: "teamMembers", label: "Team members", hint: "Additional seats" },
];

/** Draft is raw form state: everything a text input holds is a string. */
type Draft = {
  name: string;
  blurb: string;
  monthly: string;
  annual: string;
  popular: boolean;
  active: boolean;
  limits: Record<LimitKey, string>;
  features: string;
};

function limitToInput(v: number | null): string {
  return v === null ? "" : String(v);
}

function toDraft(p: PlanConfig, active: boolean): Draft {
  return {
    name: p.name,
    blurb: p.blurb,
    monthly: String(p.monthly),
    annual: String(p.annual),
    popular: p.popular === true,
    active,
    limits: {
      services: limitToInput(p.limits.services),
      portfolio: limitToInput(p.limits.portfolio),
      leadsPerMonth: limitToInput(p.limits.leadsPerMonth),
      locations: limitToInput(p.limits.locations),
      teamMembers: limitToInput(p.limits.teamMembers),
    },
    features: p.features.join("\n"),
  };
}

/** Blank = unlimited (sent as null). Returns undefined only for malformed input. */
function parseLimit(v: string): number | null | undefined {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.floor(n);
}

function parseMoney(v: string): number | undefined {
  const n = Number(v.trim());
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/**
 * Build the override payload. Returns a string when the draft is invalid, so the
 * caller can show one clear message instead of a silent no-op.
 *
 */
function toPayload(id: PlanId, d: Draft): Record<string, unknown> | string {
  const name = d.name.trim();
  if (!name) return "Every plan needs a name.";

  const monthly = parseMoney(d.monthly);
  if (monthly === undefined) return "Monthly price must be a number of 0 or more.";
  const annual = parseMoney(d.annual);
  if (annual === undefined) return "Annual price must be a number of 0 or more.";

  const limits: Record<string, number | null> = {};
  for (const f of LIMIT_FIELDS) {
    const v = parseLimit(d.limits[f.key]);
    if (v === undefined) return `${f.label} must be a whole number, or blank for unlimited.`;
    limits[f.key] = v;
  }

  return {
    planId: id,
    name,
    blurb: d.blurb.trim(),
    monthly,
    annual,
    popular: d.popular,
    active: d.active,
    limits,
    features: d.features
      .split("\n")
      .map((f) => f.trim())
      .filter(Boolean),
  };
}

async function authedFetch(
  path: string,
  init: { method?: string; body?: unknown } = {},
) {
  const user = auth?.currentUser;
  if (!user) throw new Error("Sign in as an admin first.");
  const token = await user.getIdToken();
  if (!token) throw new Error("Sign in as an admin first.");
  const res = await fetch(path, {
    method: init.method || "GET",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    ok: boolean;
    error: string;
    plans: Snapshot[];
  };
  if (!res.ok || json.ok !== true) throw new Error(json.error ?? "Request failed. Please try again.");
  return json;
}

export default function PlansAdmin() {
  const [plans, setPlans] = useState<Snapshot[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const install = useCallback((next: Snapshot[]) => {
    setPlans(next);
    const d: Record<string, Draft> = {};
    for (const p of next) d[p.id] = toDraft(p.effective, p.active);
    setDrafts(d);
  }, []);

  useEffect(() => {
    let alive = true;
    authedFetch("/api/admin/plans")
      .then((json) => {
        if (alive) install(json.plans ?? []);
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : "Could not load plans.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [install]);

  function patch(id: PlanId, next: Partial<Draft>) {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...next } }));
  }

  function patchLimit(id: PlanId, key: LimitKey, value: string) {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], limits: { ...prev[id].limits, [key]: value } } }));
  }

  async function save(s: Snapshot) {
    const payload = toPayload(s.id, drafts[s.id]);
    if (typeof payload === "string") {
      setError(payload);
      setNotice(null);
      return;
    }
    setBusy(s.id);
    setError(null);
    setNotice(null);
    try {
      const json = await authedFetch("/api/admin/plans", { method: "PUT", body: payload });
      install(json.plans ?? []);
      setNotice(`${String(payload.name)} saved — the pricing page and checkout now use these values.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the plan.");
    } finally {
      setBusy(null);
    }
  }

  async function reset(s: Snapshot) {
    if (!confirm(`Reset ${s.effective.name} to the built-in defaults (R${s.defaults.monthly}/mo)`)) return;
    setBusy(s.id);
    setError(null);
    setNotice(null);
    try {
      const json = await authedFetch(`/api/admin/plans?planId=${encodeURIComponent(s.id)}`, { method: "DELETE" });
      install(json.plans ?? []);
      setNotice(`${s.defaults.name} restored to its built-in defaults.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reset the plan.");
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <section className="hippo-card p-5">
        <h2 className="font-black text-[#10243e]">Plans &amp; pricing</h2>
        <p className="text-sm text-[#1d3a5f]/60 mt-3">Loading plans…</p>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <section className="hippo-card p-5">
        <h2 className="font-black text-[#10243e]">Plans &amp; pricing</h2>
        <p className="text-xs text-[#1d3a5f]/60 mt-1">
          These values are read by checkout, entitlement and every feature gate — so changing a price here changes what
          sellers are charged, not just what the pricing page displays. Leave a limit blank for unlimited.
        </p>
        {error && (
          <p role="alert" className="mt-3 rounded-xl border border-[#f5c2c0] bg-[#fde8e8] px-3 py-2 text-sm font-semibold text-[#a3341f]">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="mt-3 rounded-xl border border-[#c9e3ae] bg-[#f0f7ee] px-3 py-2 text-sm font-semibold text-[#3c6b1d]">
            {notice}
          </p>
        )}
      </section>

      {plans.map((s) => {
        const d = drafts[s.id];
        if (!d) return null;
        const dirty = JSON.stringify(d) !== JSON.stringify(toDraft(s.effective, s.active));
        return (
          <section key={s.id} className="hippo-card p-5">
            <header className="flex flex-wrap items-center gap-2">
              <h3 className="font-black text-[#10243e]">{s.effective.name}</h3>
              <span className="text-xs font-mono text-[#1d3a5f]/40">{s.id}</span>
              {s.overridden && (
                <span className="rounded-full bg-[#fff4d6] px-2 py-0.5 text-[11px] font-bold text-[#a36508]">Admin-set</span>
              )}
              {!d.active && (
                <span className="rounded-full bg-[#eef2f6] px-2 py-0.5 text-[11px] font-bold text-[#64748b]">Hidden</span>
              )}
              {dirty && <span className="text-[11px] font-bold text-[#a3341f]">Unsaved changes</span>}
              <span className="ml-auto flex gap-2">
                <button
                  onClick={() => reset(s)}
                  disabled={busy !== null || !s.overridden}
                  className="rounded-lg border text-xs font-bold px-3 py-1.5 disabled:opacity-40"
                >
                  Reset to defaults
                </button>
                <button
                  onClick={() => save(s)}
                  disabled={busy !== null || !dirty}
                  className="rounded-lg bg-[#558c2b] text-white text-xs font-bold px-3 py-1.5 disabled:opacity-40"
                >
                  {busy === s.id ? "Saving…" : "Save"}
                </button>
              </span>
            </header>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Plan name" value={d.name} onChange={(v) => patch(s.id, { name: v })} />
              <Field
                label="Monthly (R)"
                value={d.monthly}
                onChange={(v) => patch(s.id, { monthly: v })}
                hint={`Default R${s.defaults.monthly}`}
              />
              <Field
                label="Annual (R)"
                value={d.annual}
                onChange={(v) => patch(s.id, { annual: v })}
                hint={`Default R${s.defaults.annual}`}
              />
            </div>

            <label className="mt-3 block text-xs font-bold uppercase tracking-wide text-[#1d3a5f]/60">
              Blurb
              <input
                value={d.blurb}
                onChange={(e) => patch(s.id, { blurb: e.target.value })}
                className="mt-1 w-full rounded-xl border border-[#d6e1ec] px-3 py-2 text-sm font-normal normal-case text-[#10243e]"
              />
            </label>

            <p className="mt-4 text-xs font-bold uppercase tracking-wide text-[#1d3a5f]/60">Limits</p>
            <div className="mt-2 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {LIMIT_FIELDS.map((f) => (
                <Field
                  key={f.key}
                  label={f.label}
                  value={d.limits[f.key]}
                  onChange={(v) => patchLimit(s.id, f.key, v)}
                  hint={f.hint}
                />
              ))}
            </div>

            <label className="mt-4 block text-xs font-bold uppercase tracking-wide text-[#1d3a5f]/60">
              Features (one per line)
              <textarea
                value={d.features}
                onChange={(e) => patch(s.id, { features: e.target.value })}
                rows={6}
                className="mt-1 w-full rounded-xl border border-[#d6e1ec] px-3 py-2 text-sm font-normal normal-case text-[#10243e]"
              />
            </label>

            <div className="mt-3 flex flex-wrap gap-4 text-sm text-[#10243e]">
              <label className="flex items-center gap-2 font-semibold">
                <input
                  type="checkbox"
                  checked={d.popular}
                  onChange={(e) => patch(s.id, { popular: e.target.checked })}
                  className="h-4 w-4"
                />
                Mark as “Most popular”
              </label>
              <label className="flex items-center gap-2 font-semibold">
                <input
                  type="checkbox"
                  checked={d.active}
                  onChange={(e) => patch(s.id, { active: e.target.checked })}
                  className="h-4 w-4"
                />
                Visible on the pricing page
              </label>
            </div>

            <p className="mt-3 text-[11px] text-[#1d3a5f]/50">
              Which features each tier unlocks is fixed in code and cannot be changed here; hiding a plan removes it from
              the pricing page without affecting sellers already on it.
            </p>
          </section>
        );
      })}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
}) {
  return (
    <label className="block text-xs font-bold uppercase tracking-wide text-[#1d3a5f]/60">
      {label}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-xl border border-[#d6e1ec] px-3 py-2 text-sm font-normal normal-case text-[#10243e]"
      />
      {hint && <span className="mt-0.5 block text-[11px] font-normal normal-case text-[#1d3a5f]/50">{hint}</span>}
    </label>
  );
}
