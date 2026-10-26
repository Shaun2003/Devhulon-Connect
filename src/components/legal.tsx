import Link from "next/link";
import type { ReactNode } from "react";

import {
  FileText,
  ShieldCheck,
  Users,
  CreditCard,
  Scale,
} from "lucide-react";

/** Shared layout for legal/trust documents (privacy, terms, cookies, about, contact). */
export type LegalIcon = typeof FileText;
export { CreditCard, Scale, ShieldCheck, Users };

export function DocHeader({
  kicker,
  title,
  sub,
  updated,
}: {
  kicker: string;
  title: string;
  sub?: string;
  updated?: string;
  icon?: LegalIcon;
}) {
  return (
    <>
      <nav className="flex flex-wrap gap-1 text-xs text-[#1d3a5f]/60">
        <Link href="/" className="hover:underline">Home</Link> <span>/</span>
        <span className="font-bold text-[#10243e]">{title}</span>
      </nav>
      <header className="hippo-hero min-w-0 rounded-3xl p-5 text-white anim-rise sm:p-8">
        <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#ffc72c]">{kicker}</p>
        <h1 className="mt-2 break-words text-3xl font-black tracking-tight">{title}</h1>
        {sub && <p className="mt-3 max-w-2xl break-words text-sm text-white/75">{sub}</p>}
        {updated && <p className="mt-3 text-xs text-white/50">Last updated: {updated}</p>}
      </header>
    </>
  );
}

export function Doc({ children }: { children: ReactNode }) {
  return <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">{children}</div>;
}

export function DocBody({ children }: { children: ReactNode }) {
  return (
    <div className="hippo-card p-5 sm:p-7 text-sm leading-7 space-y-4 text-[#1d3a5f]/85 [&_h2]:text-base [&_h2]:font-black [&_h2]:text-[#10243e] [&_h2]:mt-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1 [&_a]:text-[#558c2b] [&_a]:font-semibold [&_a:hover]:underline">
      {children}
    </div>
  );
}
