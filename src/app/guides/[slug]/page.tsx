import { notFound } from "next/navigation";
import Link from "next/link";
import { articles } from "@/data/content";
import { AdSlot } from "@/components/ui";
import { CtaBand } from "@/components/hippo";
import SaveButton from "@/components/SaveButton";
import { pageMeta } from "@/lib/seo";

export function generateStaticParams() {
  return articles.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const a = articles.find((x) => x.slug === slug);
  if (!a) return { title: "Guide not found", robots: { index: false, follow: true } };
  return pageMeta({
    title: a.title,
    description: `${a.excerpt} A ${a.readTime} guide for ${a.suburb}.`,
    path: `/guides/${a.slug}`,
    type: "article",
    keywords: [a.suburb.toLowerCase(), a.title.split("—")[0].trim().toLowerCase(), "home service prices South Africa"],
  });
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const a = articles.find((x) => x.slug === slug);
  if (!a) notFound();
  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <nav className="text-xs text-[#1d3a5f]/60 flex flex-wrap gap-1">
        <Link href="/" className="hover:underline">Home</Link> <span>/</span>
        <Link href="/guides" className="hover:underline">Guides</Link> <span>/</span>
        <span className="font-bold text-[#10243e]">{a.title}</span>
      </nav>
      <header className="hippo-hero min-w-0 rounded-3xl p-5 text-white anim-rise sm:p-8">
        <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#ffc72c]">{a.suburb} · {a.readTime} read</p>
        <h1 className="mt-2 break-words text-3xl font-black tracking-tight">{a.title}</h1>
        <p className="mt-3 break-words text-sm text-white/75">{a.excerpt}</p>
        <SaveButton className="mt-4" tone="onDark" type="guide" id={a.slug} title={a.title} suburb={a.suburb} slug={a.slug} />
      </header>
      <div className="hippo-card p-5 sm:p-7 text-sm leading-7 space-y-4 text-[#1d3a5f]/85">
        <p className="text-xs text-[#1d3a5f]/60">Practical information for {a.suburb}. Check current details with the relevant provider or venue before making arrangements.</p>
        {a.sections.map((section) => (
          <section key={section.heading} className="space-y-2">
            <h2 className="text-lg font-black text-[#10243e]">{section.heading}</h2>
            {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            {section.bullets && (
              <ul className="list-disc space-y-1 pl-5">
                {section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}
              </ul>
            )}
          </section>
        ))}
        <div className="rounded-2xl bg-[#f2f6fa] p-4">
          <p className="font-extrabold text-[#10243e]">Read next</p>
          <ul className="mt-2 space-y-1">
            {articles.filter((x) => x.slug !== a.slug).slice(0, 3).map((x) => (
              <li key={x.slug}><Link href={`/guides/${x.slug}`} className="text-[#558c2b] font-semibold hover:underline">{x.title}</Link></li>
            ))}
          </ul>
        </div>
      </div>
      <AdSlot />
      <CtaBand />
    </div>
  );
}
