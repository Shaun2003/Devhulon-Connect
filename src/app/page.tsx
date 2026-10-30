import Link from "next/link";
import SearchBar, { QuickServiceChips } from "@/components/SearchBar";
import HomeFeeds from "@/components/HomeFeeds";
import { SectionTitle, AdSlot, TrustBar, HowItWorks } from "@/components/ui";
import { PartnerStrip, Faq, CtaBand } from "@/components/hippo";
import { zaProvinces, zaCitiesForProvince } from "@/data/za-locations";
import { categories } from "@/data/categories";
import HomeServiceGroups from "@/components/HomeServiceGroups";
import { KIcon } from "@/lib/icons";
import { getBgUrl } from "@/lib/utils";
import { pageMeta } from "@/lib/seo";
import { SITE_SHORT } from "@/lib/site";

export const metadata = pageMeta({
  title: `${SITE_SHORT} — Connecting buyers with services and service providers`,
  description:
    `${SITE_SHORT} helps people and businesses discover services and connect with participating service providers.`,
  path: "/",
  keywords: [
    "compare local businesses South Africa",
    "vetted plumbers Gauteng",
    "electricians Western Cape",
    "local services near me",
    "free quotes South Africa",
  ],
});

/**
 * Photography for the "Browse by area" province tiles — HOME PAGE ONLY.
 *
 * Keyed by the province `slug` from `zaProvinces` in @/data/za-locations, NOT by
 * display name. Two of these differ from how the name reads: "North West" →
 * `north-west` and "KwaZulu-Natal" → `kwa-zulu-natal`. Note that
 * `locations.ts` uses a DIFFERENT slug for the same province (`kzn`), so this
 * must be keyed to `za-locations` — the dataset the section actually renders.
 *
 * The same Pexels crop params as the category cards, because the province tiles
 * use the identical `h-28` banner strip: `w=640&h=240&fit=crop&dpr=2`.
 * The two iStock URLs embed their own `s=612x612` sizing already.
 *
 * Falls back to `getBgUrl` for any province added later.
 */
const HOME_PROVINCE_IMAGES: Record<string, string> = {
  gauteng:
    "https://images.pexels.com/photos/33702880/pexels-photo-33702880.jpeg?auto=compress&cs=tinysrgb&w=640&h=240&fit=crop&dpr=2",
  "western-cape":
    "https://images.pexels.com/photos/38193999/pexels-photo-38193999.jpeg?auto=compress&cs=tinysrgb&w=640&h=240&fit=crop&dpr=2",
  "kwa-zulu-natal":
    "https://images.pexels.com/photos/3814231/pexels-photo-3814231.jpeg?auto=compress&cs=tinysrgb&w=640&h=240&fit=crop&dpr=2",
  "eastern-cape":
    "https://images.pexels.com/photos/36651195/pexels-photo-36651195.jpeg?auto=compress&cs=tinysrgb&w=640&h=240&fit=crop&dpr=2",
  "free-state":
    "https://images.pexels.com/photos/34005404/pexels-photo-34005404.jpeg?auto=compress&cs=tinysrgb&w=640&h=240&fit=crop&dpr=2",
  limpopo:
    "https://images.pexels.com/photos/34183353/pexels-photo-34183353.jpeg?auto=compress&cs=tinysrgb&w=640&h=240&fit=crop&dpr=2",
  mpumalanga:
    "https://images.pexels.com/photos/38799930/pexels-photo-38799930.jpeg?auto=compress&cs=tinysrgb&w=640&h=240&fit=crop&dpr=2",
  "north-west":
    "https://media.istockphoto.com/id/2242334920/photo/klerksdorp-matlosana-town-hall.jpg?b=1&s=612x612&w=0&k=20&c=GyRFsQlXQpyEo5LhjFQpUbNFK7OwRf3IChpz21CeTKk=",
  "northern-cape":
    "https://media.istockphoto.com/id/2242764029/photo/kimberley-city-hall.jpg?b=1&s=612x612&w=0&k=20&c=3hxFG2_GLi6SP-XucFzhEcllWfyNv805JHHO5AnUBF8=",
};

export default function Home() {
  const topFaqs = categories.flatMap((c) => c.faqs.map((f) => ({ ...f, tag: c.plural }))).slice(0, 5);
  return (
    <div>
      <section className="bg-[#0b1e33] py-20 sm:py-28 text-center px-4 relative flex flex-col justify-center min-h-[460px]">
        <div
          className="absolute top-0 left-0 w-full h-full bg-cover bg-center z-0"
          style={{ backgroundImage: "url('https://images.unsplash.com/photo-1522202176988-66273c2fd55f?ixlib=rb-4.0.3&auto=format&fit=crop&w=2000&q=80')" }}
        />
        <div className="absolute top-0 left-0 w-full h-full bg-[#10243e]/85 z-0 pointer-events-none" />
        <div className="max-w-4xl mx-auto relative z-10 w-full">
          <h1 className="text-4xl sm:text-6xl md:text-7xl font-black tracking-tight text-white leading-tight drop-shadow-xl">
            Find a pro near you — <span className="text-[#7ac142]">fast</span>.
          </h1>
          <p className="mt-5 max-w-2xl mx-auto text-white/90 text-lg sm:text-xl drop-shadow-md">
            Tell us what you need and where. Compare responses from relevant local businesses.
          </p>
          <div className="mt-10 flex justify-center">
            <SearchBar citySlug="all" />
          </div>
          <div className="mt-7">
            <QuickServiceChips />
          </div>
        </div>
      </section>

      <div className="max-w-6xl mx-auto px-4 mt-8 relative z-10">
        <PartnerStrip />
      </div>

      <div className="max-w-6xl mx-auto px-4 py-12 space-y-16">
        <TrustBar />
        <HomeFeeds />
        <section>
          <SectionTitle
            kicker="Explore Services"
            title="What do you need help with?"
            sub="Browse local professionals, compare their services, and request quotes when you find a good fit."
          />
          <HomeServiceGroups />
          <div className="mt-8 text-center">
            <Link href="/services" className="inline-block border-2 border-[#10243e] text-[#10243e] font-bold py-3 px-8 rounded-full hover:bg-[#10243e] hover:text-white transition-colors">View all services</Link>
          </div>
        </section>

        <section>
          <SectionTitle
            kicker="Browse by area"
            title="Top Areas"
            sub="Find professionals in the most searched areas across South Africa."
          />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 items-stretch">
            {zaProvinces.map((p) => {
              // Hand-picked province photography (see HOME_PROVINCE_IMAGES),
              // falling back to getBgUrl so a newly added province still
              // renders a card rather than an empty banner.
              const bgUrl = HOME_PROVINCE_IMAGES[p.slug] ?? getBgUrl(p.slug);
              const cityCount = zaCitiesForProvince(p.slug).length;
              return (
                // Provinces have no hub page of their own — only the launch
                // metros do — so each tile hands the visitor to the national
                // matching flow pre-filled with the province name. That is a
                // working destination for all nine rather than a dead link to a
                // route that only exists for three of them.
                <Link
                  key={p.slug}
                  href={`/find-pro?place=${encodeURIComponent(p.name)}`}
                  className="bg-white border border-[#e7eef5] rounded-xl overflow-hidden hover:border-[#7ac142] group transition-all flex flex-col items-start justify-between shadow-sm hover:shadow-md h-full"
                >
                  <div className="h-28 w-full bg-[#f4f7f6] relative overflow-hidden shrink-0">
                    <div
                      className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-105"
                      style={{ backgroundImage: `url('${bgUrl}')` }}
                    />
                    <div className="absolute inset-0 bg-[#0b1e33]/10 group-hover:bg-transparent transition-colors duration-300"></div>
                  </div>
                  <div className="p-4 w-full flex items-center justify-between gap-2 bg-white z-10">
                    <div className="min-w-0">
                      <p className="font-bold text-[#10243e] text-[15px] leading-tight">{p.name}</p>
                      <p className="text-[11px] text-[#1d3a5f]/55 font-semibold">
                        {cityCount} {cityCount === 1 ? "city" : "cities"}
                      </p>
                    </div>
                    <span className="text-[#e7eef5] group-hover:text-[#558c2b] transition-colors flex items-center shrink-0">
                      
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        <section>
          <SectionTitle kicker="How it works" title="Sorted in 60 seconds" />
          <HowItWorks />
        </section>

        <section className="bg-[#0b1e33] rounded-3xl p-8 sm:p-12 text-white overflow-hidden relative">
          <div className="relative z-10 flex flex-col md:flex-row items-center gap-8 text-center md:text-left">
            <div className="flex-1">
              <h2 className="text-3xl sm:text-4xl font-black tracking-tight mb-4">Are you a professional?</h2>
              <p className="text-white/80 text-lg mb-8 max-w-xl">
                Join {SITE_SHORT} to connect with customers looking for your services. Sign up as a seller to unlock your professional dashboard.
              </p>
              <Link href="/list-business" className="inline-block bg-[#7ac142] text-[#0b1e33] font-bold py-3 px-8 rounded-full hover:bg-[#8fd158] transition-colors shadow-lg">List your business</Link>
            </div>
            <div className="hidden md:block w-32 h-32 rounded-full shrink-0 flex items-center justify-center">
              <div className="icon-3d icon-3d-xl"><KIcon name="briefcase" size={48} strokeWidth={2.2} /></div>
            </div>
          </div>
        </section>
        
        <section>
          <SectionTitle kicker="Good to know" title="Frequently asked questions" />
          <Faq
            items={topFaqs.map((f) => ({
              q: f.q,
              a: f.a,
            }))}
          />
        </section>

        <CtaBand />
        <AdSlot />
      </div>
    </div>
  );
}