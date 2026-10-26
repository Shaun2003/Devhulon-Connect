import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import Script from "next/script";
import "./globals.css";
import { Header, Footer } from "@/components/chrome";
import ErrorReporter from "@/components/ErrorReporter";
import { AuthProvider } from "@/components/AuthProvider";
import { SavedItemsProvider } from "@/components/SavedItemsProvider";
import { PlanConfigProvider } from "@/components/PlanConfigProvider";
import AnalyticsTracker from "@/components/AnalyticsTracker";
import { CONTACT_EMAIL, SITE_LEGAL, SITE_NAME, SITE_SHORT, SITE_URL } from "@/lib/site";

const ADSENSE_CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT ?? "";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_SHORT} — Connecting buyers with services and service providers`,
    template: `%s · ${SITE_SHORT}`,
  },
  description:
    `Find local service providers across South Africa, browse business listings, and send quote requests with ${SITE_SHORT}.`,
  applicationName: SITE_SHORT,
  keywords: [
    "local businesses South Africa",
    "compare plumbers Gauteng",
    "trusted electricians Western Cape",
    "local services directory",
    "get quotes South Africa",
  ],
  // Public by default; member/admin surfaces opt out with robots:{index:false}.
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
  },
  openGraph: {
    type: "website",
    siteName: SITE_SHORT,
    locale: "en_ZA",
    title: `${SITE_SHORT} — Connecting buyers with services and service providers`,
    description:
      "Discover services offered by participating providers and connect with them through the platform.",
    images: [{ url: `${SITE_URL}/opengraph-image`, width: 1200, height: 630, alt: `${SITE_SHORT} — connecting buyers with services` }],
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_SHORT} — Connecting buyers with services and service providers`,
    description: "Discover services offered by participating providers and connect with them through the platform.",
    images: [`${SITE_URL}/opengraph-image`],
  },
  icons: { icon: "/devhulon-connect-icon.png", apple: "/devhulon-connect-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#10243e",
  width: "device-width",
  initialScale: 1,
};


/** Site-wide structured data: who we are + what the site does (WebSite + Organization). */
const siteSchema = JSON.stringify({
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: SITE_LEGAL,
      alternateName: SITE_SHORT,
      url: SITE_URL,
      logo: `${SITE_URL}/devhulon-connect-logo.png`,
      description:
        `${SITE_SHORT} helps people and businesses discover services and connect with participating service providers.`,
      contactPoint: [
        {
          "@type": "ContactPoint",
          contactType: "customer service",
          email: CONTACT_EMAIL,
          availableLanguage: ["English", "Afrikaans", "isiZulu"],
        },
      ],
      areaServed: [{ "@type": "Country", name: "South Africa" }],
      sameAs: [],
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: SITE_NAME,
      publisher: { "@id": `${SITE_URL}/#organization` },
      inLanguage: "en-ZA",
    },
  ],
});

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#f2f6fa] via-[#f2f6fa] to-[#e7eef5] text-[#10243e] antialiased">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: siteSchema }} />
        {ADSENSE_CLIENT && (
          <Script
            async
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`}
            strategy="afterInteractive"
            crossOrigin="anonymous"
          />
        )}
        <AuthProvider>
          <PlanConfigProvider>
            <SavedItemsProvider>
              {/* Installs the global error/unhandledrejection handlers once, at the
                  root, so a crash on ANY page is reported. Set
                  NEXT_PUBLIC_ERROR_REPORTING=off to disable without a code change. */}
              <ErrorReporter />
              <AnalyticsTracker />
              <Header />
              <main className="flex-1">
                <div className="site-page">{children}</div>
              </main>
              <Footer />
            </SavedItemsProvider>
          </PlanConfigProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
