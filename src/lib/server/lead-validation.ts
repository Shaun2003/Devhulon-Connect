import { categories } from "@/data/categories";
import { CATEGORY_GROUPS, SERVICE_GROUPS } from "@/data/taxonomy";

export function validateBuyerLeadFields(
  body: Record<string, unknown>,
  requireServiceGroup = false,
): string | null {
  const need = typeof body.need === "string" ? body.need.trim() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";

  if (need.length < 2) return "Describe what you need in at least 2 characters.";
  if (name.length < 2) return "Enter your full name.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Enter a valid email address.";
  if (phone.replace(/[^\d]/g, "").length < 6) return "Enter a valid phone or WhatsApp number.";
  const serviceGroupSlug = typeof body.serviceGroupSlug === "string" ? body.serviceGroupSlug.trim() : "";
  const categorySlug = typeof body.categorySlug === "string" ? body.categorySlug.trim() : "";
  const validServiceGroup = SERVICE_GROUPS.some((group) => group.slug === serviceGroupSlug);
  const validCategory = categories.some((category) => category.slug === categorySlug);

  if (serviceGroupSlug && !validServiceGroup) return "Choose a valid main service.";
  if (categorySlug && !validCategory) return "Choose a valid service.";
  if (serviceGroupSlug && categorySlug && CATEGORY_GROUPS[categorySlug] !== serviceGroupSlug) {
    return "Choose a service within the selected main service.";
  }
  if (requireServiceGroup && !validServiceGroup && !validCategory) {
    return "Choose the service you need.";
  }

  return null;
}
