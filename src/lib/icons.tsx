import type { ComponentProps, ComponentType } from "react";
import {
  Wrench, Zap, CarFront, UtensilsCrossed, Scissors, Stethoscope, Scale,
  Calculator, SprayCan, GraduationCap, Laptop, Car, PaintRoller, HardHat,
  Flower2, ShieldCheck, Hammer, Code2, Smartphone, PenTool, MonitorCog,
  Fingerprint, Megaphone, Braces, Music, Languages, Presentation, Droplets,
  Paintbrush, CircleDot, BatteryCharging, Briefcase, Users, Landmark,
  Building2, Hand, Brush, Sparkles, HeartPulse, Layers, Search, MapPin,
  Star, Tag, CalendarDays, Camera, Truck, Siren, BadgeCheck, Clock,
  SlidersHorizontal, ArrowRight, TrendingUp, Award, Sofa, Refrigerator,
  Bug, Waves, Package, KeyRound, Baby, Dumbbell, PawPrint, CakeSlice,
  Shirt, ChefHat, Bell, MessageSquare, Send, Flag, Ban, Check, X, Info,
  FileText, Image as ImageIcon, Phone, Ticket, Heart, Lock, UserRound,
} from "lucide-react";

/**
 * Single coherent SVG icon system for the whole marketplace (§41).
 * Every icon renders with the same stroke width, sizing scale and
 * alignment treatment — no emoji, no mixed icon styles.
 *
 * Server-safe: lucide-react components render fine inside RSC payloads,
 * so `KIcon` can be used from both server and client components.
 */

type LucideComponent = ComponentType<ComponentProps<typeof Wrench>>;

export const ICONS = {
  wrench: Wrench,
  zap: Zap,
  carFront: CarFront,
  utensils: UtensilsCrossed,
  scissors: Scissors,
  stethoscope: Stethoscope,
  scale: Scale,
  calculator: Calculator,
  sprayCan: SprayCan,
  graduationCap: GraduationCap,
  laptop: Laptop,
  car: Car,
  paintRoller: PaintRoller,
  hardHat: HardHat,
  flower: Flower2,
  shieldCheck: ShieldCheck,
  hammer: Hammer,
  code: Code2,
  smartphone: Smartphone,
  penTool: PenTool,
  monitorCog: MonitorCog,
  fingerprint: Fingerprint,
  megaphone: Megaphone,
  braces: Braces,
  music: Music,
  languages: Languages,
  presentation: Presentation,
  droplets: Droplets,
  paintbrush: Paintbrush,
  circleDot: CircleDot,
  battery: BatteryCharging,
  briefcase: Briefcase,
  users: Users,
  profile: UserRound,
  landmark: Landmark,
  building: Building2,
  hand: Hand,
  brush: Brush,
  sparkles: Sparkles,
  heartPulse: HeartPulse,
  layers: Layers,
  search: Search,
  mapPin: MapPin,
  star: Star,
  tag: Tag,
  ticket: Ticket,
  calendar: CalendarDays,
  camera: Camera,
  truck: Truck,
  siren: Siren,
  badgeCheck: BadgeCheck,
  clock: Clock,
  sliders: SlidersHorizontal,
  arrowRight: ArrowRight,
  trendingUp: TrendingUp,
  award: Award,
  sofa: Sofa,
  refrigerator: Refrigerator,
  bug: Bug,
  waves: Waves,
  package: Package,
  keyRound: KeyRound,
  baby: Baby,
  dumbbell: Dumbbell,
  pawPrint: PawPrint,
  cakeSlice: CakeSlice,
  shirt: Shirt,
  chefHat: ChefHat,
  bell: Bell,
  heart: Heart,
  lock: Lock,
  message: MessageSquare,
  phone: Phone,
  send: Send,
  flag: Flag,
  ban: Ban,
  check: Check,
  close: X,
  info: Info,
  file: FileText,
  image: ImageIcon,
} as const satisfies Record<string, LucideComponent>;

export type IconKey = keyof typeof ICONS;

export function KIcon({
  name,
  size = 20,
  className,
  strokeWidth = 2.2,
  fill,
  title,
}: {
  name: IconKey;
  size?: number;
  className?: string;
  strokeWidth?: number;
  /** Solid fill — used for the star rating and any "active/selected" state. */
  fill?: string;
  /** Supplying a title makes the icon an accessible img with that label. */
  title?: string;
}) {
  const C = ICONS[name] as LucideComponent;

  // Only forward `fill` when the caller actually set it.
  //
  // Lucide supplies `fill: "none"` as a default attribute. Passing
  // `fill={undefined}` still writes the key, and because the component spreads
  // the rest props *after* its defaults, that `undefined` overwrites `none` —
  // React then omits the attribute entirely. With no `fill` on the <svg> and
  // none on the child <path>s, SVG falls back to its initial value, BLACK, so
  // every closed shape (wrench, clock, badge-check, briefcase, building, tag)
  // rendered as a solid black blob instead of a clean outline.
  const fillProp = fill === undefined ? {} : { fill };

  if (title) {
    return (
      <C
        size={size}
        className={className}
        strokeWidth={strokeWidth}
        {...fillProp}
        role="img"
        aria-label={title}
      />
    );
  }
  return (
    <C
      size={size}
      className={className}
      strokeWidth={strokeWidth}
      {...fillProp}
      aria-hidden={true}
      focusable={false}
    />
  );
}

/**
 * Canonical icon for a category slug. Shared by the services index, nav
 * mega-menu, homepage tiles and seller cards so one service always has
 * one icon everywhere.
 */
const CATEGORY_ICONS: Record<string, IconKey> = {
  plumbers: "wrench",
  electricians: "zap",
  mechanics: "carFront",
  "vehicle-repairs": "wrench",
  "auto-electrical": "battery",
  "car-wash": "droplets",
  tyres: "circleDot",
  "panel-beaters": "paintbrush",
  "cleaning-services": "sprayCan",
  painting: "paintRoller",
  construction: "hardHat",
  gardening: "flower",
  security: "shieldCheck",
  handyman: "hammer",
  "web-development": "code",
  "mobile-development": "smartphone",
  "software-development": "braces",
  "graphic-design": "penTool",
  "it-support": "monitorCog",
  cybersecurity: "fingerprint",
  "digital-marketing": "megaphone",
  "computer-repair": "laptop",
  tutors: "graduationCap",
  "driving-schools": "car",
  "music-teachers": "music",
  "language-teachers": "languages",
  training: "presentation",
  "beauty-salons": "scissors",
  restaurants: "utensils",
  "doctors-dentists": "stethoscope",
  lawyers: "scale",
  accountants: "calculator",
  consultants: "briefcase",
  "hr-services": "users",
  "financial-services": "landmark",
  "business-services": "building",
  "interior-design": "sofa",
  "appliance-repair": "refrigerator",
  "pest-control": "bug",
  "pool-services": "waves",
  removals: "package",
  "car-hire": "keyRound",
  "estate-agents": "building",
  "solar-installers": "zap",
  "internet-services": "laptop",
  printers: "building",
  "gates-garages": "shieldCheck",
  locksmiths: "keyRound",
  childcare: "baby",
  gyms: "dumbbell",
  "pet-services": "pawPrint",
  cake: "cakeSlice",
  tailor: "shirt",
  laundry: "droplets",
  catering: "chefHat",
  photography: "camera",
  events: "calendar",
  hotels: "building",
};

export function iconForCategory(slug: string): IconKey {
  return CATEGORY_ICONS[slug] ?? "layers";
}
