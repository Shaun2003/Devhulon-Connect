import { DashboardRouter } from "@/components/dash/DashboardRouter";
import type { Metadata } from "next";
import { SITE_SHORT } from "@/lib/site";

export const metadata: Metadata = {
  title: `My ${SITE_SHORT} dashboard`,
  alternates: { canonical: "/dashboard" },
  robots: { index: false, follow: true },
};

export default async function DashboardPage({
  searchParams,
}: {
  // Next 15/16 hands pages a PROMISE for searchParams, not a plain object.
  // Typing it as a record and reading it synchronously threw at runtime:
  //   "Route /dashboard used searchParams.billing. searchParams is a Promise
  //    and must be unwrapped with await or React.use()"
  // which broke the billing-return path right after a checkout redirect.
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const billingReturn = sp?.billing === "return" && typeof sp?.reference === "string";
  const initialSellerTab =
    sp?.tab === "marketplace" ? "marketplace" :
    sp?.tab === "leads" || typeof sp?.lead === "string" ? "leads" :
    undefined;
  return (
    <DashboardRouter
      billingReturn={billingReturn}
      reference={billingReturn ? (sp.reference as string) : undefined}
      initialSellerTab={initialSellerTab}
    />
  );
}
