import type { IconKey } from "@/lib/icons";

/**
 * Marketplace taxonomy (Â§6) â€” parent groups, per-category groups and
 * subcategories. Sits on top of the base `categories` table in
 * `./categories` (unchanged), so existing routes, sitemap and homepage
 * keep working. Admin CRUD plugs in here later.
 */

export type ServiceGroup = {
  slug: string;
  name: string;
  blurb: string;
  icon: IconKey;
};

export type Subcategory = { slug: string; name: string; blurb: string };

export const SERVICE_GROUPS: ServiceGroup[] = [
  { slug: "home-services", name: "Home Services", blurb: "Plumbers, electricians, cleaners, builders and every trade your home needs.", icon: "building" },
  { slug: "technology", name: "Technology", blurb: "Developers, designers, IT support and digital experts.", icon: "laptop" },
  { slug: "education", name: "Education", blurb: "Tutors, driving schools, music and language teachers.", icon: "graduationCap" },
  { slug: "beauty-wellness", name: "Beauty & Wellness", blurb: "Hair, barbers, nails, makeup, spa and wellness.", icon: "sparkles" },
  { slug: "automotive", name: "Automotive", blurb: "Mechanics, car wash, tyres, panel beaters and auto electrical.", icon: "carFront" },
  { slug: "professional-services", name: "Professional Services", blurb: "Lawyers, accountants, consultants, HR and finance.", icon: "briefcase" },
  { slug: "health-lifestyle", name: "Health & Lifestyle", blurb: "Doctors, dentists, restaurants and local lifestyle.", icon: "heartPulse" },
];

export function groupBySlug(slug: string): ServiceGroup | undefined {
  return SERVICE_GROUPS.find((g) => g.slug === slug);
}

/** Which service group each category belongs to. Used by the grouped picker. */
export const CATEGORY_GROUPS: Record<string, string> = {
  plumbers: "home-services", electricians: "home-services",
  "cleaning-services": "home-services", painting: "home-services",
  construction: "home-services", gardening: "home-services",
  security: "home-services", handyman: "home-services",
  "web-development": "technology", "mobile-development": "technology",
  "software-development": "technology", "graphic-design": "technology",
  "it-support": "technology", cybersecurity: "technology",
  "digital-marketing": "technology", "computer-repair": "technology",
  tutors: "education", "driving-schools": "education",
  "music-teachers": "education", "language-teachers": "education",
  training: "education", "beauty-salons": "beauty-wellness",
  mechanics: "automotive", "car-wash": "automotive",
  "panel-beaters": "automotive", tyres: "automotive",
  "auto-electrical": "automotive", "vehicle-repairs": "automotive",
  lawyers: "professional-services", accountants: "professional-services",
  consultants: "professional-services", "hr-services": "professional-services",
  "financial-services": "professional-services",
  "business-services": "professional-services",
  "doctors-dentists": "health-lifestyle", restaurants: "health-lifestyle",
  cake: "health-lifestyle", tailor: "health-lifestyle",
  laundry: "health-lifestyle", catering: "health-lifestyle",
  photography: "health-lifestyle", events: "health-lifestyle",
  "interior-design": "home-services", "appliance-repair": "home-services",
  "pest-control": "home-services", "pool-services": "home-services",
  removals: "home-services", "gates-garages": "home-services",
  locksmiths: "home-services", childcare: "education",
  gyms: "health-lifestyle", "pet-services": "health-lifestyle",
  "car-hire": "automotive", "estate-agents": "professional-services",
  "solar-installers": "home-services",
  "internet-services": "technology", printers: "technology",
  hotels: "health-lifestyle",
};

export function groupForCategory(categorySlug: string): ServiceGroup | undefined {
  const g = CATEGORY_GROUPS[categorySlug];
  return g ? groupBySlug(g) : undefined;
}

export const SUBCATEGORIES: Record<string, Subcategory[]> = {
  plumbers: [
    { slug: "leak-detection", name: "Leak Detection", blurb: "Find and fix hidden leaks fast." },
    { slug: "geysers", name: "Geysers", blurb: "Installs, repairs and burst geysers." },
    { slug: "blocked-drains", name: "Blocked Drains", blurb: "Unblocking and high-pressure cleaning." },
    { slug: "bathroom-plumbing", name: "Bathroom Plumbing", blurb: "Renovations, toilets, taps and showers." },
  ],
  electricians: [
    { slug: "fault-finding", name: "Fault Finding", blurb: "Tripping power and dead plugs traced." },
    { slug: "db-boards", name: "DB Boards", blurb: "Upgrades, rewiring and surge protection." },
    { slug: "cocs", name: "Electrical CoCs", blurb: "Certificates for sales and insurance." },
    { slug: "inverters-solar", name: "Inverters & Solar", blurb: "Load-shedding backup and solar." },
  ],
  "cleaning-services": [
    { slug: "home-cleaning", name: "Home Cleaning", blurb: "Weekly and once-off house cleans." },
    { slug: "office-cleaning", name: "Office Cleaning", blurb: "Contract cleaning for workplaces." },
    { slug: "deep-clean", name: "Deep Clean", blurb: "Move-in, move-out and spring cleans." },
    { slug: "post-event", name: "Post-Event Clean", blurb: "After parties, weddings and functions." },
  ],
  painting: [
    { slug: "interior-painting", name: "Interior Painting", blurb: "Rooms, ceilings and feature walls." },
    { slug: "exterior-painting", name: "Exterior Painting", blurb: "Houses, roofs and boundary walls." },
    { slug: "waterproofing", name: "Waterproofing", blurb: "Roofs, balconies and damp repair." },
  ],
  construction: [
    { slug: "renovations", name: "Renovations", blurb: "Kitchens, bathrooms and full-home remodels." },
    { slug: "building", name: "Building & Extensions", blurb: "New rooms, garages and granny flats." },
    { slug: "tiling", name: "Tiling & Paving", blurb: "Floors, walls and outdoor paving." },
  ],
  gardening: [
    { slug: "garden-cleanup", name: "Garden Cleanup", blurb: "Once-off clearing and rubble removal." },
    { slug: "landscaping", name: "Landscaping", blurb: "Design, lawns and irrigation." },
    { slug: "tree-felling", name: "Tree Felling", blurb: "Cutting, trimming and stump removal." },
  ],
  security: [
    { slug: "alarm-systems", name: "Alarm Systems", blurb: "Installs, armed response and CCTV." },
    { slug: "electric-fencing", name: "Electric Fencing", blurb: "New installs and fault repairs." },
    { slug: "gate-automation", name: "Gate Automation", blurb: "Motors, intercoms and access control." },
  ],
  handyman: [
    { slug: "general-repairs", name: "General Repairs", blurb: "The odd-jobs list, done in one visit." },
    { slug: "furniture-assembly", name: "Furniture Assembly", blurb: "Flat-pack, mountings and fittings." },
    { slug: "door-window", name: "Doors & Windows", blurb: "Locks, handles, hinges and seals." },
  ],
  "web-development": [
    { slug: "business-websites", name: "Business Websites", blurb: "Fast sites that bring in quotes." },
    { slug: "ecommerce", name: "E-commerce", blurb: "Online stores with local payments." },
    { slug: "care-plans", name: "Care Plans", blurb: "Updates, backups and security." },
  ],
  "mobile-development": [
    { slug: "android-ios", name: "Android & iOS Apps", blurb: "Native and cross-platform builds." },
    { slug: "app-maintenance", name: "App Maintenance", blurb: "Updates, fixes and store uploads." },
  ],
  "software-development": [
    { slug: "custom-software", name: "Custom Software", blurb: "Internal tools and dashboards." },
    { slug: "api-integrations", name: "API & Integrations", blurb: "Connect systems that don't talk." },
  ],
  "graphic-design": [
    { slug: "logos-branding", name: "Logos & Branding", blurb: "Identities for new and growing businesses." },
    { slug: "marketing-design", name: "Marketing Design", blurb: "Flyers, menus, social and signage." },
  ],
  "it-support": [
    { slug: "business-it", name: "Business IT", blurb: "Networks, email and device management." },
    { slug: "home-it", name: "Home IT", blurb: "WiFi, printers and setup visits." },
  ],
  cybersecurity: [
    { slug: "assessments", name: "Security Assessments", blurb: "Find the gaps before attackers do." },
    { slug: "awareness-training", name: "Staff Training", blurb: "Phishing and POPIA-aware teams." },
  ],
  "digital-marketing": [
    { slug: "seo", name: "SEO", blurb: "Rank for the searches that pay." },
    { slug: "social-ads", name: "Social & Google Ads", blurb: "Managed campaigns with reporting." },
  ],
  "computer-repair": [
    { slug: "phone-repair", name: "Phone Repair", blurb: "Screens, batteries and charging ports." },
    { slug: "laptop-repair", name: "Laptop & PC Repair", blurb: "Upgrades, virus removal and reloads." },
    { slug: "data-recovery", name: "Data Recovery", blurb: "Photos and files from dead drives." },
  ],
  tutors: [
    { slug: "maths", name: "Maths", blurb: "Primary through matric and beyond." },
    { slug: "physics", name: "Physics & Science", blurb: "Concepts, past papers and exam prep." },
    { slug: "accounting-tuition", name: "Accounting", blurb: "EMS, accounting and exam technique." },
    { slug: "matric", name: "Matric Packages", blurb: "Full-term programmes across subjects." },
  ],
  "driving-schools": [
    { slug: "k53", name: "K53 Lessons", blurb: "Code 8 and Code 10 instruction." },
    { slug: "learners", name: "Learner's Licence", blurb: "Prep classes and mock tests." },
    { slug: "refresher", name: "Refresher Lessons", blurb: "Confidence for licensed drivers." },
    { slug: "test-day-hire", name: "Test-Day Car Hire", blurb: "Car + instructor for your licence test." },
  ],
  "music-teachers": [
    { slug: "piano", name: "Piano & Keyboard", blurb: "Beginner to advanced, all ages." },
    { slug: "guitar", name: "Guitar", blurb: "Acoustic, electric and bass." },
    { slug: "vocals", name: "Vocals", blurb: "Technique, range and performance." },
  ],
  "language-teachers": [
    { slug: "english", name: "English", blurb: "School support and business English." },
    { slug: "afrikaans-zulu", name: "Afrikaans & isiZulu", blurb: "Second-language confidence." },
  ],
  training: [
    { slug: "computer-skills", name: "Computer Skills", blurb: "MS Office, email and internet basics." },
    { slug: "first-aid", name: "First Aid", blurb: "Certified workplace courses." },
    { slug: "forklift", name: "Forklift & OHS", blurb: "Operator and safety certification." },
  ],
  "beauty-salons": [
    { slug: "hair", name: "Hair", blurb: "Cuts, colour, relaxers and treatments." },
    { slug: "barber", name: "Barber", blurb: "Fades, beard trims and grooming." },
    { slug: "nails", name: "Nails", blurb: "Acrylic, gel and art." },
    { slug: "makeup", name: "Makeup", blurb: "Occasion, bridal and lessons." },
    { slug: "braids", name: "Braids & Weaves", blurb: "Knotless, cornrows and installs." },
    { slug: "spa-wellness", name: "Spa & Wellness", blurb: "Massage, facials and unwind." },
  ],
  mechanics: [
    { slug: "car-service", name: "Car Service", blurb: "Minor and major services, all makes." },
    { slug: "diagnostics", name: "Diagnostics", blurb: "Engine lights and mystery faults solved." },
    { slug: "brakes-clutch", name: "Brakes & Clutch", blurb: "Pads, discs, clutch kits and hydraulics." },
    { slug: "roadworthy", name: "Roadworthy", blurb: "Pre-test repairs and test-day help." },
  ],
  "car-wash": [
    { slug: "full-wash", name: "Full Wash & Vacuum", blurb: "Inside-out valet basics." },
    { slug: "detailing", name: "Detailing", blurb: "Polish, glaze and engine bays." },
  ],
  "panel-beaters": [
    { slug: "dent-scratch", name: "Dents & Scratches", blurb: "Minor body damage repaired and sprayed." },
    { slug: "accident-repair", name: "Accident Repair", blurb: "Major panel work and insurance jobs." },
  ],
  tyres: [
    { slug: "new-tyres", name: "New Tyres", blurb: "All sizes, fitted and balanced." },
    { slug: "alignment", name: "Wheel Alignment", blurb: "Tracking, rotation and balancing." },
  ],
  "auto-electrical": [
    { slug: "batteries", name: "Batteries", blurb: "Testing, replacement and fitment." },
    { slug: "starters-alternators", name: "Starters & Alternators", blurb: "Charging and starting faults." },
  ],
  "vehicle-repairs": [
    { slug: "suspension", name: "Suspension & Steering", blurb: "Shock absorbers, mountings and racks." },
    { slug: "exhausts", name: "Exhausts", blurb: "Repairs, replacements and fitment." },
  ],
  lawyers: [
    { slug: "raf", name: "RAF Claims", blurb: "Road Accident Fund claims, contingency-based." },
    { slug: "labour", name: "Labour Law", blurb: "CCMA, dismissals and contracts." },
    { slug: "conveyancing", name: "Conveyancing", blurb: "Property transfers and bonds." },
    { slug: "family-law", name: "Family Law", blurb: "Divorce, custody and maintenance." },
  ],
  accountants: [
    { slug: "tax", name: "Tax & SARS", blurb: "Returns, disputes and clearance." },
    { slug: "bookkeeping", name: "Bookkeeping", blurb: "Monthly books that balance." },
    { slug: "payroll", name: "Payroll & UIF", blurb: "Payslips, EMP201s and compliance." },
    { slug: "cipc", name: "CIPC & Company Reg", blurb: "Registrations, directors and returns." },
  ],
  consultants: [
    { slug: "business-consulting", name: "Business Consulting", blurb: "Strategy, pricing and growth." },
    { slug: "popia-compliance", name: "POPIA Compliance", blurb: "Policies, PAIA manuals and training." },
  ],
  "hr-services": [
    { slug: "recruitment", name: "Recruitment", blurb: "Find staff that stay." },
    { slug: "hr-outsourcing", name: "HR Outsourcing", blurb: "Contracts, policies and discipline." },
  ],
  "financial-services": [
    { slug: "financial-planning", name: "Financial Planning", blurb: "Retirement, cover and investments." },
    { slug: "bond-originator", name: "Bond Pre-qualification", blurb: "Know what you can afford." },
  ],
  "business-services": [
    { slug: "printing-signage", name: "Printing & Signage", blurb: "Business cards to vehicle branding." },
    { slug: "courier-logistics", name: "Courier & Logistics", blurb: "Same-day, contracts and e-commerce." },
  ],
  "doctors-dentists": [
    { slug: "gp", name: "GPs", blurb: "Family doctors and walk-in consults." },
    { slug: "dentist", name: "Dentists", blurb: "Checkups, fillings and whitening." },
    { slug: "optometrist", name: "Optometrists", blurb: "Eye tests and spectacles." },
  ],
  restaurants: [
    { slug: "shisanyama", name: "Shisanyama", blurb: "Flame-grilled plates and kota culture." },
    { slug: "family-dining", name: "Family Dining", blurb: "Sit-down favourites for all ages." },
    { slug: "coffee", name: "Coffee & CafÃ©s", blurb: "Work-friendly brews and brunch." },
  ],
  cake: [
    { slug: "birthday-cakes", name: "Birthday Cakes", blurb: "Custom celebration cakes to order." },
    { slug: "wedding-cakes", name: "Wedding Cakes", blurb: "Tiered centrepieces, tasting to delivery." },
    { slug: "cupcakes", name: "Cupcakes & Treats", blurb: "Dessert tables, platters and party boxes." },
  ],
  tailor: [
    { slug: "alterations", name: "Alterations", blurb: "Hems, zips, tapering and repairs." },
    { slug: "custom-made", name: "Custom Made", blurb: "Dresses, suits and traditional wear." },
  ],
  laundry: [
    { slug: "wash-fold", name: "Wash & Fold", blurb: "Laundry by the bag, returned folded." },
    { slug: "dry-cleaning", name: "Dry Cleaning", blurb: "Suits, dresses and delicate fabrics." },
    { slug: "ironing", name: "Ironing Services", blurb: "Crisp shirts and bulk pressing." },
  ],
  catering: [
    { slug: "events-catering", name: "Events Catering", blurb: "Weddings, funerals and corporate." },
    { slug: "platters", name: "Platters & Finger Food", blurb: "Party platters, snacks and braai packs." },
  ],
  photography: [
    { slug: "weddings", name: "Weddings & Events", blurb: "Full-day coverage and albums." },
    { slug: "portraits", name: "Portraits & Family", blurb: "Studio and outdoor shoots." },
    { slug: "commercial", name: "Commercial & Product", blurb: "Menus, listings and brand shoots." },
  ],
  events: [
    { slug: "decor", name: "DÃ©cor & Styling", blurb: "Themes, draping, tables and backdrops." },
    { slug: "sound-lighting", name: "Sound & Lighting", blurb: "PA, DJs, stages and dancefloors." },
    { slug: "planning", name: "Event Planning", blurb: "Coordinators for weddings and functions." },
  ],
  "interior-design": [
    { slug: "room-makeover", name: "Room Makeovers", blurb: "Single rooms, refreshed end to end." },
    { slug: "full-home", name: "Full-Home Design", blurb: "Layouts, palettes and sourcing." },
  ],
  "appliance-repair": [
    { slug: "fridge-repair", name: "Fridge & Freezer", blurb: "Regassing, compressors and seals." },
    { slug: "washing-machine", name: "Washing Machines", blurb: "Drums, pumps and electronics." },
    { slug: "stove-oven", name: "Stoves & Ovens", blurb: "Elements, gas and glass tops." },
  ],
  "pest-control": [
    { slug: "cockroach-ants", name: "Cockroaches & Ants", blurb: "Treatments with follow-up visits." },
    { slug: "rats-mice", name: "Rats & Mice", blurb: "Proofing, baiting and removal." },
    { slug: "termites", name: "Termites & Woodborer", blurb: "Inspection and fumigation." },
  ],
  "pool-services": [
    { slug: "pool-cleaning", name: "Pool Cleaning", blurb: "Weekly and once-off cleans." },
    { slug: "pool-repairs", name: "Pumps & Repairs", blurb: "Leaks, pumps and green-to-clean." },
    { slug: "pool-install", name: "New Pools & Lining", blurb: "Builds, fibreglass and marbelite." },
  ],
  removals: [
    { slug: "furniture-removals", name: "Furniture Removals", blurb: "Local and long-distance moves." },
    { slug: "bakkie-hire", name: "Bakkie Hire", blurb: "Single loads, rubble and small moves." },
    { slug: "office-moves", name: "Office Moves", blurb: "After-hours relocations with minimal downtime." },
  ],
  "car-hire": [
    { slug: "daily-hire", name: "Daily Hire", blurb: "Sedans, SUVs and people carriers." },
    { slug: "chauffeur", name: "Chauffeur & Transfers", blurb: "Airport runs and event transport." },
  ],
  "estate-agents": [
    { slug: "sales", name: "Property Sales", blurb: "Buy and sell with a local agent." },
    { slug: "rentals", name: "Rentals & Management", blurb: "Listings, vetting and management." },
  ],
  "solar-installers": [
    { slug: "backup-systems", name: "Backup Systems", blurb: "Inverters and batteries sized right." },
    { slug: "full-solar", name: "Full Solar Installs", blurb: "Panels, hybrid inverters and monitoring." },
    { slug: "solar-maintenance", name: "Maintenance & Repairs", blurb: "Faults, cleaning and upgrades." },
  ],
  "internet-services": [
    { slug: "fibre", name: "Fibre Deals", blurb: "Compare lines and installation offers." },
    { slug: "wireless", name: "Fixed Wireless & LTE", blurb: "Where fibre hasn't reached yet." },
  ],
  printers: [
    { slug: "toner-ink", name: "Toner & Ink", blurb: "Originals and compatibles, delivered." },
    { slug: "printer-repair", name: "Printer Repair", blurb: "Paper jams to full services." },
  ],
  "gates-garages": [
    { slug: "gate-motors", name: "Gate Motors", blurb: "New motors, remotes and repairs." },
    { slug: "garage-doors", name: "Garage Doors", blurb: "Automation, springs and servicing." },
  ],
  locksmiths: [
    { slug: "emergency-lockout", name: "Emergency Lockout", blurb: "Locked out? Fast callouts." },
    { slug: "lock-replacement", name: "Lock Replacement", blurb: "New locks, rekeying and safes." },
  ],
  childcare: [
    { slug: "creche", name: "CrÃ¨ches & Daycare", blurb: "Full-day care near home or work." },
    { slug: "aftercare", name: "Aftercare & Holiday Care", blurb: "School runs, homework and play." },
    { slug: "babysitting", name: "Babysitting & Au Pairs", blurb: "Vetted sitters for evenings and live-in." },
  ],
  gyms: [
    { slug: "gym-membership", name: "Gym Memberships", blurb: "Compare joining fees and monthly rates." },
    { slug: "personal-training", name: "Personal Training", blurb: "1-on-1 coaching that fits your goals." },
    { slug: "classes", name: "Classes & Bootcamps", blurb: "Yoga, boxing, spin and HIIT." },
  ],
  "pet-services": [
    { slug: "grooming", name: "Grooming & Parlours", blurb: "Wash, cut and nail trims." },
    { slug: "vet", name: "Vets", blurb: "Checkups, vaccinations and emergencies." },
    { slug: "boarding", name: "Boarding & Sitting", blurb: "Holiday care your pets will love." },
  ],
  hotels: [
    { slug: "hotels", name: "Hotels", blurb: "Luxury and boutique hotels." },
    { slug: "bed-and-breakfast", name: "Bed & Breakfast", blurb: "Cozy B&Bs and guesthouses." },
    { slug: "apartments", name: "Serviced Apartments", blurb: "Self-catering apartments." },
  ],
};

export function subcategoriesFor(categorySlug: string): Subcategory[] {
  return SUBCATEGORIES[categorySlug] ?? [];
}
