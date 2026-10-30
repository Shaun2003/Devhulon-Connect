import Link from "next/link";
import type { Metadata } from "next";
import { DocBody } from "@/components/legal";
import { PageHero } from "@/components/ui";
import { CONTACT_EMAIL, SITE_LEGAL, SITE_NAME, SITE_SHORT } from "@/lib/site";

export const metadata: Metadata = {
  alternates: { canonical: "/terms" },
  title: "Terms of Use",
  description: `The rules for using ${SITE_SHORT} and connecting with service providers.`,
};

const UPDATED = "26 October 2026";

export default function TermsPage() {
  return (
    <div className="min-h-screen">
      <PageHero
        kicker="Legal"
        title="Terms of Use"
        sub={`These Terms of Use govern access to and use of ${SITE_NAME}. By using the platform, you agree to these terms and the additional policies applicable to your activities.`}
        crumbs={[{ label: "Home", href: "/" }, { label: "Terms of Use" }]}
      >
        <p className="text-xs text-white/60">Last updated: {UPDATED}</p>
      </PageHero>

      <main className="mx-auto max-w-6xl px-4 py-10">
      <DocBody>
        <h2>1. Introduction</h2>
        <p>
          {SITE_SHORT} is operated by {SITE_LEGAL} (&quot;Devhulon&quot;, &quot;we&quot;, &quot;us&quot; or
          &quot;our&quot;). If you do not agree to these terms, you must not use the platform.
          Where account registration or acceptance of particular terms is required, complete it
          before using that functionality.
        </p>
        <h2>2. Definitions</h2>
        <ul>
          <li><b>Platform</b> means the DevhulonConnect website, application or other digital services officially operated by Devhulon.</li>
          <li><b>User</b> means any person accessing or using the platform.</li>
          <li><b>Buyer</b> means a user seeking or purchasing services from a service provider.</li>
          <li><b>Seller or service provider</b> means a user offering services through the platform.</li>
          <li><b>Content</b> means information, text, photographs, logos, reviews, service descriptions and other material submitted or displayed through the platform.</li>
          <li><b>Subscription</b> means a paid or otherwise agreed recurring or fixed-term plan made available to a service provider.</li>
        </ul>
        <h2>3. Purpose of the Platform</h2>
        <p>
          {SITE_SHORT} is intended to facilitate the discovery of services and connections between
          buyers and service providers. Buyers and providers are responsible for their own
          agreements, unless a specific written arrangement expressly provides otherwise. Buyers
          pay providers directly. Devhulon does not hold or transfer buyer payments merely by
          providing the platform. Devhulon may charge service providers subscription fees for
          applicable platform plans.
        </p>
        <h2>4. Eligibility and Accounts</h2>
        <p>
          You must provide accurate information when creating or maintaining an account and be
          legally capable of entering into any agreement applicable to your use. If you act for a
          business or another person, you must have authority to do so. You are responsible for
          maintaining the confidentiality of your login credentials and for activity conducted
          through your account, subject to applicable law and circumstances outside your reasonable
          control. Promptly report suspected unauthorised access to{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. You must meet any
          verification or eligibility requirements shown for the account or feature you use.
        </p>
        <h2>5. User Responsibilities</h2>
        <ul>
          <li>Provide accurate and non-misleading information; respect other users&apos; rights and privacy; comply with applicable South African law; and use the platform only for lawful purposes.</li>
          <li>Avoid fraudulent, abusive, discriminatory or deceptive conduct and follow our <Link href="/acceptable-use">Acceptable Use Policy</Link> and <Link href="/community-guidelines">Community Rules</Link>.</li>
          <li>Do not misuse the platform, interfere with its security or attempt to gain unauthorised access to accounts, systems or information.</li>
        </ul>
        <h2>6. Service Listings and Transactions</h2>
        <p>
          Service providers are responsible for the accuracy, legality and completeness of their
          listings. Buyers are responsible for evaluating a provider&apos;s suitability and
          clarifying proposed service terms before committing. Before entering a transaction, the
          parties should agree on scope, price, payment arrangements, deadlines, cancellation terms
          and applicable warranties. Unless expressly agreed otherwise, providers perform the
          service and buyers pay providers directly under their agreement.
        </p>
        <h2>7. Platform Subscriptions</h2>
        <p>
          Service providers may be offered subscription plans. Applicable fees, billing periods,
          plan benefits, renewal arrangements and cancellation conditions must be disclosed before
          purchase. Subscription arrangements are governed by the{" "}
          <Link href="/subscription-terms">Subscription Terms</Link>. Nothing in these Terms of Use
          overrides mandatory consumer rights.
        </p>
        <h2>8. Fees and Taxes</h2>
        <p>
          Platform subscription fees will be displayed or communicated before a user commits.
          Buyers and service providers remain responsible for their own tax obligations arising
          from transactions between them. Devhulon will disclose applicable platform charges and
          taxes as required by law.
        </p>
        <h2>9. Intellectual Property</h2>
        <p>
          The platform&apos;s original software, branding, design and other protected material
          belong to Devhulon or its relevant licensors, subject to third-party rights. Users retain
          rights they hold in content they submit. By submitting content, users grant Devhulon a
          non-exclusive licence to host, reproduce, display and use it as reasonably necessary to
          operate, secure, promote and improve the platform, subject to applicable law and the{" "}
          <Link href="/privacy-policy">Privacy Policy</Link>. This does not transfer ownership of
          user intellectual property. Users must not submit material that infringes another
          person&apos;s rights.
        </p>
        <h2>10. Reviews and User Content</h2>
        <p>
          Reviews and other submitted content must be genuine, relevant and not misleading,
          unlawful, threatening or defamatory. Devhulon may review, restrict or remove content
          that violates applicable policies or law, subject to appropriate procedures and legal
          obligations. Report disputed or allegedly unlawful content to{" "}
          <a href="mailto:complaints@devhulonconnect.co.za">complaints@devhulonconnect.co.za</a>.
        </p>
        <h2>11. Suspension and Termination</h2>
        <p>
          Devhulon may restrict, suspend or terminate access where reasonably necessary to address
          suspected fraud, security risks, policy violations, unlawful conduct or other legitimate
          platform risks. Where appropriate and lawful, users will be informed of the reason and
          given an opportunity to respond or appeal. Any suspension, cancellation or termination
          remains subject to applicable law, contractual obligations and mandatory consumer rights.
          Termination does not automatically extinguish obligations or rights accrued beforehand.
        </p>
        <h2>12. Availability and Changes</h2>
        <p>
          Devhulon aims to maintain a functional platform but cannot guarantee uninterrupted or
          error-free access. Maintenance, updates or temporary restrictions may be required.
          Material feature or terms changes will be handled in accordance with applicable law and
          required notice or consent processes.
        </p>
        <h2>13. Disclaimers and Liability</h2>
        <p>
          Devhulon facilitates connections and does not automatically become a party to agreements
          between buyers and providers. Listing a provider does not guarantee that provider&apos;s
          qualifications, availability, conduct or performance. Nothing in these terms excludes or
          limits a right, warranty, remedy or liability that cannot lawfully be excluded or
          limited. Subject to that restriction, Devhulon is not responsible for a user&apos;s
          independent acts or omissions merely because the parties connected through the platform.
        </p>
        <h2>14. Privacy and Cookies</h2>
        <p>
          Personal information is handled in accordance with the{" "}
          <Link href="/privacy-policy">Privacy Policy</Link> and applicable data-protection law.
          Cookies and similar technologies are addressed in the{" "}
          <Link href="/cookie-policy">Cookies Policy</Link>.
        </p>
        <h2>15. Complaints</h2>
        <p>
          Platform-related complaints and user disputes may be submitted in accordance with the{" "}
          <Link href="/complaints">Complaints &amp; Disputes Policy</Link>. Users may also exercise
          external complaint, regulatory or legal remedies available to them.
        </p>
        <h2>16. Applicable Law</h2>
        <p>
          These terms are governed by the laws of the Republic of South Africa, subject to
          mandatory legal protections and jurisdictional rules. Nothing prevents a person from
          approaching a competent court, regulator or statutory dispute-resolution body where
          legally entitled to do so.
        </p>
        <h2>17. Changes to These Terms</h2>
        <p>
          The latest version is available in these <Link href="/terms">Terms of Use</Link>.
          Material changes will be communicated through platform notices or the email associated
          with your account where required by law or contract. Where renewed acceptance is legally
          required, users will be asked to provide it.
        </p>
        <h2>18. Contact</h2>
        <p>
          {SITE_LEGAL}<br />
          Email: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a><br />
          Registered address: Roodepoort, Gauteng, South Africa<br />
          Company registration number: 2024 / 683591 / 07
        </p>
      </DocBody>
      </main>
    </div>
  );
}
