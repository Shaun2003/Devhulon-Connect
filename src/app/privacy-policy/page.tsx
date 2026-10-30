import Link from "next/link";
import type { Metadata } from "next";
import { DocBody } from "@/components/legal";
import { PageHero } from "@/components/ui";
import { CONTACT_EMAIL, SITE_NAME, SITE_SHORT } from "@/lib/site";

export const metadata: Metadata = {
  alternates: { canonical: "/privacy-policy" },
  title: "Privacy Policy",
  description: `How ${SITE_SHORT} collects, uses and protects personal information under South Africa's POPIA.`,
};

const UPDATED = "29 October 2026";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen">
      <PageHero
        kicker="Legal"
        title="Privacy Policy"
        sub={`${SITE_NAME} respects your privacy. This policy explains what we collect, why, and your rights under South Africa's Protection of Personal Information Act (POPIA).`}
        crumbs={[{ label: "Home", href: "/" }, { label: "Privacy Policy" }]}
      >
        <p className="text-xs text-white/60">Last updated: {UPDATED}</p>
      </PageHero>

      <main className="mx-auto max-w-6xl px-4 py-10">
      <DocBody>
        <h2>1. Who we are</h2>
        <p>
          {SITE_NAME} (&quot;we&quot;, &quot;us&quot;) operates a local business directory, comparison and
          content platform in South Africa. For the purposes of POPIA, we are the{" "}
          <b>responsible party</b> for personal information processed through this website. Contact:
          <a href={`mailto:${CONTACT_EMAIL}`}> {CONTACT_EMAIL}</a>.
        </p>

        <h2>2. Information we collect</h2>
        <ul>
          <li><b>Account details</b> (if you register): name, email address, and your auth provider&apos;s user ID.</li>
          <li><b>Business listings</b>: public profile information such as name, category, service area, hours, description and photos. Business phone, WhatsApp, email, website, social links and street address are stored separately as private account data and are not displayed on public profiles.</li>
          <li><b>Quote/lead requests</b>: the service, area, contact number and message you include when requesting quotes, together with the date and version of the consent you gave.</li>
          <li><b>Reviews</b>: the display name, rating and review text you publish.</li>
          <li><b>Technical data</b>: standard server logs and first-party daily aggregate counts of broad page types, searches submitted and quote requests submitted.</li>
        </ul>

        <h3>2a. First-party aggregate analytics</h3>
        <p>
          We measure whether the marketplace is working using daily counters for broad page
          categories, search submissions and successfully submitted quote requests. The analytics
          records contain counts only: they do not contain account IDs, device IDs, cookies, search
          terms, precise locations or IP addresses. We do not attempt to identify unique visitors
          or calculate user-level conversion rates. IP addresses may be processed separately for
          abuse prevention; rate-limit records are removed after 7 days. Daily aggregate analytics
          are retained for 400 days and then deleted.
        </p>

        <h2>3. Why we process it (lawful grounds)</h2>
        <ul>
          <li><b>To provide the service you asked for</b> (performance of a contract): publishing listings, routing quote requests to businesses, showing reviews.</li>
          <li><b>With your consent</b>: sharing your contact details with the businesses matched to a quote request, optional marketing emails, and non-essential cookies.</li>
          <li><b>Legitimate interest</b>: preventing spam and fraud, verifying listings by phone/WhatsApp, keeping the directory accurate, and measuring marketplace usage through non-identifying daily aggregate counts.</li>
          <li><b>Legal obligation</b>: responding to lawful requests from authorities.</li>
        </ul>

        <h2>3a. How we ask for consent to share your details</h2>
        <p>
          When you post a quote request, we alert matched businesses to your request. Your name,
          phone number and email (where you gave one) are stored separately from the request and
          are disclosed to a matched business only when it unlocks your contact through Devhulon
          Connect. That is a disclosure to an independent third party, so we ask for consent
          explicitly:
          every request form has an unticked checkbox that names <b>who</b> receives your details
          and <b>why</b>, and we record the date and the exact wording version you agreed to.
        </p>
        <ul>
          <li>One request reaches <b>at most 5 businesses</b> (usually 3). Only matched businesses can unlock your contact details; your contact is not included in the alert itself.</li>
          <li>Businesses may use your details <b>only to quote this job</b>. Selling or sharing them is a breach of our Acceptable Use Policy and results in removal from the platform.</li>
          <li>If you decline, we simply don&apos;t send the request. Browsing and searching never require you to hand over your number.</li>
          <li>You can <b>withdraw consent at any time</b> using the erasure option in section 8 — we then remove your details from every request you made.</li>
        </ul>

        <h2>4. Advertising and cookies</h2>
        <p>
          We show ads through <b>Google AdSense</b> as one of our revenue streams. Third-party
          vendors, including Google, use cookies to serve ads based on your prior visits to this and
          other websites. Google&apos;s use of advertising cookies enables it and its partners to serve
          ads to you based on your visit to our site and/or other sites on the Internet.
        </p>
        <ul>
          <li>You may opt out of personalised advertising by visiting{" "}
            <a href="https://www.google.com/settings/ads" target="_blank" rel="noreferrer">Google Ads Settings</a>, or
            opt out of third-party vendor cookies at{" "}
            <a href="https://www.aboutads.info/choices/" target="_blank" rel="noreferrer">aboutads.info</a>.</li>
          <li>See our <Link href="/cookie-policy">Cookie Policy</Link> for full details on cookies we and our partners use.</li>
        </ul>

        <h2>5. Sharing of information</h2>
        <ul>
          <li><b>Quote/lead requests</b> are shared with the relevant businesses so they can respond to you.</li>
          <li><b>Listings and reviews</b> are published publicly (that&apos;s the point of a directory).</li>
          <li><b>Service providers</b>: hosting, authentication, database and analytics providers (currently Google Firebase). They process data on our instructions.</li>
          <li>We do <b>not</b> sell your personal information to third parties.</li>
        </ul>

        <h2>6. Security and retention</h2>
        <p>
          Data is stored with industry-standard safeguards (encrypted transport, access controls,
          and server-side enforcement of who may read what). We keep personal information only as
          long as we state below — not &quot;as long as necessary&quot;.
        </p>
        <ul>
          <li><b>Quote requests: 180 days.</b> After that we strip your name, number and email and keep only an anonymous record of the outcome (was it quoted, was it won). Businesses have 180 days to quote and for you to compare, which is generous.</li>
          <li><b>Unanswered open requests: 30 days.</b> A request nobody responds to is closed and the businesses are stood down, rather than sitting in inboxes indefinitely.</li>
          <li><b>Reviews: kept while published.</b> Remove yours any time and we anonymise it (your name is replaced and the link to your account is cleared) while keeping the rating and text, so a business does not lose genuine feedback.</li>
          <li><b>Payments and invoices:</b> kept for the period required by South African tax law (typically 5 years), regardless of any other deletion.</li>
          <li><b>Server logs:</b> short operational retention, then aggregated.</li>
        </ul>
        <p>
          You can trigger this yourself — see section 8. We do not need you to email us first.
        </p>

        <h2>7. Cross-border processing</h2>
        <p>
          Some of our service providers may process information outside South Africa. Where that
          happens, we rely on POPIA s72 conditions and the provider&apos;s contractual safeguards to
          protect your information to a standard comparable to POPIA.
        </p>

        <h2>8. Your POPIA rights</h2>
        <ul>
          <li>Ask us what personal information we hold about you and request <b>access</b>.</li>
          <li>Request <b>correction or deletion</b> of your information.</li>
          <li><b>Object</b> to processing, or withdraw consent (e.g. unsubscribe from emails).</li>
          <li><b>Complain</b> to the Information Regulator:{" "}
            <a href="https://inforegulator.org.za" target="_blank" rel="noreferrer">inforegulator.org.za</a> ·{" "}
            <a href="mailto:POPIAComplaints@inforegulator.org.za">POPIAComplaints@inforegulator.org.za</a>.</li>
        </ul>
        <p>
          To exercise any right, email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> — we
          respond within 30 days.
        </p>

        <h3>Erase your details now (self-service)</h3>
        <p>
          You do not have to wait for an email reply to exercise the right to be forgotten.
          Sign in to your account and use <b>Erase my personal data</b> in your dashboard. This
          immediately:
        </p>
        <ul>
          <li>removes your name, phone number and email from every quote request you made,</li>
          <li>anonymises your reviews (your name is replaced, the link to your account cleared) while keeping the rating and text,</li>
          <li>removes your personal details from bookings and messages, and</li>
          <li>deletes your account profile.</li>
        </ul>
        <p>
          We keep the <b>commercial record</b> in anonymised form — that a request existed, was
          quoted on, and was won or lost — because businesses need it for their own records and
          because it contains no personal information once your details are gone.
        </p>
        <p>
          If you still have a business listing published, we will ask you to close or transfer it
          first rather than silently deleting a public profile other customers rely on.
        </p>

        <h2>9. Children</h2>
        <p>{SITE_SHORT} is not directed at children under 18, and we do not knowingly collect their personal information.</p>

        <h2>10. Changes to this policy</h2>
        <p>
          We&apos;ll post updates on this page with a new &quot;last updated&quot; date. Material
          changes will be highlighted on the homepage for a reasonable period.
        </p>
      </DocBody>
      </main>
    </div>
  );
}
