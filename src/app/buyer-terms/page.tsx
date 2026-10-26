import type { Metadata } from "next";
import Link from "next/link";
import { Users } from "lucide-react";
import { Doc, DocHeader, DocBody } from "@/components/legal";
import { CONTACT_EMAIL, SITE_NAME, SITE_SHORT } from "@/lib/site";

export const metadata: Metadata = {
  title: "Buyer Terms",
  description:
    `Terms for buyers who use ${SITE_SHORT} to search for, enquire about or engage service providers.`,
  alternates: { canonical: "/buyer-terms" },
  openGraph: {
    title: `${SITE_SHORT} buyer terms`,
    description: `Terms that apply to buyers using ${SITE_SHORT}.`,
    url: "/buyer-terms",
  },
};

const UPDATED = "[Insert date]";

export default function BuyerTermsPage() {
  return (
    <Doc>
      <DocHeader
        kicker="Legal"
        title="Buyer Terms"
        sub={`These terms apply when you use ${SITE_NAME} to search for, enquire about or engage a service provider. They supplement the general Terms of Use and other applicable policies.`}
        updated={UPDATED}
        icon={Users}
      />

      <DocBody>
        <h2>1. Purpose</h2>
        <p>
          These Buyer Terms supplement the general <Link href="/terms">Terms of Use</Link> and must be
          read with the Refund Policy, Complaints &amp; Disputes Policy, Privacy Policy and other
          relevant policies.
        </p>
        <h2>2. Role of Devhulon Connect</h2>
        <p>
          {SITE_SHORT} facilitates connections between buyers and service providers. Unless
          expressly stated otherwise, Devhulon is not the supplier of services listed by
          independent providers and is not automatically a party to a service agreement between
          the parties. Buyers pay providers directly. Devhulon does not receive or hold the
          buyer&apos;s service payment merely because the parties connected through the platform.
        </p>
        <h2>3. Evaluating Service Providers</h2>
        <p>
          Before committing to a service, buyers should review provider and service information,
          ask relevant questions about experience or qualifications, confirm that the provider
          can lawfully perform the service, obtain a written quotation or agreement for material
          work, and clarify total price, payment arrangements, scope, delivery dates and
          cancellation conditions. A listing or profile is not by itself a guarantee or
          endorsement by Devhulon.
        </p>
        <h2>4. Quotations and Agreements</h2>
        <p>
          A service listing or enquiry does not necessarily constitute a binding offer or
          acceptance. A contract may be formed through communications between the buyer and
          provider, depending on the circumstances and applicable law. Ensure all material terms
          are clear before accepting a quotation, making payment or authorising work.
        </p>
        <h2>5. Payments</h2>
        <p>
          Payments for services are made directly to the provider under the arrangement agreed
          between the parties. Verify the recipient&apos;s identity and payment instructions
          through a reliable channel before paying. Keep quotations, invoices, proof of payment
          and relevant communications. Devhulon does not guarantee recovery of funds paid
          directly to a provider. This does not remove any legal rights a buyer may have against
          the provider or any responsibility Devhulon may independently have under applicable
          law.
        </p>
        <h2>6. Service Delivery and Quality</h2>
        <p>
          The provider is responsible for delivering the service in accordance with the parties&apos;
          agreement and applicable law. If a service is delayed, incomplete, defective or
          materially different from what was agreed, communicate the concern to the provider and
          retain relevant evidence. Buyers may submit a platform complaint under the{" "}
          <Link href="/complaints">Complaints &amp; Disputes Policy</Link>.
        </p>
        <h2>7. Cancellations and Refunds</h2>
        <p>
          Cancellation and refund rights depend on the agreement, the nature of the service and
          applicable law. Review the provider&apos;s cancellation terms before committing. The
          platform&apos;s <Link href="/refund-policy">Refund Policy</Link> explains the scope of any
          refund process Devhulon itself administers. It does not replace a provider&apos;s legal
          obligations or remove mandatory statutory rights.
        </p>
        <h2>8. Accurate and Respectful Conduct</h2>
        <p>
          Buyers must provide accurate information, communicate respectfully and use the platform
          for lawful purposes. Fraudulent payment instructions, harassment, threats, false
          reviews and attempts to misuse another user&apos;s information are prohibited.
        </p>
        <h2>9. Reviews and Complaints</h2>
        <p>
          Where reviews are available, they must reflect genuine experiences and must not be
          manipulated or used to threaten, harass or extort another user. Report suspected fraud,
          misleading listings, inappropriate conduct or other policy violations to{" "}
          <a href="mailto:complaints@devhulonconnect.co.za">complaints@devhulonconnect.co.za</a>.
        </p>
        <h2>10. Personal Information</h2>
        <p>
          Use provider contact information only for legitimate purposes related to your enquiry
          or transaction. Personal information must not be copied, sold, disclosed or used for
          unsolicited marketing or other unauthorised purposes.
        </p>
        <h2>11. Limitation of Platform Responsibility</h2>
        <p>
          Devhulon does not guarantee the conduct, availability, qualifications, financial
          standing or performance of an independent provider. Nothing in these terms excludes any
          responsibility or remedy that applicable law imposes on Devhulon or any other party.
        </p>
        <h2>12. Contact and Disputes</h2>
        <p>
          For transaction concerns, refer to the <Link href="/complaints">Complaints &amp; Disputes Policy</Link>.
          For platform access or account issues, contact{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. These terms are governed by
          South African law, subject to applicable mandatory rights and remedies.
        </p>
      </DocBody>
    </Doc>
  );
}
