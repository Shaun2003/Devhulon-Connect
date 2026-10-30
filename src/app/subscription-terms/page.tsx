import type { Metadata } from "next";
import { DocBody } from "@/components/legal";
import { PageHero } from "@/components/ui";
import { CONTACT_EMAIL, SITE_NAME, SITE_SHORT } from "@/lib/site";

export const metadata: Metadata = {
  title: "Subscription Terms",
  description:
    `How ${SITE_SHORT} seller plans, prepaid billing, credits and expiry work.`,
  alternates: { canonical: "/subscription-terms" },
  openGraph: {
    title: `${SITE_SHORT} subscription terms`,
    description: `Terms for ${SITE_SHORT} seller subscription plans and billing.`,
    url: "/subscription-terms",
  },
};

const UPDATED = "29 October 2026";

export default function SubscriptionTermsPage() {
  return (
    <div className="min-h-screen">
      <PageHero
        kicker="Legal"
        title="Subscription Terms"
        sub={`Seller plan terms for ${SITE_NAME}. Prepaid billing, credits, expiry and refunds.`}
        crumbs={[{ label: "Home", href: "/" }, { label: "Subscription Terms" }]}
      >
        <p className="text-xs text-white/60">Last updated: {UPDATED}</p>
      </PageHero>

      <main className="mx-auto max-w-6xl px-4 py-10">
      <DocBody>
        <h2>1. The plans</h2>
        <p>
          {SITE_SHORT} offers Starter and Premium seller plans. Both plans include a
          business listing and access to core marketplace features. The current
          features and prices are shown on the /pricing page and may change with
          reasonable notice.
        </p>
        <ul>
          <li>Starter — free, with 35 included credits and up to 3 eligible lead opportunities per monthly allocation period.</li>
          <li>Premium — R300 per month, with 300 included credits per paid month and unlimited eligible lead opportunities.</li>
        </ul>

        <h2>2. Billing</h2>
        <p>
          Starter is free. Premium is prepaid in South African Rand (ZAR) through a
          hosted checkout. Monthly Premium is R300; if annual checkout is offered, its
          full amount is charged upfront and the amount is shown before payment.
          One-time checkout is available. If Paystack is configured, a seller may
          separately opt in to automatic renewal at the displayed period and price.
        </p>
        <ul>
          <li>Starter activation does not require payment checkout.</li>
          <li>A Premium period starts only after the payment provider confirms payment.</li>
          <li>Annual Premium, when available, is charged once upfront; included credits are allocated monthly during the paid period.</li>
        </ul>

        <h2>3. Included credits</h2>
        <p>
          Starter receives 35 included credits per monthly allocation period. An active
          Premium plan receives 300 included credits for each paid monthly allocation
          period. Credits are granted only after the applicable activation or payment
          is confirmed. Unused included credits do not roll over into the next
          allocation period.
        </p>
        <p>
          Purchased credit packs are tracked separately from included plan credits.
          Their balance is preserved if Premium expires or the account returns to
          Starter. Each lead unlock uses the number of credits shown before the
          seller confirms the unlock.
        </p>

        <h2>4. Lead opportunities and unlocking</h2>
        <p>
          A lead opportunity is a relevant buyer request allocated to a seller. Starter
          is limited to 3 unique eligible opportunities per monthly period. Reopening or
          receiving another notification for the same request does not count it again.
          Premium has no fixed monthly opportunity limit, but each lead contact unlock
          still costs the credits displayed for that lead.
        </p>
        <p>
          Buying extra credits does not increase Starter&apos;s 3-opportunity limit. An
          unlock gives access only to the contact information authorised for that
          specific request; it does not grant access to unrelated buyer records.
        </p>

        <h2>5. Renewal and expiry</h2>
        <p>
          Automatic renewal is optional and requires an explicit opt-in during
          Paystack checkout. A reusable payment authorisation is stored securely by
          the server; it is never available to the browser. Sellers can turn off
          renewal from the billing page at any time, and Premium access remains
          available until the already-paid period ends. One-time purchases require a
          new confirmed checkout to extend Premium. Automatic renewals use the
          amount explicitly agreed to at checkout; a later price change does not
          silently change an existing renewal amount.
        </p>
        <p>
          If an automatic renewal fails, the system may retry after one day and then
          after three days. Renewal stops after three failed attempts; Premium remains
          available only through the paid-through date. If no confirmed renewal
          extends the period, the account reverts to Starter.
        </p>
        <p>
          Downgrading does not remove a business listing, existing leads, quotes,
          reviews, conversations or purchased credits. Starter limits apply after
          Premium expires; Premium-only tools and features are no longer available.
        </p>

        <h2>6. Failed payments and refunds</h2>
        <p>
          An unconfirmed or failed payment does not activate Premium or grant its
          included credits. An initial checkout failure does not alter an existing
          paid subscription. Failed automatic renewals follow the retry policy above.
          For a refunded credit pack, unspent purchased credits are revoked; credits
          already spent cannot be restored. A refunded current subscription period is
          ended and its unused included credits are revoked. For subscription or
          credit-pack refunds, see the Refund Policy. Incorrect or duplicate charges
          and partial refunds are reviewed manually; other refund requests are
          handled under that policy and applicable law.
        </p>

        <h2>7. Price changes and notice</h2>
        <p>
          We may change plan features and pricing with reasonable notice. A confirmed
          paid period continues under the amount and terms presented at its checkout.
        </p>

        <h2>8. Governing law and questions</h2>
        <p>
          These Subscription Terms are governed by the laws of the Republic of South
          Africa.
          Questions:{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      </DocBody>
      </main>
    </div>
  );
}
