import AnalyticsAdmin from "@/components/admin/AnalyticsAdmin";

export default function AdminAnalyticsPage() {
  return (
    <main className="mx-auto min-h-screen max-w-6xl space-y-5 px-4 py-8">
      <header>
        <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#558c2b]">Admin console</p>
        <h1 className="mt-1 text-2xl font-black text-[#10243e] sm:text-3xl">Marketplace analytics</h1>
      </header>
      <AnalyticsAdmin />
    </main>
  );
}
