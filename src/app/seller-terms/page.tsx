import type { Metadata } from "next";
import { DocBody } from "@/components/legal";
import { PageHero } from "@/components/ui";
import { CONTACT_EMAIL, SITE_NAME, SITE_SHORT } from "@/lib/site";

export const metadata: Metadata = {
  title: "Seller Terms",
  description:
    `Terms for sellers who list businesses, receive leads and send quotes on ${SITE_SHORT}.`,
  alternates: { canonical: "/seller-terms" },
  openGraph: {
    title: `${SITE_SHORT} seller terms`,
    description: `Terms that apply to sellers on ${SITE_SHORT}.`,
    url: "/seller-terms",
  },
};

const UPDATED = "29 October 2026";

export default function SellerTermsPage() {
  return (
    <div className="min-h-screen">
      <PageHero
        kicker="Legal"
        title="Seller Terms"
        sub={`These terms apply to sellers on ${SITE_NAME}. By listing you agree to them.`}
        crumbs={[{ label: "Home", href: "/" }, { label: "Seller Terms" }]}
      >
        <p className="text-xs text-white/60">Last updated: {UPDATED}</p>
      </PageHero>

      <main className="mx-auto max-w-6xl px-4 py-10">
      <DocBody>
        <h2>1. Who these terms apply to</h2>
        <p>
          These Seller Terms apply to any individual or business that creates a listing,
          receives leads, sends quotes, or otherwise participates as a seller on {SITE_SHORT}.
          They apply alongside the main Terms of Use, which also apply to you as a user
          of the platform.
        </p>

        <h2>2. Listing accuracy</h2>
        <p>
          You are responsible for the accuracy of your listing: business name, contact
          details, services, hours, pricing and portfolio. You must keep it up to date
          and correct any error promptly. We may remove or suspend listings that are
          inaccurate, misleading, unreachable, reported and not remedied, or otherwise in
          breach of these terms.
        </p>

        <h2>3. Leads and quotes</h2>
        <p>
          When a buyer requests a quote, you may receive a lead if your listing matches
          their request. You are not obliged to accept every lead. If you accept a lead
          you should respond promptly and, where you choose to send a quote, provide a
          clear price and description. Quotes are not guarantees of final price unless you
          state otherwise in writing.
        </p>
        <ul>
          <li>Respond to accepted leads within a reasonable time.</li>
          <li>Quotes should be clear about what is and is not included.</li>
          <li>Do not share a buyer&apos;s contact details with anyone else.</li>
        </ul>

        <h2>4. Fees and subscriptions</h2>
        <p>
          Listing on {SITE_SHORT} is subject to the subscription plans shown on the /pricing page.
          Fees are charged by {SITE_SHORT} and are separate from any amount you charge buyers.
          We may change plan features and pricing with notice. If your subscription lapses,
          your listing may be paused or removed.
        </p>

        <h2>5. Conduct</h2>
        <p>
          You must not: impersonate another business; post fake reviews or fake listings;
          use the platform to harass, threaten or discriminate; share buyer information
          outside the platform; or use {SITE_SHORT} for any unlawful purpose. We may suspend or
          remove your listing and account if you breach these terms.
        </p>

        <h2>6. Reviews</h2>
        <p>
          Reviews must be your genuine, first-hand experience. You may respond to reviews
          but must not offer incentives for positive reviews or try to suppress negative
          ones. We may remove reviews that are fake, abusive, irrelevant or breach these
          terms.
        </p>

        <h2>7. Suspension and removal</h2>
        <p>
          We may suspend or remove a listing or account if it breaches these terms, the
          main Terms of Use, or applicable law — including where a listing is inaccurate,
          unreachable, reported and not remedied, or where payment is overdue. Where
          reasonably possible we will give notice before removal.
        </p>

        <h2>8. Changes to these terms</h2>
        <p>
          We may update these Seller Terms from time to time. We will publish the updated
          version here with a new &quot;Last updated&quot; date. Continued use of the platform after
          changes are published counts as acceptance.
        </p>

        <h2>9. Governing law</h2>
        <p>
          These Seller Terms are governed by the laws of the Republic of South Africa.
          Questions:{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      </DocBody>
      </main>
    </div>
  );
}
