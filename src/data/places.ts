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

// Keep the curated catalogue empty until its entries are verified and sourced.
export const places: Place[] = [];

export const getPlace = (slug: string) => places.find((place) => place.slug === slug);
export const getPlaceKind = (kind: PlaceKind) => PLACE_KINDS.find((placeKind) => placeKind.id === kind);
export const placesForKind = (kind: PlaceKind) => places.filter((place) => place.kind === kind);
export const placesForSuburb = (suburbSlug: string) => places.filter((place) => place.suburbSlug === suburbSlug);
export const placesForCity = (citySlug: string) => places.filter((place) => place.citySlug === citySlug);
