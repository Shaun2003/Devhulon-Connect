/**
 * Profile strength — "your profile is X% complete" with the next best action
 * (master spec §11).
 *
 * Pure: takes a plain snapshot of what the seller has and returns a percentage
 * plus a prioritised checklist. Weights are explicit so the number moves for a
 * predictable reason and can be explained to the seller.
 */

export type StrengthAction = {
  /** "tab" switches the seller dashboard tab; "href" navigates (edit form). */
  kind: "tab" | "href";
  target: string;
  label: string;
};

export type StrengthCheck = {
  key: string;
  label: string;
  hint: string;
  done: boolean;
  weight: number;
  action: StrengthAction;
};

export type StrengthInput = {
  name?: string | null;
  description?: string | null;
  phone?: string | null;
  hours?: string | null;
  priceNote?: string | null;
  hasPhoto?: boolean;
  servicesCount?: number;
  serviceAreasCount?: number;
  portfolioCount?: number;
  verified?: boolean;
  businessId?: string | null;
};

export type Strength = { percent: number; checks: StrengthCheck[]; nextAction: StrengthCheck | null };

export function profileStrength(input: StrengthInput): Strength {
  const id = input.businessId ?? "";
  const edit = (label: string): StrengthAction => ({ kind: "href", target: `/business/${id}/edit`, label });

  const checks: StrengthCheck[] = [
    {
      key: "description",
      label: "Business description",
      hint: "Tell buyers what you do and where — at least a few sentences.",
      done: String(input.description ?? "").trim().length >= 40,
      weight: 15,
      action: edit("Add description"),
    },
    {
      key: "services",
      label: "List your services",
      hint: "Services are what buyers search for — add at least three.",
      done: Number(input.servicesCount ?? 0) >= 3,
      weight: 15,
      action: edit("Add services"),
    },
    {
      key: "photo",
      label: "Cover photo or gallery",
      hint: "Listings with photos get noticed first.",
      done: Boolean(input.hasPhoto),
      weight: 12,
      action: edit("Add a photo"),
    },
    {
      key: "portfolio",
      label: "Portfolio of work",
      hint: "Real jobs with photos build trust faster than any description.",
      done: Number(input.portfolioCount ?? 0) >= 3,
      weight: 18,
      action: { kind: "tab", target: "portfolio", label: "Add portfolio" },
    },
    {
      key: "areas",
      label: "Service areas",
      hint: "Say which suburbs you cover so the right requests reach you.",
      done: Number(input.serviceAreasCount ?? 0) >= 1,
      weight: 10,
      action: { kind: "tab", target: "areas", label: "Set areas" },
    },
    {
      key: "hours",
      label: "Working hours",
      hint: "“Open now” filters rely on your hours.",
      done: String(input.hours ?? "").trim().length >= 3,
      weight: 10,
      action: edit("Add hours"),
    },
    {
      key: "pricing",
      label: "Starting price or price note",
      hint: "A price indication reduces tyre-kicker enquiries.",
      done: String(input.priceNote ?? "").trim().length >= 3,
      weight: 10,
      action: edit("Add pricing"),
    },
    {
      key: "contact",
      label: "Phone number",
      hint: "Buyers often prefer to call.",
      done: String(input.phone ?? "").trim().length >= 6,
      weight: 5,
      action: edit("Add phone"),
    },
    {
      key: "verified",
      label: "Verification",
      hint: "We verify by phone or WhatsApp — then your badge shows.",
      done: Boolean(input.verified),
      weight: 5,
      action: { kind: "href", target: "/about", label: "How verification works" },
    },
  ];

  const total = checks.reduce((sum, c) => sum + c.weight, 0);
  const earned = checks.filter((c) => c.done).reduce((sum, c) => sum + c.weight, 0);
  const percent = total === 0 ? 0 : Math.round((earned / total) * 100);
  // Highest-weight unfinished item = the single most valuable next step.
  const nextAction = checks.filter((c) => !c.done).sort((a, b) => b.weight - a.weight)[0] ?? null;
  return { percent, checks, nextAction };
}
