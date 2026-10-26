"use client";

import { KIcon } from "@/lib/icons";
import {
  isVerificationCurrent,
  verificationSentence,
  type VerificationRecord,
} from "@/lib/verification";

/**
 * The public verification badge, WITH its provenance.
 *
 * WHY THIS SAYS SOMETHING: a bare "Verified" chip asks a buyer to take the word of
 * the platform on trust. `/about` defines the badge as "we confirmed the business
 * exists and is reachable" — so showing the method and the date lets a buyer judge
 * the claim instead. It also matches the policy the code now actually enforces:
 * verification is a recorded decision with a date, not a permanent boolean.
 *
 * DEGRADES GRACEFULLY: a listing verified before records existed has `verified`
 * true but no record. The badge still renders (the claim stands), just without a
 * date, rather than pretending we have provenance we don't.
 *
 * Deliberately never says "trusted", "guaranteed" or "quality checked" — `/about`
 * is explicit that verification means real and contactable, nothing more.
 */
export default function VerificationBadge({
  verified,
  verification,
  size = "sm",
}: {
  verified: boolean;
  verification?: VerificationRecord | null;
  size?: "sm" | "md";
}) {
  if (!verified) return null;

  const sentence = verification ? verificationSentence(verification) : "";
  const stale = verification ? !isVerificationCurrent(verification) : false;

  const title = sentence
    ? `${sentence}. Verification is not a guarantee of workmanship, qualifications or pricing.`
    : "Confirmed by our team. Verification is not a guarantee of workmanship, qualifications or pricing.";

  return (
    <span
      // The tooltip carries the definition, so the badge cannot be read as a
      // quality guarantee even when it is skimmed without the /about page.
      title={title}
      className={`inline-flex items-center gap-1 font-black rounded-full bg-[#e8f6d8] text-[#3c6b1d] ${
        size === "sm" ? "text-[10px] px-2 py-0.5" : "text-xs px-2.5 py-1"
      }`}
    >
      <KIcon name="badgeCheck" size={size === "sm" ? 11 : 14} className="inline shrink-0" />
      Verified
      {sentence && (
        <span className="font-bold opacity-80">
          · {sentence}
          {stale ? " · due for re-check" : ""}
        </span>
      )}
    </span>
  );
}