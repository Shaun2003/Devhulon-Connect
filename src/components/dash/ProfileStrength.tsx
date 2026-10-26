"use client";
import Link from "next/link";
import { profileStrength, type StrengthInput } from "@/lib/profile-strength";
import { KIcon } from "@/lib/icons";

/**
 * "Your profile is 78% complete" — progress bar plus the single next best
 * action (spec §11). Missing actions route the seller to the exact place that
 * fixes them: the dashboard tab for portfolio/areas, the edit form for the rest.
 */
export default function ProfileStrength({
  input,
  onTab,
}: {
  input: StrengthInput;
  onTab?: (tab: "listings" | "leads" | "quotes" | "my posts" | "portfolio" | "areas" | "plan") => void;
}) {
  const { percent, checks, nextAction } = profileStrength(input);
  const open = percent < 100;

  return (
    <section className="hippo-card p-5" aria-label="Profile strength">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-black text-[#10243e]">Your profile is {percent}% complete</h2>
        {percent >= 100 ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-black bg-[#e8f6d8] text-[#3c6b1d] rounded-full px-2 py-0.5">
            <KIcon name="badgeCheck" size={12} /> Looking sharp
          </span>
        ) : (
          <span className="text-[10px] font-black bg-[#fff4d6] text-[#a36508] rounded-full px-2 py-0.5">
            {checks.filter((c) => !c.done).length} to go
          </span>
        )}
      </div>

      <div className="mt-2 h-2.5 rounded-full bg-[#f2f6fa] overflow-hidden" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label="Profile completion">
        <div className="h-full rounded-full bg-[#7ac142] transition-all" style={{ width: `${percent}%` }} />
      </div>

      {open && nextAction && (
        <p className="text-sm text-[#1d3a5f]/80 mt-3">
          Next best step: <b className="text-[#10243e]">{nextAction.label}</b>
          {nextAction.hint ? ` — ${nextAction.hint}` : ""}{" "}
          {nextAction.action.kind === "tab" && onTab ? (
            <button onClick={() => onTab(nextAction.action.target as never)} className="font-bold text-[#558c2b] hover:underline">
              {nextAction.action.label} →
            </button>
          ) : (
            <Link href={nextAction.action.target} className="font-bold text-[#558c2b] hover:underline">
              {nextAction.action.label} →
            </Link>
          )}
        </p>
      )}

      <ul className="mt-3 grid sm:grid-cols-2 gap-1.5">
        {checks.map((c) => (
          <li key={c.key} className="flex items-center gap-2 text-sm">
            <KIcon name={c.done ? "badgeCheck" : "circleDot"} size={14} className={c.done ? "text-[#558c2b]" : "text-[#d6e1ec]"} />
            <span className={c.done ? "text-[#1d3a5f]/50 line-through" : "text-[#10243e] font-bold"}>{c.label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
