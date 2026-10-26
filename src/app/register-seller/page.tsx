import type { Metadata } from "next";
import SellerRegistration from "@/components/SellerRegistration";
import { pageMeta } from "@/lib/seo";
import { SITE_SHORT } from "@/lib/site";

export const metadata: Metadata = pageMeta({
  title: "Create your seller account",
  description: `Create your ${SITE_SHORT} seller account, verify your contact details, build your business profile and activate your dashboard.`,
  path: "/register-seller",
  keywords: ["seller registration", "register business South Africa", "become a seller", "local leads"],
});

export default function RegisterSellerPage() {
  return (
    <div className="min-h-screen">
      <div className="hippo-hero text-white">
        <div className="mx-auto w-full max-w-4xl min-w-0 px-4 pt-6 pb-8 text-center sm:px-6 sm:pt-8 sm:pb-9">
          <h1 className="break-words text-3xl font-black tracking-tight sm:text-4xl">
            Welcome to {SITE_SHORT}
          </h1>
          <p className="mx-auto mt-2 max-w-2xl break-words text-sm text-white/75 sm:text-base">
            Complete your account, business profile and plan setup in seven guided steps.
          </p>
        </div>
      </div>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <SellerRegistration />
      </main>
    </div>
  );
}
