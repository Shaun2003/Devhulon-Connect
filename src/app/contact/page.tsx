import { KIcon } from "@/lib/icons";
import Link from "next/link";
import type { Metadata } from "next";
import { Doc, DocHeader, DocBody } from "@/components/legal";
import ContactForm from "@/components/ContactForm";
import { CONTACT_EMAIL, CONTACT_HOURS, SITE_LEGAL, SITE_SHORT } from "@/lib/site";

export const metadata: Metadata = {
  alternates: { canonical: "/contact" },
  title: `Contact ${SITE_SHORT}`,
  description: `Contact ${SITE_SHORT} about platform access, service listings, subscriptions, privacy matters or complaints.`,
};

export default function ContactPage() {
  return (
    <Doc>
      <DocHeader
        kicker="Contact"
        title={`Talk to the ${SITE_SHORT} team`}
        sub={`We welcome enquiries about ${SITE_SHORT}, including platform access, service listings, subscriptions, privacy matters and complaints.`}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <a href={`mailto:${CONTACT_EMAIL}`} className="hippo-card p-4 hover-lift anim-rise">
          <span className="icon-3d icon-3d-sm" aria-hidden="true"><KIcon name="message" size={20} /></span>
          <p className="mt-3 text-sm font-extrabold text-[#10243e]">General, seller, subscription and privacy enquiries</p>
          <p className="text-sm text-[#558c2b] font-bold break-all">{CONTACT_EMAIL}</p>
          <p className="mt-1 text-xs text-[#1d3a5f]/60">Business hours: {CONTACT_HOURS}</p>
        </a>
        <a href="mailto:complaints@devhulonconnect.co.za" className="hippo-card p-4 hover-lift anim-rise">
          <span className="icon-3d icon-3d-sm" aria-hidden="true"><KIcon name="flag" size={20} /></span>
          <p className="mt-3 text-sm font-extrabold text-[#10243e]">Complaints and disputes</p>
          <p className="break-all text-sm font-bold text-[#558c2b]">complaints@devhulonconnect.co.za</p>
          <p className="mt-1 text-xs text-[#1d3a5f]/60">Platform-related concerns and reports</p>
        </a>
        <Link href="/advertise" className="hippo-card p-4 hover-lift anim-rise">
          <span className="icon-3d icon-3d-sm" aria-hidden="true"><KIcon name="megaphone" size={20} /></span>
          <p className="font-extrabold text-[#10243e] text-sm mt-3">For businesses</p>
          <p className="text-sm text-[#1d3a5f]/75">Plans &amp; pricing</p>
          <p className="text-xs text-[#1d3a5f]/60 mt-1">List free, upgrade when it works</p>
        </Link>
      </div>

      <DocBody>
        <h2>Send us a message</h2>
        <ContactForm />
      </DocBody>

      <DocBody>
        <h2>Operating Company</h2>
        <p>
          {SITE_LEGAL}<br />
          Website: <a href="https://www.devhulon.co.za/">devhulon.co.za</a><br />
          Registered address: Roodepoort, Gauteng, South Africa<br />
          Company registration number: 2024 / 683591 / 07
        </p>
        <h2>What Should I Include in My Enquiry?</h2>
        <ul>
          <li>Your name and preferred contact details.</li>
          <li>Your {SITE_SHORT} account details, if applicable.</li>
          <li>A clear description of your enquiry.</li>
          <li>Any relevant reference number, correspondence or supporting information.</li>
        </ul>
        <p>Please do not send passwords, payment card details or unnecessary sensitive personal information.</p>
        <h2>Complaints and Disputes</h2>
        <p>
          If your enquiry concerns a disagreement between a buyer and a service provider, please
          refer to our <Link href="/complaints">Complaints &amp; Disputes Policy</Link>. {SITE_SHORT}
          may review platform-related conduct and take action within its authority, but cannot
          promise to resolve every private contractual disagreement between users.
        </p>
        <h2>Privacy Requests</h2>
        <p>
          For requests concerning access to, correction of, or other matters relating to your
          personal information, contact <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
        <h2>Response Times</h2>
        <p>
          We aim to respond within 1–2 business days. This is a service target, not a guarantee,
          unless expressly stated otherwise. Statutory deadlines and rights remain applicable
          where required by law.
        </p>
        <h2>Changes to Contact Information</h2>
        <p>
          Contact details may change. The current details displayed on the official {SITE_SHORT}
          website will apply, subject to legal requirements governing notices and communications.
        </p>
        <p className="text-xs text-[#1d3a5f]/60">
          Read our <Link href="/terms">Terms of Use</Link> and <Link href="/privacy-policy">Privacy Policy</Link>
          {" "}for more information about using the platform and how we handle personal information.
        </p>
      </DocBody>
    </Doc>
  );
}
