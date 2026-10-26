export type Province = { slug: string; name: string };
export type City = { slug: string; name: string; provinceSlug: string; tagline: string };
export type Suburb = {
  slug: string; name: string; citySlug: string; blurb: string; lat: number; lng: number;
};

export const provinces: Province[] = [
  { slug: "gauteng", name: "Gauteng" },
  { slug: "western-cape", name: "Western Cape" },
  { slug: "kzn", name: "KwaZulu-Natal" },
];

/**
 * Cities we live in. Launch focus is Gauteng; others show "coming soon".
 *
 * SEO hub pages (`/{city}`) are generated from this list, so only cities that
 * have real suburb coverage are added here. Sellers can list in ANYWHERE in
 * South Africa via `@/data/za-locations` — that is a separate, much larger
 * dataset that powers the seller form and pro matching without generating
 * (mostly empty) hub pages for the whole country.
 */
export const cities: City[] = [
  { slug: "pretoria", name: "Pretoria", provinceSlug: "gauteng", tagline: "Mamelodi to Montana — find trusted local pros, eats, jobs & events." },
  { slug: "johannesburg", name: "Johannesburg", provinceSlug: "gauteng", tagline: "Sandton to Soweto — compare trusted locals across the City of Gold." },
  { slug: "ekurhuleni", name: "Ekurhuleni", provinceSlug: "gauteng", tagline: "Kempton Park, Boksburg, Benoni — East Rand locals, compared side-by-side." },
  { slug: "cape-town", name: "Cape Town", provinceSlug: "western-cape", tagline: "Coming soon." },
  { slug: "durban", name: "Durban", provinceSlug: "kzn", tagline: "Coming soon." },
];

export const suburbs: Suburb[] = [
  // ── City of Tshwane (Pretoria) ──────────────────────────────────────────
  { slug: "pretoria-north", name: "Pretoria North", citySlug: "pretoria", blurb: "Residential hub north of the Magaliesberg — strong demand for plumbers, electricians and car repair.", lat: -25.669, lng: 28.173 },
  { slug: "pretoria-cbd", name: "Pretoria CBD", citySlug: "pretoria", blurb: "Government + retail core around Church Street. Printing, repairs, lunch spots and professional services.", lat: -25.747, lng: 28.187 },
  { slug: "centurion", name: "Centurion", citySlug: "pretoria", blurb: "Booming corridor between Pretoria & Joburg — estates, offices and family restaurants.", lat: -25.86, lng: 28.189 },
  { slug: "menlyn", name: "Menlyn", citySlug: "pretoria", blurb: "Menlyn Maine + Menlo Park — shopping, gyms and upmarket eats.", lat: -25.782, lng: 28.276 },
  { slug: "hatfield", name: "Hatfield", citySlug: "pretoria", blurb: "Student capital (UP/Tuks) — affordable eats, printing, accommodation and nightlife.", lat: -25.747, lng: 28.238 },
  { slug: "sunnyside", name: "Sunnyside", citySlug: "pretoria", blurb: "Dense apartment node — salons, takeaways and essential services.", lat: -25.757, lng: 28.206 },
  { slug: "montana", name: "Montana", citySlug: "pretoria", blurb: "Family suburbs around Zambezi — schools, retail parks and home services.", lat: -25.681, lng: 28.24 },
  { slug: "akasia", name: "Akasia", citySlug: "pretoria", blurb: "North-west industrial + residential mix — mechanics, spares and logistics.", lat: -25.669, lng: 28.093 },
  { slug: "waterkloof", name: "Waterkloof", citySlug: "pretoria", blurb: "Leafy southern suburbs — private schools, clinics, garden services and home services.", lat: -25.776, lng: 28.227 },
  { slug: "brooklyn", name: "Brooklyn", citySlug: "pretoria", blurb: "Upmarket hub near the Union Buildings — restaurants, coffee and professional services.", lat: -25.758, lng: 28.229 },
  { slug: "mamelodi", name: "Mamelodi", citySlug: "pretoria", blurb: "Historic township east of Pretoria — spaza, salons, mechanics and community events.", lat: -25.704, lng: 28.4 },
  { slug: "soshanguve", name: "Soshanguve", citySlug: "pretoria", blurb: "Northern township with a buzzing informal economy — food, hair and car services.", lat: -25.532, lng: 28.1 },
// ── City of Johannesburg ─────────────────────────────────────────────────
  { slug: "sandton", name: "Sandton", citySlug: "johannesburg", blurb: "Africa's richest square mile — offices, malls, movers, cleaners and tech services.", lat: -26.108, lng: 28.054 },
  { slug: "johannesburg-cbd", name: "Johannesburg CBD", citySlug: "johannesburg", blurb: "Financial + transport core — accountants, printers, eateries and essential services.", lat: -26.204, lng: 28.047 },
  { slug: "soweto", name: "Soweto", citySlug: "johannesburg", blurb: "The people's city — shisanyama, salons, tutors, events and home services.", lat: -26.248, lng: 27.854 },
  { slug: "randburg", name: "Randburg", citySlug: "johannesburg", blurb: "Family-friendly north-west — workshops, gyms, schools and home repairs.", lat: -26.093, lng: 28.0 },
  { slug: "roodepoort", name: "Roodepoort", citySlug: "johannesburg", blurb: "West Rand suburb belt — plumbers, electricians and family restaurants.", lat: -26.162, lng: 27.872 },
  { slug: "midrand", name: "Midrand", citySlug: "johannesburg", blurb: "Between JHB and Tshwane — estates, movers, security and corporate services.", lat: -25.99, lng: 28.128 },
  { slug: "lenasia", name: "Lenasia", citySlug: "johannesburg", blurb: "South of Soweto — family homes, mechanics, tailors and takeaways.", lat: -26.317, lng: 27.828 },
  { slug: "alexandra", name: "Alexandra", citySlug: "johannesburg", blurb: "Dense township next to Sandton — barbers, salons, spazas and community services.", lat: -26.103, lng: 28.096 },

  // ── City of Ekurhuleni (East Rand) ──────────────────────────────────────
  { slug: "kempton-park", name: "Kempton Park", citySlug: "ekurhuleni", blurb: "OR Tambo airport city — logistics, mechanics, hotels and corporate services.", lat: -26.105, lng: 28.233 },
  { slug: "boksburg", name: "Boksburg", citySlug: "ekurhuleni", blurb: "Old East Rand gold town — workshops, spares and family business.", lat: -26.212, lng: 28.26 },
  { slug: "benoni", name: "Benoni", citySlug: "ekurhuleni", blurb: "Lake-side town with strong automotive + hospitality sector.", lat: -26.188, lng: 28.321 },
  { slug: "brakpan", name: "Brakpan", citySlug: "ekurhuleni", blurb: "Affordable East Rand suburb — home services and local eats.", lat: -26.236, lng: 28.373 },
];

export const getCity = (slug: string) => cities.find((c) => c.slug === slug);
export const getSuburb = (citySlug: string, suburbSlug: string) =>
  suburbs.find((s) => s.citySlug === citySlug && s.slug === suburbSlug);
export const suburbsForCity = (citySlug: string) => suburbs.filter((s) => s.citySlug === citySlug);
export const citiesForProvince = (provinceSlug: string) => cities.filter((c) => c.provinceSlug === provinceSlug);
