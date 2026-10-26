import type { Metadata } from "next";
import { CreditCard } from "lucide-react";
import { Doc, DocHeader, DocBody } from "@/components/legal";
import { CONTACT_EMAIL, SITE_NAME, SITE_SHORT } from "@/lib/site";

export const metadata: Metadata = {
  title: "Subscription Terms",
  description:
    `How ${SITE_SHORT} seller subscriptions work — plans, billing, renewal and cancellation.`,
  alternates: { canonical: "/subscription-terms" },
  openGraph: {
    title: `${SITE_SHORT} subscription terms`,
    description: `Terms for ${SITE_SHORT} seller subscription plans and billing.`,
    url: "/subscription-terms",
  },
};

const UPDATED = "[Insert date]";

export default function SubscriptionTermsPage() {
  return (
    <Doc>
      <DocHeader
        kicker="Legal"
        title="Subscription Terms"
        sub={`Seller subscription terms for ${SITE_NAME}. Plans, billing, renewal, cancellation and refunds.`}
        updated={UPDATED}
        icon={CreditCard}
      />

      <DocBody>
        <h2>1. The plans</h2>
        <p>
          {SITE_SHORT} offers three seller plans. Each plan gives you a business listing, reviews,
          messaging and analytics to different levels. The current plans, features and
          prices are shown on the /pricing page and may change with notice.
        </p>
        <ul>
          <li>Starter — a basic listing to get started and receive matched leads.</li>
          <li>Professional — more services, portfolio and content publishing.</li>
          <li>Business — multiple locations, team members and priority features for larger operations.</li>
        </ul>

        <h2>2. Billing</h2>
        <p>
          Subscriptions are billed monthly or annually in South African Rand (ZAR). Annual
          billing is charged once a year. Prices on /pricing are the current prices; they
          may change with notice. The amount is confirmed at checkout before you are
          charged.
        </p>
        <ul>
          <li>Monthly: billed once per month.</li>
          <li>Annual: billed once per year.</li>
          <li>Prices on /pricing are the current prices; they may change with notice.</li>
        </ul>

        <h2>3. Free trial</h2>
        <p>
          New Starter plans may include a 7-day free trial. Nothing is charged during the
          trial. If you cancel before the trial ends you will not be charged. If you
          continue past the trial, your subscription begins and the standard terms apply.
          You can usually only claim the trial once per account.
        </p>

        <h2>4. Renewal</h2>
        <p>
          Subscriptions renew automatically at the end of each billing period until you
          cancel. You can turn auto-renewal off at any time — your plan stays active until
          the end of the paid period, then lapses. The renewal date is shown in your
          dashboard.
        </p>

        <h2>5. Cancellation</h2>
        <p>
          You can cancel auto-renewal at any time from your dashboard or by contacting us.
          Cancellation stops future billing; it does not usually entitle you to a refund for
          the current paid period unless required by law or where we have made an error.
          After cancellation and the end of the paid period, your listing may be paused or
          removed.
        </p>
        <ul>
          <li>Cancel auto-renewal anytime — no fee to cancel.</li>
          <li>Your plan stays active until the end of the paid period.</li>
          <li>After the period ends, access and listings may lapse.</li>
        </ul>

        <h2>6. Upgrading and downgrading</h2>
        <p>
          You can change plans at any time. Upgrades usually take effect immediately and the
          difference may be charged. Downgrades usually take effect at the end of the
          current billing period. The checkout flow will confirm what applies before you
          confirm.
        </p>

        <h2>7. Failed payments</h2>
        <p>
          If a payment fails, we may retry and your subscription may be paused or removed if
          payment is not resolved within a reasonable time. You are responsible for keeping
          your payment details up to date.
        </p>

        <h2>8. Refund policy</h2>
        <p>
          For subscription refunds, see the Refund Policy. In summary: incorrect or
          duplicate charges are investigated and may be refunded; change-of-mind refunds
          after a subscription has activated are considered case by case and are not
          automatically granted.
        </p>

        <h2>9. Price changes and notice</h2>
        <p>
          We may change plan features and pricing with reasonable notice. Where a change
          affects an existing subscription, we will usually give notice and let you
          continue on your current plan terms for the remainder of your current billing
          period.
        </p>

        <h2>10. Governing law</h2>
        <p>
          These Subscription Terms are governed by the laws of the Republic of South
          Africa.
          Questions:{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      </DocBody>
    </Doc>
  );
}
