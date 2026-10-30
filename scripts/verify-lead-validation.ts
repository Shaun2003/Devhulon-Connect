import assert from "node:assert/strict";
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";

register(pathToFileURL(path.resolve(import.meta.dirname, "./alias-hook.mjs")));

const { validateBuyerLeadFields } = await import("../src/lib/server/lead-validation.ts");

const validLead = {
  need: "Repair a leaking kitchen tap",
  name: "Thandi Mokoena",
  email: "thandi@example.co.za",
  phone: "082 123 4567",
};

assert.equal(validateBuyerLeadFields(validLead), null);
assert.match(validateBuyerLeadFields({ ...validLead, need: "" }) ?? "", /Describe what you need/);
assert.match(validateBuyerLeadFields({ ...validLead, name: "T" }) ?? "", /full name/);
assert.match(validateBuyerLeadFields({ ...validLead, email: "not-an-email" }) ?? "", /valid email/);
assert.match(validateBuyerLeadFields({ ...validLead, phone: "123" }) ?? "", /phone or WhatsApp/);
assert.equal(validateBuyerLeadFields(validLead, true), "Choose the service you need.");
assert.equal(validateBuyerLeadFields({ ...validLead, serviceGroupSlug: "home-services" }, true), null);
assert.equal(validateBuyerLeadFields({ ...validLead, categorySlug: "web-development" }, true), null);
assert.match(validateBuyerLeadFields({ ...validLead, serviceGroupSlug: "plumbing" }, true) ?? "", /valid main service/);
assert.match(validateBuyerLeadFields({
  ...validLead,
  serviceGroupSlug: "home-services",
  categorySlug: "web-development",
}, true) ?? "", /within the selected main service/);

console.log("All buyer lead validation checks passed.");
