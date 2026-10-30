/**
 * Dispute resolution & complaints — a plain-language PROCESS, not boilerplate.
 *
 * WHY A DEDICATED PAGE: every other legal document says what the rules ARE. This
 * one says what happens when a rule is broken. A marketplace connecting strangers,
 * where money moves between a buyer and a seller entirely outside our control, is
 * exactly where people need to know who to contact, in what order, and how long we
 * take to answer.
 *
 * Written with real timescales on purpose. A complaints page that says "contact us"
 * without saying what happens next is a worse signal than not having one at all,
 * because it invites the complaint you then fail to handle.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { DocBody } from "@/components/legal";
import { PageHero } from "@/components/ui";
import { CONTACT_EMAIL, CONTACT_PHONE_DISPLAY, CONTACT_PHONE_TEL, CONTACT_HOURS, SITE_NAME, SITE_SHORT } from "@/lib/site";

export const metadata: Metadata = {
  title: "Complaints & Disputes",
  description: `How to raise a complaint or dispute with ${SITE_SHORT}, what we do about it, and how long it takes.`,
  alternates: { canonical: "/complaints" },
  openGraph: {
    title: `${SITE_SHORT} complaints & disputes`,
    description: "Raise a complaint or dispute, and how we handle it.",
    url: "/complaints",
  },
};

const UPDATED = "23 October 2026";

export default function ComplaintsPage() {
  return (
    <div className="min-h-screen">
      <PageHero
        kicker="Legal"
        title="Complaints & Disputes"
        sub={`If something has gone wrong — a business that never arrived, a quote you dispute, or something on the site you believe is untrue — here is exactly what to do and what happens next.`}
        crumbs={[{ label: "Home", href: "/" }, { label: "Complaints & Disputes" }]}
      >
        <p className="text-xs text-white/60">Last updated: {UPDATED}</p>
      </PageHero>

      <main className="mx-auto max-w-6xl px-4 py-10">
      <DocBody>
        <h2>1. First, tell the business directly</h2>
        <p>
          Most disputes are between a buyer and a business, not with us. If a contractor
          did poor work, overcharged, or failed to show up, the business is the party who
          can put it right — and you have their contact details from your quote request.
          Keep a record: the quote reference, messages, photographs, dates.
        </p>

        <h2>2. If that does not work, complain to us</h2>
        <p>
          Email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
          {CONTACT_PHONE_DISPLAY && CONTACT_PHONE_TEL
            ? <> or call <a href={`tel:${CONTACT_PHONE_TEL}`}>{CONTACT_PHONE_DISPLAY}</a> ({CONTACT_HOURS})</>
            : null}.
          Include the quote reference, the business name, and what you would like to happen.
        </p>

        <h2>3. What we will do</h2>
        <ul>
          <li><b>Acknowledgement within 2 business days.</b> You get a reference number and a named contact.</li>
          <li><b>Assessment within 10 business days</b> once we have everything — we review the listing, quote, messages and any booking record.</li>
          <li><b>A written outcome</b> explaining what we found and what action we are taking.</li>
        </ul>

        <h2>4. What we can and cannot do</h2>
        <p>
          <b>We can</b> correct or take down a listing that is false, misleading or
          unreachable; remove reviews we have reasonable grounds to believe are fake or
          abusive; suspend a business that breaches the{" "}
          <Link href="/acceptable-use">Acceptable Use Policy</Link>; and refund <b>our own</b>{" "}
          subscription fees where we failed to provide the service you paid for.
        </p>
        <p>
          <b>We cannot</b> act as a contract between you and the business, order work you
          agreed to, or refund money a business owes you. We introduce the parties — the
          contract for the work is between you and the business, and we are not a supplier
          of the work itself.
        </p>

        <h2>5. Disputes between businesses</h2>
        <p>
          Sellers can dispute another seller&apos;s listing (claiming a name, photos or a
          trading history), reviewed on the same timescales. Note that <b>claiming a
          listing does not verify it</b> — ownership and verification are separate
          decisions, and a verified badge records who checked it and when.
        </p>

        <h2>6. Disputes about this platform</h2>
        <p>
          If you disagree with how we handled your complaint, reply to the same reference
          and ask for a review by a senior member of the team. We respond within a further
          10 business days.
        </p>

        <h2>7. External bodies</h2>
        <p>We prefer to resolve things with you directly first. If we cannot, you may also approach:</p>
        <ul>
          <li><b>National Consumer Commission</b>:{" "}
            <a href="https://www.thencc.gov.za" target="_blank" rel="noreferrer">thencc.gov.za</a>
          </li>
          <li><b>Information Regulator</b> (POPIA):{" "}
            <a href="https://inforegulator.org.za" target="_blank" rel="noreferrer">inforegulator.org.za</a>
          </li>
          <li><b>Consumer Goods and Services Ombud</b>:{" "}
            <a href="https://www.cgso.org.za" target="_blank" rel="noreferrer">cgso.org.za</a>
          </li>
        </ul>

        <h2>8. Your information</h2>
        <p>
          Complaints are handled under our <Link href="/privacy-policy">Privacy Policy</Link>.
          You can ask us to access or erase the personal information you gave us in a
          complaint, using the erasure option in your dashboard.
        </p>

        <h2>9. Serious conduct</h2>
        <p>
          We report serious abuse — fraud, extortion, or anything unlawful — to the
          relevant authorities. If a listing or message looks like a scam in progress,
          contact us <b>immediately</b> and, where money is at risk, your bank first.
        </p>

        <h2>10. Contact</h2>
        <p>
          {SITE_NAME} · <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
          {CONTACT_PHONE_DISPLAY && CONTACT_PHONE_TEL
            ? <> · <a href={`tel:${CONTACT_PHONE_TEL}`}>{CONTACT_PHONE_DISPLAY}</a> · {CONTACT_HOURS}</>
            : null}
        </p>
      </DocBody>
      </main>
    </div>
  );
}