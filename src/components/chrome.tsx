import Link from "next/link";
import Image from "next/image";
import AuthButton from "./AuthButton";
import NotificationsBell from "./NotificationsBell";
import SavedCountLink from "./SavedCountLink";
import MobileMenu from "./MobileMenu";
import { SITE_LEGAL, SITE_SHORT } from "@/lib/site";

const navLinks = [
  { href: "/services", label: "Services" },
  { href: "/request-quote", label: "Compare quotes" },
];

const exploreLinks = [
  { href: "/find-pro", label: "Find pros" },
  { href: "/jobs", label: "Jobs" },
  { href: "/events", label: "Events" },
  { href: "/deals", label: "Deals" },
  { href: "/places", label: "Places" },
  { href: "/guides", label: "Guides" },
];

export function Header() {
  return (
    <header className="sticky top-0 z-40 shadow-[0_2px_16px_-8px_rgba(11,30,51,0.4)]">
      <div className="bg-[#0b1e33] text-white/85 text-[12px]">
        <div className="w-full px-4 py-1.5 flex items-center gap-3 sm:px-6 lg:px-8">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-[#7ac142]" />
            Connecting buyers and service providers
          </span>
          <span className="ml-auto hidden sm:flex items-center gap-3">
            <Link href="/advertise" className="hover:text-white">For business</Link>
          </span>
        </div>
      </div>
      <div className="bg-white">
        <div className="w-full px-4 py-3 flex items-center gap-2 sm:gap-3 sm:px-6 lg:px-8">
          <Link href="/" className="flex min-w-0 shrink items-center" aria-label={`${SITE_SHORT} home`}>
            <Image src="/devhulon-connect-logo.png" alt={SITE_SHORT} width={1600} height={639} priority className="h-auto w-[132px] max-[380px]:w-[112px] sm:w-[170px] lg:w-[160px]" />
          </Link>
          <nav className="ml-4 hidden lg:flex items-center gap-1 text-sm font-semibold text-[#10243e]">
            {navLinks.map((l) => (
              <Link key={l.href} href={l.href} className="px-3 py-2 rounded-full hover:bg-[#f2f6fa] text-[#10243e] hover:text-[#558c2b] transition-colors duration-150">{l.label}</Link>
            ))}
            <div className="group relative">
              <button className="px-3 py-2 rounded-full hover:bg-[#f2f6fa] text-[#10243e] hover:text-[#558c2b] transition-colors duration-150 flex items-center gap-1">
                Explore <span className="text-xs">▼</span>
              </button>
              <div className="absolute top-full left-0 mt-2 w-48 bg-white border border-[#e7eef5] rounded-2xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                <div className="py-2">
                  {exploreLinks.map((l) => (
                    <Link key={l.href} href={l.href} className="block px-4 py-2 hover:bg-[#f2f6fa] hover:text-[#558c2b] transition-colors text-[#10243e]">
                      {l.label}
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </nav>
          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <NotificationsBell />
            <div className="hidden sm:block"><SavedCountLink /></div>
            <AuthButton />
            <MobileMenu navLinks={navLinks} exploreLinks={exploreLinks} />
          </div>
        </div>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="mt-14 bg-[#0b1e33] text-white/75">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="grid grid-cols-2 gap-x-6 gap-y-8 border-b border-white/10 pb-8 sm:grid-cols-4 sm:gap-8">
          <div className="col-span-2 sm:col-span-1">
            <Link href="/" aria-label={`${SITE_SHORT} home`} className="inline-flex">
              <Image
                src="/devhulon-connect-logo.png"
                alt={SITE_SHORT}
                width={1600}
                height={639}
                className="h-auto w-40 rounded-md bg-white p-1 sm:w-44"
              />
            </Link>
            <p className="mt-3 max-w-xs text-xs leading-5 text-white/60">
              Connecting buyers with services and service providers.
            </p>
          </div>

          <nav aria-label="Explore">
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-white">Explore</h2>
            <Link className="block py-1 text-sm hover:text-[#ffc72c]" href="/services">Services</Link>
            <Link className="block py-1 text-sm hover:text-[#ffc72c]" href="/find-pro">Find a provider</Link>
          </nav>

          <nav aria-label="Company">
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-white">Company</h2>
            <Link className="block py-1 text-sm hover:text-[#ffc72c]" href="/about">About us</Link>
            <Link className="block py-1 text-sm hover:text-[#ffc72c]" href="/contact">Contact</Link>
          </nav>

          <nav aria-label="For providers">
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-white">For providers</h2>
            <Link className="block py-1 text-sm hover:text-[#ffc72c]" href="/pricing">Plans &amp; pricing</Link>
            <Link className="block py-1 text-sm hover:text-[#ffc72c]" href="/advertise">Advertise</Link>
          </nav>
        </div>

        <div className="grid gap-3 border-b border-white/10 py-4 sm:grid-cols-2">
          <details className="group rounded-lg">
            <summary className="cursor-pointer list-none py-2 text-xs font-semibold text-white/65 hover:text-white [&::-webkit-details-marker]:hidden">
              More to explore <span aria-hidden="true" className="ml-1 inline-block transition-transform group-open:rotate-180">⌄</span>
            </summary>
            <nav aria-label="More to explore" className="flex flex-wrap gap-x-4 gap-y-1 pb-2">
              <Link className="py-1 text-xs hover:text-[#ffc72c]" href="/jobs">Local jobs</Link>
              <Link className="py-1 text-xs hover:text-[#ffc72c]" href="/events">What&apos;s on</Link>
              <Link className="py-1 text-xs hover:text-[#ffc72c]" href="/deals">Deals</Link>
              <Link className="py-1 text-xs hover:text-[#ffc72c]" href="/guides">Local guides</Link>
              <Link className="py-1 text-xs hover:text-[#ffc72c]" href="/places">Places to visit</Link>
            </nav>
          </details>

          <details className="group rounded-lg">
            <summary className="cursor-pointer list-none py-2 text-xs font-semibold text-white/65 hover:text-white [&::-webkit-details-marker]:hidden">
              Policies &amp; legal <span aria-hidden="true" className="ml-1 inline-block transition-transform group-open:rotate-180">⌄</span>
            </summary>
            <nav aria-label="Policies and legal information" className="grid grid-cols-2 gap-x-3 pb-2 sm:grid-cols-3">
              <Link className="py-1 text-xs hover:text-[#ffc72c]" href="/terms">Terms of Use</Link>
              <Link className="py-1 text-xs hover:text-[#ffc72c]" href="/privacy-policy">Privacy (POPIA)</Link>
              <Link className="py-1 text-xs hover:text-[#ffc72c]" href="/cookie-policy">Cookies</Link>
              <Link className="py-1 text-xs hover:text-[#ffc72c]" href="/seller-terms">Seller Terms</Link>
              <Link className="py-1 text-xs hover:text-[#ffc72c]" href="/buyer-terms">Buyer Terms</Link>
              <Link className="py-1 text-xs hover:text-[#ffc72c]" href="/subscription-terms">Subscriptions</Link>
              <Link className="py-1 text-xs hover:text-[#ffc72c]" href="/refund-policy">Refunds</Link>
              <Link className="py-1 text-xs hover:text-[#ffc72c]" href="/acceptable-use">Acceptable Use</Link>
              <Link className="py-1 text-xs hover:text-[#ffc72c]" href="/complaints">Complaints &amp; Disputes</Link>
              <Link className="py-1 text-xs hover:text-[#ffc72c]" href="/community-guidelines">Community Rules</Link>
            </nav>
          </details>
        </div>

        <div className="flex flex-col gap-2 pt-4 text-[11px] text-white/45 sm:flex-row sm:items-center sm:justify-between">
          <span>© 2026 {SITE_LEGAL}</span>
          <span>Roodepoort, Gauteng, South Africa</span>
        </div>
      </div>
    </footer>
  );
}
