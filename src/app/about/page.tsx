import Link from "next/link";
import type { Metadata } from "next";
import { DocBody } from "@/components/legal";
import { PageHero } from "@/components/ui";
import { CONTACT_EMAIL, SITE_LEGAL, SITE_SHORT } from "@/lib/site";

export const metadata: Metadata = {
  alternates: { canonical: "/about" },
  title: `About ${SITE_SHORT}`,
  description: `Learn about ${SITE_SHORT}, its operating company, purpose and how buyers and service providers connect.`,
};

export default function AboutPage() {
  return (
    <div className="min-h-screen">
      <PageHero
        kicker="About us"
        title={`Welcome to ${SITE_SHORT}`}
        sub={`${SITE_SHORT} helps people find service providers and helps businesses connect with potential customers.`}
        crumbs={[{ label: "Home", href: "/" }, { label: "About us" }]}
      />
      <main className="mx-auto max-w-6xl px-4 py-10">
        <div className="mx-auto max-w-6xl">
          <DocBody>
            <p>
              {SITE_SHORT} is operated by {SITE_LEGAL}. Buyers can browse participating businesses,
              describe a job and, where matching providers are available, receive quotes to compare.
              Providers can create a business profile, describe their services and service areas, and
              respond to relevant customer requests.
            </p>
            <h2>How the platform works</h2>
            <ul>
              <li>Buyers browse business profiles and submit service requests through the platform.</li>
              <li>Eligible participating providers may receive matched requests and send their own quotes.</li>
              <li>Buyers review available quotes and decide which provider, if any, to contact or accept.</li>
              <li>Providers manage their profiles and platform features through their seller dashboard.</li>
            </ul>

            <p>
              Features and availability can vary by location, provider participation and plan. A
              request does not guarantee that a provider will respond, and a quote is an offer from
              that provider—not a price set or endorsed by {SITE_SHORT}.
            </p>
            <p>
              Unless expressly stated otherwise, service agreements are entered into directly between
              buyers and service providers. Buyers pay service providers directly, and the parties are
              responsible for agreeing on the service scope, price, payment arrangements, delivery
              timelines and other transaction terms. {SITE_SHORT} is designed to facilitate
              connections. It is not automatically a party to agreements between buyers and providers.
            </p>
            <h2>Our Approach</h2>
            <ul>
              <li>Clear and accurate service information.</li>
              <li>Professional and respectful communication.</li>
              <li>Responsible use of the platform.</li>
              <li>Fair treatment of buyers and service providers.</li>
              <li>Appropriate handling of personal information.</li>
            </ul>
            <h2>Our Operating Company</h2>
            <p>
              {SITE_SHORT} is operated by {SITE_LEGAL}.<br />
              Registered address: Roodepoort, Gauteng, South Africa<br />
              Company registration number: 2024 / 683591 / 07<br />
              Website: <a href="https://www.devhulon.co.za/">devhulon.co.za</a><br />
              General enquiries: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
            </p>
            <h2>Stay Connected</h2>
            <p>
              For enquiries about {SITE_SHORT}, platform access or business participation, please
              contact us using the details on our <Link href="/contact">Contact page</Link>. For
              information about platform use, please read our <Link href="/terms">Terms of Use</Link>,
              <Link href="/buyer-terms"> Buyers Terms</Link>, <Link href="/seller-terms"> Sellers Terms</Link>,
              <Link href="/privacy-policy"> Privacy Policy</Link> and other applicable policies.
            </p>
            <p><b>{SITE_SHORT} — Connecting buyers with services and service providers.</b></p>
          </DocBody>
        </div>
      </main>
    </div>
  );
}
