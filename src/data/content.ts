import { SITE_SHORT } from "@/lib/site";
export type Job = { id: string; title: string; company: string; suburb: string; type: string; pay: string; posted: string };
export type EventItem = { id: string; title: string; venue: string; suburb: string; date: string; fee: string };
export type Deal = { id: string; title: string; business: string; suburb: string; detail: string };
export type ArticleSection = { heading: string; paragraphs: string[]; bullets?: string[] };
export type Article = {
  slug: string;
  title: string;
  excerpt: string;
  suburb: string;
  readTime: string;
  sections: ArticleSection[];
};

// Seed/demo rows for /admin/seed. Province-level rather than a single metro:
// this is demo content, and a seller looking at the sample data should see that
// the platform spans the country, not that it is Pretoria-only.
export const jobs: Job[] = [
  { id: "j1", title: "Junior Bookkeeper", company: "Mamelodi Accounting Hub", suburb: "Gauteng", type: "Full-time", pay: "R12k–R16k", posted: "2d ago" },
  { id: "j2", title: "Delivery Drivers (x4)", company: "Green Point Eats", suburb: "Western Cape", type: "Part-time", pay: "R45/order + tips", posted: "5h ago" },
  { id: "j3", title: "Apprentice Plumber", company: "Northside Plumbing", suburb: "KwaZulu-Natal", type: "Apprenticeship", pay: "Stipend", posted: "1d ago" },
];

export const events: EventItem[] = [
  { id: "e1", title: "Gauteng Night Market", venue: "Bougainvillea Mall Parking", suburb: "Gauteng", date: "Sat 14:00–22:00", fee: "Free entry" },
  { id: "e2", title: "Amapiano vs Gqom — Durban Rooftop", venue: "Moses Mabhida Roof", suburb: "KwaZulu-Natal", date: "Fri 19:00–late", fee: "R150" },
  { id: "e3", title: "Table Mountain Parkrun + Coffee", venue: "Green Point Common", suburb: "Western Cape", date: "Sat 08:00", fee: "Free" },
];

export const deals: Deal[] = [
  { id: "d1", title: "Free diagnostics with any major service", business: "Polokwane Auto Clinic", suburb: "Limpopo", detail: `Mention ${SITE_SHORT}. Valid to end of month.` },
  { id: "d2", title: "Student kota + drink R75", business: "Bloemfontein Kota Joint", suburb: "Free State", detail: "Show student card, weekdays 11–15h." },
];

export const articles: Article[] = [
  {
    slug: "best-plumbers-pretoria-north",
    title: "Hiring a Plumber in Pretoria North: Quotes, Scope & Questions",
    excerpt: "A practical checklist for describing plumbing work, comparing written quotes and agreeing the job before it starts.",
    suburb: "Pretoria North",
    readTime: "5 min",
    sections: [
      {
        heading: "Describe the problem clearly",
        paragraphs: [
          "Tell the plumber what is happening, where it is happening and when you first noticed it. For a leak or damaged fitting, a clear photo can help a business understand the job before arranging a visit.",
          "If water is causing damage, use the property's shut-off valve only if you can reach it safely. Keep away from water near electrical equipment and contact the appropriate emergency service if anyone may be in danger.",
        ],
      },
      {
        heading: "Compare quotes on the same scope",
        paragraphs: ["Ask each business to state what its price covers. A low headline price is difficult to compare if call-out fees, materials or follow-up work are treated differently."],
        bullets: [
          "Labour, materials and any call-out or inspection fee",
          "What is excluded and how unexpected work will be approved",
          "The expected start date, duration and payment schedule",
          "Whether the amount includes VAT, if applicable",
        ],
      },
      {
        heading: "Check the business and confirm the agreement",
        paragraphs: [
          "Review the provider's profile, service area and available customer feedback. Ask about relevant qualifications, registrations or insurance where appropriate for the work, and verify any claims that matter to you.",
          "Before work begins, keep the agreed scope and price in writing. Do not approve extra work until the provider has explained the additional cost and you have agreed to it.",
        ],
      },
    ],
  },
  {
    slug: "things-to-do-pretoria-weekend",
    title: "Planning a Weekend in Pretoria: A Practical Local Checklist",
    excerpt: "Choose activities that fit your group, check current opening details and plan transport before you set out.",
    suburb: "Pretoria",
    readTime: "4 min",
    sections: [
      {
        heading: "Choose the kind of day you want",
        paragraphs: [
          "Start with the group and the time available. A relaxed day might include a park or garden; a culture-focused outing could centre on a museum or public attraction; a social plan may work better around a market or a meal.",
          "Browse the current places directory for ideas, then confirm the details directly with the venue. Listings and opening arrangements can change.",
        ],
      },
      {
        heading: "Check the details before leaving",
        paragraphs: [],
        bullets: [
          "Opening hours, booking requirements and any entry fee",
          "Weather, walking distance and accessibility for everyone in your group",
          "Parking or public transport options and the return trip",
          "Whether food, water or other supplies are available on site",
        ],
      },
      {
        heading: "Keep a flexible backup plan",
        paragraphs: [
          "Have an indoor or nearby alternative in case the weather changes, a venue is busy or plans run late. If you are visiting a public space, follow posted rules and leave the area as you found it.",
          "For current event times or prices, use the organiser's latest announcement rather than relying on an old listing.",
        ],
      },
    ],
  },
  {
    slug: "car-service-cost-centurion",
    title: "Comparing Car Service Quotes in Centurion: What to Check",
    excerpt: "Service prices depend on the vehicle and work required. Use this checklist to compare like-for-like written estimates.",
    suburb: "Centurion",
    readTime: "4 min",
    sections: [
      {
        heading: "Why estimates differ",
        paragraphs: [
          "The service schedule, vehicle make and model, age, mileage, parts selected and work found during an inspection can all affect the final price. A quote for one vehicle or service level is not a reliable benchmark for another.",
          "When requesting an estimate, provide the make, model, year and approximate mileage. Describe warning lights or symptoms, but do not attempt repairs that could be unsafe.",
        ],
      },
      {
        heading: "Compare the written estimates",
        paragraphs: [],
        bullets: [
          "The service items and checks included",
          "Parts brand or specification, labour and diagnostic charges",
          "VAT treatment, additional fees and excluded work",
          "Estimated completion time and the process for approving extra repairs",
        ],
      },
      {
        heading: "Approve extra work deliberately",
        paragraphs: [
          "Ask the workshop to contact you with an explanation and revised amount before doing work outside the agreed service. Keep the estimate, approvals and final itemised invoice together.",
          "A clear explanation and a written scope make it easier to compare providers than choosing on price alone. Check the workshop's profile and ask any questions you need answered before booking.",
        ],
      },
    ],
  },
];

export const calculators = [
  { slug: "bond", name: "Bond Repayment Calculator", desc: "Estimate monthly repayments for Pretoria property prices." },
  { slug: "fuel", name: "Fuel Cost Calculator", desc: "Pretoria → Joburg commute cost at current fuel prices." },
  { slug: "solar", name: "Solar Payback Calculator", desc: "Inverter + battery vs Eskom — months to break even." },
  { slug: "salary", name: "Take-Home Salary (PAYE)", desc: "SA tax brackets, UIF & medical credits explained." },
];

export const emergencyContacts = [
  { name: "Netcare 911", number: "082 911", note: "Medical emergency" },
  { name: "ER24", number: "084 124", note: "Medical emergency" },
  { name: "SAPS Flying Squad (Pretoria)", number: "10111", note: "Crime in progress" },
  { name: "City of Tshwane Power Failures", number: "012 427 0111", note: "Outages & faults" },
  { name: "Tshwane Water Leaks", number: "012 358 2111", note: "Burst pipes / no water" },
];
