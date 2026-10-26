import type { IconKey } from "@/lib/icons";
/**
 * Places (Tier 4) — public spaces, parks, malls, libraries, museums and
 * attractions. Deliberately separate from `businesses`: places are not
 * commercial listings, they are the "what can I do here?" layer of the platform.
 */
export type PlaceKind =
  | "park"
  | "shopping-centre"
  | "library"
  | "museum"
  | "attraction"
  | "sports"
  | "nature-reserve"
  | "public-facility";

export type Place = {
  slug: string;
  name: string;
  kind: PlaceKind;
  citySlug: string;
  suburbSlug: string;
  blurb: string;
  about: string[];
  address: string;
  hours: string;
  entryFee: string;
  bestFor: string[];
  lat: number;
  lng: number;
  /** Free-to-visit places (parks, libraries) vs paid attractions. */
  free: boolean;
};

export const PLACE_KINDS: { id: PlaceKind; name: string; plural: string; icon: IconKey }[] = [
  { id: "park", name: "Park", plural: "Parks & Gardens", icon: "flower" },
  { id: "shopping-centre", name: "Shopping Centre", plural: "Shopping Centres", icon: "tag" },
  { id: "library", name: "Library", plural: "Libraries", icon: "file" },
  { id: "museum", name: "Museum", plural: "Museums", icon: "landmark" },
  { id: "attraction", name: "Attraction", plural: "Attractions", icon: "sparkles" },
  { id: "sports", name: "Sports Facility", plural: "Sports & Recreation", icon: "dumbbell" },
  { id: "nature-reserve", name: "Nature Reserve", plural: "Nature Reserves", icon: "pawPrint" },
  { id: "public-facility", name: "Public Facility", plural: "Public Facilities", icon: "building" },
];

export const places: Place[] = [
  {
    slug: "national-zoological-gardens-pretoria",
    name: "National Zoological Gardens of South Africa",
    kind: "attraction",
    citySlug: "pretoria",
    suburbSlug: "pretoria-cbd",
    blurb: "The largest zoo in the country — 9 000+ animals and a cable car over the whole park.",
    about: [
      "Founded in 1899, the 'Pretoria Zoo' sits on 85 hectares along the Apies River in the heart of the city. It is one of only eight zoos in the world with national status.",
      "Allow at least three hours. The cable car runs to the top of the ridge and gives a full aerial view of the enclosures — worth it on hot Highveld days when walking is a slog.",
      "The aquarium and reptile park are on the same ticket. Weekdays are far quieter than weekends and public holidays.",
    ],
    address: "232 Boom Street, Pretoria CBD",
    hours: "Daily 08:30–17:30 (last entry 16:30)",
    entryFee: "Adults R120 · Children & pensioners R75 · Cable car extra",
    bestFor: ["Family day out", "School holidays", "Photography"],
    lat: -25.7437,
    lng: 28.1886,
    free: false,
  },
  {
    slug: "freedom-park-pretoria",
    name: "Freedom Park",
    kind: "museum",
    citySlug: "pretoria",
    suburbSlug: "waterkloof",
    blurb: "South Africa's national memorial — the Wall of Names, //hapo museum and a city-wide view.",
    about: [
      "Freedom Park sits on Salvokop ridge overlooking the Union Buildings. It honours those who died in the country's conflicts, from pre-colonial wars to the struggle against apartheid.",
      "The //hapo museum tells the South African story across seven epochs, and the Garden of Remembrance holds a flame and soil gathered from across the country.",
      "The view from the top of the ridge at sunset is one of the best in Pretoria.",
    ],
    address: "Salvokop, Tshwane",
    hours: "Mon–Fri 08:00–16:30 · Sat 08:00–13:00 · Closed Sundays",
    entryFee: "Free entry to the park · Guided tours from R100",
    bestFor: ["History", "Solo visiting", "Learning with kids"],
    lat: -25.7521,
    lng: 28.1845,
    free: true,
  },
  {
    slug: "union-buildings-pretoria",
    name: "Union Buildings & Gardens",
    kind: "public-facility",
    citySlug: "pretoria",
    suburbSlug: "pretoria-cbd",
    blurb: "The seat of government, the 9m Mandela statue and the terraced amphitheatre gardens.",
    about: [
      "Designed by Sir Herbert Baker and completed in 1913, the Union Buildings are the official seat of South Africa's national government.",
      "The terraced gardens are open to the public and manicured year-round. The 9-metre bronze statue of Nelson Mandela was unveiled in 2013.",
      "Great for a short walk, a picnic and photos of the city. Free to walk the gardens; the buildings themselves are not open for casual tours.",
    ],
    address: "Government Avenue, Pretoria",
    hours: "Gardens daily 06:00–18:00",
    entryFee: "Free",
    bestFor: ["Free outing", "Picnics", "Photos"],
    lat: -25.7412,
    lng: 28.2117,
    free: true,
  },
  {
    slug: "menlyn-park-mall",
    name: "Menlyn Park Shopping Centre",
    kind: "shopping-centre",
    citySlug: "pretoria",
    suburbSlug: "menlyn",
    blurb: "One of the largest malls in Africa — 500+ stores, cinemas, ice rink and a whole food wing.",
    about: [
      "Menlyn Park is the go-to for serious shopping in Pretoria East: major department stores, international brands, a big food court and the Park View wing.",
      "There is an ice rink on the upper level, a cinema complex, and undercover parking throughout. Expect crowds on Saturdays.",
      "If you're comparing quotes for a service, many mall-based businesses list on Devhulon Connect — check their hours before you drive out.",
    ],
    address: "Lois Avenue & Atterbury Road, Menlyn",
    hours: "Mon–Sat 09:00–21:00 · Sun 09:00–19:00",
    entryFee: "Free entry · Paid parking",
    bestFor: ["Shopping", "Rainy days", "Family"],
    lat: -25.7826,
    lng: 28.2784,
    free: true,
  },
  {
    slug: "pretoria-national-botanical-garden",
    name: "Pretoria National Botanical Garden",
    kind: "park",
    citySlug: "pretoria",
    suburbSlug: "menlyn",
    blurb: "76 hectares of indigenous Highveld bushveld, aloes and a medicinal plant garden.",
    about: [
      "Run by SANBI, this is one of South Africa's eleven national botanical gardens. The quartzite ridge supports the biggest collection of aloes in the country.",
      "The Medicinal Garden and Useful Plants Garden are excellent for a self-guided walk — everything is labelled with traditional uses.",
      "There is a tea garden, picnic lawns and a bird hide. Bring a hat; the ridge walk has very little shade.",
    ],
    address: "2 Cussonia Avenue, Brummeria, Pretoria",
    hours: "Daily 08:00–18:00",
    entryFee: "Adults R60 · Students R40 · Pensioners R30 · Children R25",
    bestFor: ["Walks", "Birding", "Picnics"],
    lat: -25.7398,
    lng: 28.2798,
    free: false,
  },
  {
    slug: "groenkloof-nature-reserve",
    name: "Groenkloof Nature Reserve",
    kind: "nature-reserve",
    citySlug: "pretoria",
    suburbSlug: "waterkloof",
    blurb: "Hiking, mountain biking and 4x4 trails — plus giraffe and zebra 15 minutes from the CBD.",
    about: [
      "Groenkloof is one of the oldest nature reserves in South Africa and the easiest bush escape from Pretoria's city centre.",
      "There are marked walking trails (2km–10km), a mountain-bike route and a 4x4 course. Wildlife includes giraffe, zebra, wildebeest and kudu.",
      "There's a picnic area near the entrance. Go early — the Highveld sun at midday is unforgiving and the walking trails have little shade.",
    ],
    address: "Christina de Wit Avenue, Groenkloof",
    hours: "Daily 05:30–19:00 (Oct–Mar) · 06:00–18:00 (Apr–Sep)",
    entryFee: "Adults R70 · Children R35 · Vehicle R50 · Mountain bike R45",
    bestFor: ["Hiking", "Mountain biking", "Early mornings"],
    lat: -25.7899,
    lng: 28.2015,
    free: false,
  },
  {
    slug: "centurion-lake",
    name: "Centurion Lake",
    kind: "park",
    citySlug: "pretoria",
    suburbSlug: "centurion",
    blurb: "The lakeside strip in the middle of Centurion — restaurants, walks and sunset views.",
    about: [
      "Centurion Lake is the artificial lake at the centre of the Centurion CBD, surrounded by hotels and restaurants on the water's edge.",
      "It's an easy, flat place to walk. The promenade and pedestrian bridge connect the business district with the residential side.",
      "Best combined with lunch or dinner at one of the lakeside spots. Not a swimming venue.",
    ],
    address: "Centurion Lake, Centurion CBD",
    hours: "Open access — daylight hours recommended",
    entryFee: "Free",
    bestFor: ["After-work walks", "Dinner views", "Quick outings"],
    lat: -25.8622,
    lng: 28.1894,
    free: true,
  },
  {
    slug: "hatfield-plaza",
    name: "Hatfield Plaza",
    kind: "shopping-centre",
    citySlug: "pretoria",
    suburbSlug: "hatfield",
    blurb: "The student-side centre opposite the University of Pretoria — printing, food and banking.",
    about: [
      "Hatfield Plaza is the practical shopping node for UP students and Hatfield residents: stationery, printing, groceries, banking and a food court.",
      "It's open late by suburban standards and a short walk from the Hatfield Gautrain station and the university campuses.",
      "Handy for daily essentials rather than big-ticket shopping — Menlyn is the destination mall for that.",
    ],
    address: "Grosvenor Street, Hatfield",
    hours: "Mon–Sat 08:00–19:00 · Sun 09:00–14:00",
    entryFee: "Free",
    bestFor: ["Daily essentials", "Students", "Banking"],
    lat: -25.7479,
    lng: 28.2376,
    free: true,
  },
];


export const getPlace = (slug: string) => places.find((p) => p.slug === slug);
export const getPlaceKind = (kind: PlaceKind) => PLACE_KINDS.find((k) => k.id === kind);
export const placesForKind = (kind: PlaceKind) => places.filter((p) => p.kind === kind);
export const placesForSuburb = (suburbSlug: string) => places.filter((p) => p.suburbSlug === suburbSlug);
export const placesForCity = (citySlug: string) => places.filter((p) => p.citySlug === citySlug);