/**
 * Category photography for the /services grid.
 *
 * KEYED BY CATEGORY SLUG (the `slug` field in ./categories), never by the
 * display name — the two differ ("Builder" → `construction`, "Tyre Shop" →
 * `tyres`, "HR Service" → `hr-services`), so a name key would silently fall
 * through to the placeholder and the card would look unstyled.
 *
 * SIZING: these are hand-picked full-resolution Pexels originals of 2–4 MB
 * each. Served raw, 37 of them would be ~100 MB. Pexels' CDN crops and
 * recompresses on request, so every URL carries
 * `w=640&h=240&fit=crop&dpr=2` — a ~3.3:1 banner matching the `h-28` strip on
 * the card, at roughly 130 KB and still sharp on a 2× display.
 *
 * `mobile-development` is the one PNG; without `fm=jpg` the JPEG params are
 * ignored and it ships at 2 MB, so that URL forces the format.
 *
 * The iStock URLs already embed their own size (`s=612x612`) and arrive at
 * 30–55 KB, so they are used exactly as supplied.
 *
 * Any category missing from this map falls back to `getBgUrl` in the caller,
 * so adding a category later degrades gracefully instead of rendering a blank
 * tile.
 */

/** One shared set of crop params so every Pexels entry is identical. */
const P = "?auto=compress&cs=tinysrgb&w=640&h=240&fit=crop&dpr=2";
const pexels = (file: string) => `https://images.pexels.com/photos/${file}${P}`;

export const CATEGORY_IMAGES: Record<string, string> = {
  // ── Home services ────────────────────────────────────────────────────────
  plumbers: pexels("14953886/pexels-photo-14953886.jpeg"),
  electricians: pexels("27928762/pexels-photo-27928762.jpeg"),
  "cleaning-services": pexels("6195895/pexels-photo-6195895.jpeg"),
  painting: pexels("36153946/pexels-photo-36153946.jpeg"),
  construction: pexels("8961555/pexels-photo-8961555.jpeg"),
  gardening: pexels("26614518/pexels-photo-26614518.jpeg"),
  security:
    "https://media.istockphoto.com/id/2283997362/photo/technician-installing-home-security-alarm-system-on-wall-indoors.jpg?b=1&s=612x612&w=0&k=20&c=wieOhteTKnjztSBE7jbU5AZtPok7k_Xh7tjr7Zgit9A=",
  handyman: pexels("11398216/pexels-photo-11398216.jpeg"),

  // ── Technology ───────────────────────────────────────────────────────────
  "computer-repair": pexels("4705635/pexels-photo-4705635.jpeg"),
  "web-development": pexels("4974912/pexels-photo-4974912.jpeg"),
  // The lone PNG: `fm=jpg` is required, otherwise this ships at 2 MB.
  "mobile-development": `https://images.pexels.com/photos/20694602/pexels-photo-20694602.png${P}&fm=jpg`,
  "software-development": pexels("374559/pexels-photo-374559.jpeg"),
  "graphic-design": pexels("4443151/pexels-photo-4443151.jpeg"),
  "it-support": pexels("16385070/pexels-photo-16385070.jpeg"),
  cybersecurity: pexels("3803517/pexels-photo-3803517.jpeg"),
  "digital-marketing": pexels("6476260/pexels-photo-6476260.jpeg"),

  // ── Education ────────────────────────────────────────────────────────────
  tutors: pexels("6238038/pexels-photo-6238038.jpeg"),
  "driving-schools":
    "https://media.istockphoto.com/id/2190808101/photo/young-driver-holding-learner-plate-out-of-car-window.jpg?b=1&s=612x612&w=0&k=20&c=vL4XviCAmaS5WE01hoYxAEO1ePnyhkLV0Q2D20TyKAs=",
  "music-teachers": pexels("8520497/pexels-photo-8520497.jpeg"),
  "language-teachers": pexels("5428012/pexels-photo-5428012.jpeg"),
  training: pexels("7793932/pexels-photo-7793932.jpeg"),

  // ── Beauty & wellness ────────────────────────────────────────────────────
  "beauty-salons": pexels("2775272/pexels-photo-2775272.jpeg"),

  // ── Automotive ───────────────────────────────────────────────────────────
  mechanics: pexels("8985451/pexels-photo-8985451.jpeg"),
  "car-wash": pexels("30589155/pexels-photo-30589155.jpeg"),
  "panel-beaters": pexels("35149611/pexels-photo-35149611.jpeg"),
  tyres:
    "https://media.istockphoto.com/id/827583206/photo/wheel-alignment.jpg?b=1&s=612x612&w=0&k=20&c=1JDcO57VD9DZyeM3ben9ZfNhWesG4XSwJQQT7ORgGEQ=",
  "auto-electrical": pexels("5572260/pexels-photo-5572260.jpeg"),
  "vehicle-repairs": pexels("6870328/pexels-photo-6870328.jpeg"),

  // ── Professional services ────────────────────────────────────────────────
  lawyers: pexels("5668806/pexels-photo-5668806.jpeg"),
  accountants: pexels("5816291/pexels-photo-5816291.jpeg"),
  consultants: pexels("6285149/pexels-photo-6285149.jpeg"),
  "hr-services": pexels("8730277/pexels-photo-8730277.jpeg"),
  "financial-services":
    "https://media.istockphoto.com/id/1193080124/photo/withdrawal-south-african-rand-from-atm.jpg?b=1&s=612x612&w=0&k=20&c=9m1wslOYm0co9li5N7-54y_y_M44OdhKI5EAGlh199Y=",
  "business-services": pexels("7689745/pexels-photo-7689745.jpeg"),

  // ── Health & lifestyle ───────────────────────────────────────────────────
  restaurants: pexels("36786303/pexels-photo-36786303.jpeg"),
  "doctors-dentists": pexels("5622242/pexels-photo-5622242.jpeg"),
  hotels: pexels("9462745/pexels-photo-9462745.jpeg"),
};

/** The photo for a category, or null when it has none (caller falls back). */
export function categoryImage(slug: string): string | null {
  return CATEGORY_IMAGES[slug] ?? null;
}
