"use client";
import { use, useState } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { calculators } from "@/data/content";

export default function ToolPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const meta = calculators.find((c) => c.slug === slug);
  const [a, setA] = useState("1500000");
  const [b, setB] = useState("10.75");
  const [c, setC] = useState("20");
  // Real 404 rather than a 200 page that just says "Tool not found." — a 200
  // soft-404 gets indexed as a thin page and competes with the four real tools.
  if (!meta) notFound();
  const principal = parseFloat(a || "0");
  const rate = parseFloat(b || "0") / 100 / 12;
  const n = parseFloat(c || "0") * 12;
  const pay = rate > 0 ? (principal * rate * Math.pow(1 + rate, n)) / (Math.pow(1 + rate, n) - 1) : principal / (n || 1);
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <nav className="text-xs text-[#1d3a5f]/60 flex flex-wrap gap-1">
        <Link href="/" className="hover:underline">Home</Link> <span>/</span>
        <Link href="/tools" className="hover:underline">Tools</Link> <span>/</span>
        <span className="font-bold text-[#10243e]">{meta.name}</span>
      </nav>
      <h1 className="text-3xl font-black text-[#10243e] tracking-tight mt-3">{meta.name}</h1>
      <p className="text-[#1d3a5f]/70 mt-2">{meta.desc}</p>
      <div className="mt-6 hippo-card p-5 grid sm:grid-cols-3 gap-4">
        <label className="text-sm font-bold text-[#10243e]">Loan amount (R)<input value={a} onChange={(e) => setA(e.target.value)} inputMode="decimal" className="mt-1 w-full rounded-xl border-2 border-[#e7eef5] focus:border-[#7ac142] px-3 py-2 text-sm font-normal bg-[#f2f6fa]/40 outline-none" /></label>
        <label className="text-sm font-bold text-[#10243e]">Rate %<input value={b} onChange={(e) => setB(e.target.value)} inputMode="decimal" className="mt-1 w-full rounded-xl border-2 border-[#e7eef5] focus:border-[#7ac142] px-3 py-2 text-sm font-normal bg-[#f2f6fa]/40 outline-none" /></label>
        <label className="text-sm font-bold text-[#10243e]">Years<input value={c} onChange={(e) => setC(e.target.value)} inputMode="decimal" className="mt-1 w-full rounded-xl border-2 border-[#e7eef5] focus:border-[#7ac142] px-3 py-2 text-sm font-normal bg-[#f2f6fa]/40 outline-none" /></label>
      </div>
      <div className="mt-4 hippo-hero rounded-3xl text-white p-6 anim-rise">
        <p className="text-sm text-white/70">Estimated monthly repayment</p>
        <p className="text-4xl font-black">R {isFinite(pay) ? pay.toLocaleString("en-ZA", { maximumFractionDigits: 0 }) : "—"}</p>
        <p className="text-xs text-white/60 mt-2">Indicative only. Confirm with your bank.</p>
      </div>
    </div>
  );
}
