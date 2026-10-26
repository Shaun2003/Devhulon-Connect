"use client";
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { decideQuote } from "@/lib/repo";
import { normalizeQuoteStatus, orderForCompare, priceSpread, QUOTE_STATUS_LABEL, QUOTE_STATUS_TONE, type Quote } from "@/lib/quotes";
import { formatZAR } from "@/lib/plans";
import { KIcon } from "@/lib/icons";
import { SITE_SHORT } from "@/lib/site";

type Row = Record<string, unknown>;

/** Map a `quotes/{id}` row into the typed shape. */
function asQuote(row: Row): Quote {
  const list = (v: unknown) => (Array.isArray(v) ? (v as unknown[]).map(String) : []);
  return {
    id: String(row.id ?? ""),
    leadId: String(row.leadId ?? ""),
    requestId: row.requestId ? String(row.requestId) : undefined,
    buyerUid: String(row.buyerUid ?? ""),
    sellerUid: String(row.sellerUid ?? ""),
    businessId: row.businessId ? String(row.businessId) : null,
    price: Number(row.price ?? 0),
    vatIncluded: row.vatIncluded === true,
    duration: String(row.duration ?? ""),
    availability: String(row.availability ?? ""),
    message: String(row.message ?? ""),
    inclusions: list(row.inclusions),
    exclusions: list(row.exclusions),
    warranty: String(row.warranty ?? ""),
    attachments: list(row.attachments),
    status: normalizeQuoteStatus(row.status),
  };
}

function Criterion({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-2 text-sm">
      <span className="w-28 shrink-0 text-[#1d3a5f]/60 text-xs font-bold uppercase tracking-wide pt-0.5">{label}</span>
      <span className="min-w-0 text-[#10243e]">{children}</span>
    </div>
  );
}

/**
 * Side-by-side quote comparison (§17).
 *
 * KASI never declares a winner: every reply is laid out on the same criteria and
 * the buyer decides. Accepting marks the request won; declining one quote leaves
 * the other quotes on that request untouched.
 */
export default function QuoteComparison({
  lead,
  requestId,
  quotes,
  sellers,
  onDecided,
}: {
  lead: Row | null;
  /**
   * The PARENT request id. Quotes are matched on this (not on `lead.id`), because
   * a broadcast gives each seller its OWN lead copy — matching on the lead id would
   * only ever surface one seller's offer, which is not a comparison.
   */
  requestId?: string;
  quotes: Row[];
  sellers: Row[];
  onDecided?: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Older quotes predate `requestId`, so fall back to the lead id.
  const parentId = String(requestId ?? lead?.id ?? "");
  const mine = quotes
    .map(asQuote)
    .filter((q) => (parentId ? (String((q as Quote & { requestId?: string }).requestId ?? "") || q.leadId) === parentId : true));
  const ordered = orderForCompare(mine);
  const spread = priceSpread(ordered);
  const won = ordered.find((q) => q.status === "accepted");
  // Once someone has won, no other quote on this request can be accepted.
  const settled = Boolean(won) || String(lead?.status ?? "") === "won";

  async function decide(q: Quote, decision: "accepted" | "declined") {
    const extra =
      decision === "accepted"
        ? " This closes the request — the other businesses are stood down and told it went elsewhere."
        : " Other quotes on this request stay open.";
    if (!confirm((decision === "accepted" ? "Accept this quote?" : "Decline this quote?") + extra)) return;
    setBusy(q.id + decision);
    setError(null);
    try {
      await decideQuote(q.id, decision);
      onDecided?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save your decision.");
    } finally {
      setBusy(null);
    }
  }

  const sellerFor = (q: Quote) => sellers.find((s) => String(s.ownerUid ?? "") === q.sellerUid);

  if (ordered.length === 0) {
    return (
      <div className="hippo-card p-6 text-center">
        <span className="icon-3d icon-3d-sm mx-auto" aria-hidden="true"><KIcon name="clock" size={24} /></span>
        <h2 className="text-lg font-black text-[#10243e] mt-3">No quotes on this request yet</h2>
        <p className="text-sm text-[#1d3a5f]/70 mt-1 max-w-md mx-auto">
          Local businesses see your request in their lead inbox. When one accepts and sends a price it
          lands here for side-by-side comparison — you&apos;ll get a notification too.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="hippo-card p-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="text-sm font-extrabold text-[#10243e]">
          {ordered.length} {ordered.length === 1 ? "quote" : "quotes"} to compare
        </p>
        {spread && (
          <p className="text-sm text-[#1d3a5f]/70">
            Prices from <b className="text-[#10243e]">{formatZAR(spread.low)}</b> to{" "}
            <b className="text-[#10243e]">{formatZAR(spread.high)}</b>
          </p>
        )}
        {won && (
          <span className={`text-xs font-black rounded-full px-2.5 py-1 ${QUOTE_STATUS_TONE.accepted}`}>
            Accepted: {formatZAR(won.price)}
          </span>
        )}
        <p className="text-xs text-[#1d3a5f]/60 basis-full">
          Sorted cheapest first for readability. {SITE_SHORT} doesn&apos;t rank or recommend a winner — check
          warranty, availability and reviews before you decide.
        </p>
      </div>

      {error && <p className="text-sm font-bold text-red-700 bg-red-50 rounded-2xl px-4 py-3">{error}</p>}

      {settled && (
        <p className="text-sm font-bold text-[#3c6b1d] bg-[#e8f6d8] rounded-2xl px-4 py-3">
          This request is closed — you accepted {won ? formatZAR(won.price) : "a quote"}. Every other business
          was stood down and told the job went elsewhere, so nobody will chase you about it again.
        </p>
      )}

      <div className="overflow-x-auto -mx-4 px-4">
        <div
          className="grid gap-3 min-w-[60rem]"
          style={{ gridTemplateColumns: `repeat(${ordered.length}, minmax(17rem, 1fr))` }}
        >
          {ordered.map((q) => {
            const seller = sellerFor(q);
            // A settled request has a winner, so no other quote on it is actionable
            // — the server would reject it anyway, but the UI should not offer it.
            const live = q.status === "sent" && !settled;
            return (
              <article
                key={q.id}
                className={`hippo-card p-4 flex flex-col gap-3 ${q.status === "accepted" ? "border-2 !border-[#7ac142]" : ""}`}
              >
                <header className="flex items-start gap-2">
                  <p className="text-2xl font-black text-[#10243e] leading-none">
                    {formatZAR(q.price)}
                    <span className="block text-[11px] font-bold text-[#1d3a5f]/60 mt-1">
                      {q.vatIncluded ? "incl. VAT" : "excl. VAT"}
                    </span>
                  </p>
                  <span className={`ml-auto text-[10px] font-black rounded-full px-2 py-0.5 ${QUOTE_STATUS_TONE[q.status]}`}>
                    {QUOTE_STATUS_LABEL[q.status]}
                  </span>
                </header>

                <Criterion label="Business">
                  <b>{String(seller?.name ?? "Local business")}</b>
                  {seller?.verified === true && (
                    <span className="ml-1.5 inline-flex items-center gap-1 text-[10px] font-black text-[#3c6b1d] bg-[#e8f6d8] rounded-full px-2 py-0.5">
                      <KIcon name="badgeCheck" size={11} /> Verified
                    </span>
                  )}
                </Criterion>
                <Criterion label="Rating">
                  {seller
                    ? Number(seller.reviewCount ?? 0) > 0 && Number(seller.rating ?? 0) > 0
                      ? `${Number(seller.rating).toFixed(1)} <KIcon name="star" size={14} className="inline shrink-0" /> · ${Number(seller.reviewCount)} reviews`
                      : "New listing"
                    : "New listing"}
                </Criterion>
                <Criterion label="Availability">{q.availability || "Ask the business"}</Criterion>
                <Criterion label="Duration">{q.duration}</Criterion>
                <Criterion label="Warranty">{q.warranty || "Not stated"}</Criterion>
                <Criterion label="Included">
                  {q.inclusions.length > 0 ? (
                    <ul className="list-disc pl-4 space-y-0.5">{q.inclusions.map((i) => <li key={i}>{i}</li>)}</ul>
                  ) : ("Not listed")}
                </Criterion>
                <Criterion label="Not included">
                  {q.exclusions.length > 0 ? (
                    <ul className="list-disc pl-4 space-y-0.5">{q.exclusions.map((i) => <li key={i}>{i}</li>)}</ul>
                  ) : ("Nothing excluded")}
                </Criterion>
                <Criterion label="Message">{q.message}</Criterion>
                {q.attachments.length > 0 && (
                  <Criterion label="Attachments">
                    {q.attachments.map((a) => (
                      <a key={a} href={a} target="_blank" rel="noopener noreferrer" className="block text-[#558c2b] font-bold hover:underline truncate">
                        {a}
                      </a>
                    ))}
                  </Criterion>
                )}

                <div className="mt-auto space-y-2 pt-2 border-t border-[#e7eef5]">
                  <div className="flex flex-wrap gap-2">
                    {q.businessId && (
                      <Link
                        href={`/business/${q.businessId}`}
                        className="text-xs font-extrabold text-[#10243e] border-2 border-[#10243e] rounded-full px-3 py-1.5 hover:bg-[#10243e] hover:text-white transition"
                      >
                        View profile
                      </Link>
                    )}
                    <Link
                      href={`/messages?to=${q.sellerUid}${q.businessId ? `&business=${q.businessId}` : ""}`}
                      className="text-xs font-extrabold text-[#558c2b] border-2 border-[#558c2b] rounded-full px-3 py-1.5 hover:bg-[#558c2b] hover:text-white transition"
                    >
                      Message
                    </Link>
                  </div>
                  {live && (
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => decide(q, "accepted")}
                        disabled={busy !== null}
                        className="btn-hippo text-xs !py-2 disabled:opacity-60"
                      >
                        {busy === q.id + "accepted" ? "Accepting…" : "Accept this quote"}
                      </button>
                      <button
                        onClick={() => decide(q, "declined")}
                        disabled={busy !== null}
                        className="text-xs font-bold text-red-700 border-2 border-red-200 rounded-full px-3 py-1.5 hover:bg-red-50 disabled:opacity-60"
                      >
                        {busy === q.id + "declined" ? "Declining…" : "Decline"}
                      </button>
                    </div>
                  )}
                  {q.status === "accepted" && (
                    <p className="text-xs font-bold text-[#3c6b1d]">
                      You accepted this quote — message the business to confirm the date.
                    </p>
                  )}
                </div>

              </article>
            );
          })}
        </div>
      </div>

    </div>
  );
}
