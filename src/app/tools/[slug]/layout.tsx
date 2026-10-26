import type { Metadata } from "next";
import { calculators } from "@/data/content";
import { pageMeta } from "@/lib/seo";

/**
 * The calculator itself is a client component (it recalculates as you type), so
 * the metadata lives here and stays indexable: each tool is a standalone page
 * people search for ("bond calculator South Africa").
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const meta = calculators.find((c) => c.slug === slug);
  if (!meta) return { title: "Tool not found", robots: { index: false, follow: true } };
  return pageMeta({
    title: `${meta.name} — free ${meta.name.toLowerCase()} online`,
    description: `${meta.desc} Free to use, no sign-up, works on any phone — then compare local pros who can help you act on the result.`,
    path: `/tools/${slug}`,
    keywords: [meta.name.toLowerCase(), `${meta.name.toLowerCase()} South Africa`, "free online calculator"],
  });
}

export default function ToolLayout({ children }: { children: React.ReactNode }) {
  return children;
}
