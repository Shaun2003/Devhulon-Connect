import Link from "next/link";
import type { Metadata } from "next";
import { Doc, DocHeader, DocBody } from "@/components/legal";
import { CONTACT_EMAIL, SITE_NAME, SITE_SHORT } from "@/lib/site";

export const metadata: Metadata = {
  alternates: { canonical: "/cookie-policy" },
  title: "Cookie Policy",
  description: `How ${SITE_SHORT} may use cookies and similar technologies, and how to manage them.`,
};

const UPDATED = "[Insert date]";

export default function CookiePolicyPage() {
  return (
    <Doc>
      <DocHeader
        kicker="Legal"
        title="Cookie Policy"
        sub={`This explains how ${SITE_NAME} may use cookies and similar technologies, depending on the live website configuration.`}
        updated={UPDATED}
      />

      <DocBody>
        <h2>1. What Are Cookies?</h2>
        <p>
          Cookies are small files stored on a device when a user visits a website. Similar
          technologies may remember preferences, maintain sessions, measure website performance
          or support other functions.
        </p>
        <h2>2. Why We May Use Cookies</h2>
        <p>Depending on the final website configuration, {SITE_SHORT} may use cookies or similar technologies to:</p>
        <ul>
          <li>Keep users signed in and support account security.</li>
          <li>Remember settings and preferences.</li>
          <li>Understand website usage and improve performance.</li>
          <li>Support features provided by approved third-party services.</li>
          <li>Carry out optional analytics or marketing activities, where implemented lawfully.</li>
        </ul>
        <p>Only technologies actually used by the live platform will be described as active.</p>
        <h2>3. Categories of Cookies</h2>
        <ul>
          <li><b>Strictly necessary:</b> support essential functions such as security, session management or features specifically requested by the user.</li>
          <li><b>Preference:</b> remember settings such as language or display preferences.</li>
          <li><b>Analytics:</b> measure usage and understand how visitors interact with the platform.</li>
          <li><b>Marketing:</b> measure advertising or provide relevant marketing if such functionality is introduced.</li>
        </ul>
        <p>
          Once verified, the cookie preference tool or inventory will list the final categories,
          names, providers, purposes and retention periods. Until then, this policy does not claim
          that optional cookies or similar technologies are active.
        </p>
        <h2>4. Consent and Preferences</h2>
        <p>
          Where consent is legally required, non-essential cookies or similar technologies will
          not be activated before the necessary consent is obtained. Users will be given an
          appropriate way to accept, reject or manage optional cookies where required. Strictly
          necessary technologies may operate without consent where permitted by law. Withdrawing
          consent should be as straightforward as giving it. Browser settings can also manage
          certain cookies, although this may affect website functionality.
        </p>
        <h2>5. Third-Party Technologies</h2>
        <p>
          Some website functions may rely on third-party services. If those services place
          cookies or access information through similar technologies, the relevant providers and
          purposes will be disclosed where required. Third-party privacy practices are governed
          by the relevant providers&apos; policies, subject to Devhulon&apos;s own legal
          responsibilities.
        </p>
        <h2>6. Personal Information</h2>
        <p>
          Cookie information may constitute personal information when it identifies or can
          reasonably be linked to an individual. Where this occurs, applicable processing is
          addressed in our <Link href="/privacy-policy">Privacy Policy</Link> and must comply
          with relevant legal requirements.
        </p>
        <h2>7. Changes to This Policy</h2>
        <p>
          This policy may be updated when the website&apos;s technology or legal requirements
          change. The latest version will be available on the {SITE_SHORT} website.
        </p>
        <h2>8. Contact</h2>
        <p>
          For questions about cookies or privacy, contact{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      </DocBody>
    </Doc>
  );
}
