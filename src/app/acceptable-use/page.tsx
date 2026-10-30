import type { Metadata } from "next";
import { DocBody } from "@/components/legal";
import { PageHero } from "@/components/ui";
import { CONTACT_EMAIL, SITE_NAME, SITE_SHORT } from "@/lib/site";

export const metadata: Metadata = {
  title: "Acceptable Use Policy",
  description:
    `What is and is not allowed on ${SITE_SHORT}, platform rules and conduct policy.`,
  alternates: { canonical: "/acceptable-use" },
  openGraph: {
    title: `${SITE_SHORT} acceptable use policy`,
    description: `What you may and may not do on the ${SITE_SHORT} platform.`,
    url: "/acceptable-use",
  },
};

const UPDATED = "29 October 2026";

export default function AcceptableUsePage() {
  return (
    <div className="min-h-screen">
      <PageHero
        kicker="Legal"
        title="Acceptable Use"
        sub={`What you may and may not do on ${SITE_NAME}.`}
        crumbs={[{ label: "Home", href: "/" }, { label: "Acceptable Use" }]}
      >
        <p className="text-xs text-white/60">Last updated: {UPDATED}</p>
      </PageHero>

      <main className="mx-auto max-w-6xl px-4 py-10">
      <DocBody>
        <h2>1. You must not</h2>
        <p>Using {SITE_SHORT}, you must not:</p>
        <ul>
          <li>Impersonate another person or business, or misrepresent your identity, credentials or affiliation.</li>
          <li>Post fake listings, fake reviews, fake credentials or fraudulent content.</li>
          <li>Harass, threaten, bully, hate-speech or discriminate against other users.</li>
          <li>Publish other people&apos;s personal information without consent (doxxing).</li>
          <li>Use the platform for spam, bulk unsolicited messaging or scams.</li>
          <li>Upload or share content that is illegal, defamatory, obscene or infringes someone&apos;s rights.</li>
          <li>Attempt to interfere with the security of the platform, brute-force accounts, or scrape content at scale.</li>
          <li>Circumvent any technical measures, access controls or pricing on the platform.</li>
          <li>Use {SITE_SHORT} to promote illegal goods or services, or to facilitate anything unlawful.</li>
        </ul>

        <h2>2. You must</h2>
        <p>Using {SITE_SHORT}, you should:</p>
        <ul>
          <li>Keep your listing accurate and up to date.</li>
          <li>Respond to leads and messages reasonably and honestly.</li>
          <li>Only write reviews you have genuinely experienced.</li>
          <li>Respect other users and follow these guidelines and the main Terms of Use.</li>
        </ul>

        <h2>3. Intellectual property</h2>
        <p>
          The {SITE_SHORT} name, design, guides and original content are our property. Business
          names, logos and descriptions belong to their owners. Do not reproduce our
          content without permission.
        </p>

        <h2>4. Reporting unacceptable use</h2>
        <p>
          If you see use that breaks this policy, report it where the report feature is
          available, or contact us. We review reports and may remove content, suspend
          listings, accounts, or take other action. We may also report serious abuse to the
          relevant authorities.
        </p>

        <h2>5. Enforcement</h2>
        <p>
          We may, at our discretion and without prior notice: remove content; suspend or
          remove a listing; suspend or terminate an account; or take other action we
          consider appropriate. Where a breach is serious or repeated, we may act without
          warning.
        </p>

        <h2>6. Changes to this policy</h2>
        <p>
          We may update this Acceptable Use Policy from time to time. We will publish the
          updated version here with a new &quot;Last updated&quot; date. Continued use of the
          platform after changes are published counts as acceptance.
        </p>

        <h2>7. Contact</h2>
        <p>
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </p>
      </DocBody>
      </main>
    </div>
  );
}
