import type { Metadata } from "next";
import { DocBody } from "@/components/legal";
import { PageHero } from "@/components/ui";
import { CONTACT_EMAIL, SITE_NAME, SITE_SHORT } from "@/lib/site";

export const metadata: Metadata = {
  title: "Community Guidelines",
  description:
    `How to participate respectfully on ${SITE_SHORT} — for buyers, sellers and reviewers.`,
  alternates: { canonical: "/community-guidelines" },
  openGraph: {
    title: `${SITE_SHORT} community guidelines`,
    description: `How to participate respectfully on the ${SITE_SHORT} platform.`,
    url: "/community-guidelines",
  },
};

const UPDATED = "29 October 2026";

export default function CommunityGuidelinesPage() {
  return (
    <div className="min-h-screen">
      <PageHero
        kicker="Legal"
        title="Community Guidelines"
        sub={`Participate respectfully on ${SITE_NAME}. These guidelines apply to everyone.`}
        crumbs={[{ label: "Home", href: "/" }, { label: "Community Guidelines" }]}
      >
        <p className="text-xs text-white/60">Last updated: {UPDATED}</p>
      </PageHero>

      <main className="mx-auto max-w-6xl px-4 py-10">
      <DocBody>
        <h2>1. Be respectful</h2>
        <p>
          Treat other users — buyers, sellers, reviewers and staff — with respect. Personal
          attacks, bullying, hate speech, threats and harassment are not allowed.
        </p>

        <h2>2. Be honest</h2>
        <p>
          Listings, reviews, quotes and messages should be truthful. Do not post fake
          listings, fake reviews, fake credentials or misleading information. Do not
          impersonate another business or person.
        </p>
        <ul>
          <li>Reviews must be your genuine, first-hand experience.</li>
          <li>Listings should accurately reflect your business.</li>
          <li>Do not invent services, prices or credentials.</li>
        </ul>

        <h2>3. No spam or scams</h2>
        <p>
          Do not post repetitive or irrelevant content, send unwanted bulk messages,
          promote scams, or try to move transactions off the platform to avoid the rules.
          Fraudulent activity may be reported to the relevant authorities.
        </p>

        <h2>4. Protect privacy</h2>
        <p>
          Do not publish other people&apos;s personal information — phone numbers, addresses,
          email addresses, IDs or similar — without their consent. Do not use platform
          features to doxx or expose others.
        </p>

        <h2>5. Keep it relevant</h2>
        <p>
          Keep listings, reviews and messages relevant to the service or business they
          relate to. Off-topic promotional content, political content and unrelated
          advertising may be removed.
        </p>

        <h2>6. Reporting</h2>
        <p>
          If you see content that breaks these guidelines, report it where the report
          feature is available, or contact us. We review reports and may remove content,
          suspend listings or accounts, or take other action. We may also report serious
          abuse to the relevant authorities.
        </p>

        <h2>7. Enforcement</h2>
        <p>
          Where someone breaks these guidelines we may warn them, remove content, suspend
          a listing or account, or take other action proportionate to the breach. Repeated
          or serious breaches may result in permanent removal.
        </p>

        <h2>8. Contact</h2>
        <p>
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </p>
      </DocBody>
      </main>
    </div>
  );
}
