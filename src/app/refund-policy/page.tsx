import type { Metadata } from "next";
import Link from "next/link";
import { DocBody } from "@/components/legal";
import { PageHero } from "@/components/ui";
import { CONTACT_EMAIL, SITE_NAME, SITE_SHORT } from "@/lib/site";

export const metadata: Metadata = {
  title: "Refund Policy",
  description:
    `How ${SITE_SHORT} handles refunds and refund-related complaints.`,
  alternates: { canonical: "/refund-policy" },
  openGraph: {
    title: `${SITE_SHORT} refund policy`,
    description: `Refund policy for ${SITE_SHORT} subscriptions and trials.`,
    url: "/refund-policy",
  },
};

const UPDATED = "29 October 2026";

export default function RefundPolicyPage() {
  return (
    <div className="min-h-screen">
      <PageHero
        kicker="Legal"
        title="Refund Policy"
        sub={`How refunds work for subscription payments made to ${SITE_NAME} and service payments made directly to providers.`}
        crumbs={[{ label: "Home", href: "/" }, { label: "Refund Policy" }]}
      >
        <p className="text-xs text-white/60">Last updated: {UPDATED}</p>
      </PageHero>

      <main className="mx-auto max-w-6xl px-4 py-10">
      <DocBody>
        <h2>1. Purpose and Scope</h2>
        <p>
          Buyers pay service providers directly and the platform earns revenue through
          subscriptions. These are distinct payments: (1) payments buyers make directly to
          service providers for services and (2) subscription payments providers make to Devhulon
          for platform access or benefits.
        </p>
        <h2>2. Payments Between Buyers and Service Providers</h2>
        <p>
          Where a buyer pays a service provider directly, the provider is generally responsible
          for handling the buyer&apos;s refund request under the parties&apos; agreement and
          applicable law. Buyers should send requests to the provider and retain proof of payment
          and relevant communications. Devhulon does not hold the service payment and cannot
          promise to refund money it has not received. This does not prevent Devhulon from
          reviewing a platform complaint, taking appropriate action within its authority or
          assisting with information where lawful and appropriate.
        </p>
        <h2>3. Subscription Refund Requests</h2>
        <p>Subscription refund eligibility depends on the subscription terms, the circumstances and applicable law. A refund may be considered where, for example:</p>
        <ul>
          <li>A duplicate subscription payment is verified.</li>
          <li>A payment was processed incorrectly.</li>
          <li>A charge was unauthorised and is established after investigation.</li>
          <li>A material platform billing error occurred.</li>
          <li>A refund or cancellation is required by applicable law or the agreed subscription terms.</li>
        </ul>
        <p>
          These examples are not exhaustive and do not create an automatic entitlement where the
          facts or applicable law do not support one.
        </p>
        <h2>4. Cancellation Is Not the Same as a Refund</h2>
        <p>
          Cancelling a subscription generally concerns ending future subscription services or
          renewals. A refund concerns returning money already paid. The cancellation date,
          effective date, any renewal deadline and refund outcome are determined separately
          under the Subscription Terms and applicable law.
        </p>
        <h2>5. How to Submit a Request</h2>
        <p>
          Email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> with your name, account
          email, subscription or transaction reference, payment date and amount, a description
          of the issue and reasonably necessary supporting documents. Do not send full payment
          card numbers, passwords or unnecessary sensitive information.
        </p>
        <h2>6. Assessment and Processing</h2>
        <p>
          Devhulon will assess the request and may ask for reasonable additional information. We
          aim to acknowledge requests within 1–2 business days. This is a service target, not a
          guarantee, unless expressly stated otherwise. Statutory deadlines and rights remain
          applicable where required by law.
        </p>
        <h2>7. Contact</h2>
        <p>
          For subscription refund requests, contact{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. For complaints about a
          provider&apos;s service, refer to our <Link href="/complaints">Complaints &amp; Disputes Policy</Link>.
        </p>
      </DocBody>
      </main>
    </div>
  );
}
