import Link from "next/link";
import { SERVICE_GROUPS } from "@/data/taxonomy";

const GROUP_BACKGROUNDS: Record<string, string> = {
  "health-lifestyle": "/HEALTH.jpg",
  automotive: "/AUTOMOTIVE.jpg",
  "home-services": "/HOMESERVICE.jpg",
  technology: "/TECHNOLOGY.jpg",
  education: "/EDUCATION.jpg",
  "beauty-wellness": "/BEAUTY.jpg",
  "professional-services": "/PROFESSIONAL.jpg",
};

/** Photo-background links to the service groups featured on the homepage. */
export default function HomeServiceGroups() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 items-stretch">
      {SERVICE_GROUPS.map((group) => (
        <Link
          key={group.slug}
          href={`/services#${group.slug}`}
          className="group relative flex min-h-[160px] flex-col justify-end overflow-hidden rounded-2xl bg-[#0b1e33] p-5 text-left shadow-sm transition hover:shadow-xl sm:min-h-[220px] sm:p-6"
        >
          <span
            aria-hidden="true"
            className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-105"
            style={{ backgroundImage: `url("${GROUP_BACKGROUNDS[group.slug]}")` }}
          />
          <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-[#0b1e33]/95 via-[#0b1e33]/55 to-[#0b1e33]/10 transition-opacity group-hover:opacity-90" />
          <span className="relative z-10 font-extrabold text-lg leading-tight text-white transition-colors group-hover:text-[#7ac142] sm:text-2xl">
            {group.name}
          </span>
        </Link>
      ))}
    </div>
  );
}
