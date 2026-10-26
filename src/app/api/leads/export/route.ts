import { adminDb, apiError, sessionFromRequest } from "@/lib/server/admin";
import { entitlementFrom, readSubscription } from "@/lib/server/subscriptions";
import { hasCap } from "@/lib/plans";
import type { Query, QueryDocumentSnapshot } from "firebase-admin/firestore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function csvCell(value: unknown): string {
  const raw = String(value ?? "");
  const text = /^[\t\r ]*[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${text.replace(/"/g, '""')}"`;
}

function timestamp(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    return (value.toDate() as Date).toISOString();
  }
  return "";
}

function timestampMillis(value: unknown): number {
  if (typeof value === "string") return Date.parse(value) || 0;
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    return (value.toDate() as Date).getTime();
  }
  return 0;
}

async function readAll(query: Query): Promise<QueryDocumentSnapshot[]> {
  const documents: QueryDocumentSnapshot[] = [];
  let cursor: QueryDocumentSnapshot | null = null;
  while (true) {
    const page = await (cursor ? query.startAfter(cursor) : query).limit(500).get();
    documents.push(...page.docs);
    if (page.size < 500) return documents;
    cursor = page.docs[page.docs.length - 1];
  }
}

type LeadExportRow = {
  id: string;
  createdAt?: unknown;
  requestId?: unknown;
  status?: unknown;
  need?: unknown;
  suburb?: unknown;
  budget?: unknown;
  timeline?: unknown;
};

export async function GET(request: Request) {
  const db = adminDb();
  if (!db) return apiError("Server storage is not configured.", 503);
  const session = await sessionFromRequest(request);
  if (!session) return apiError("Sign in to export leads.", 401);

  const entitlement = entitlementFrom(await readSubscription(session.uid));
  if (!entitlement.entitled || !hasCap(entitlement.plan, "leadExport")) {
    return apiError("Lead export is available on the Business plan.", 403);
  }

  const [leadDocs, unlockDocs] = await Promise.all([
    readAll(db.collection("leads").where("ownerUid", "==", session.uid)),
    readAll(db.collection("lead_unlocks").where("ownerUid", "==", session.uid)),
  ]);
  const unlockedRequests = new Set(
    unlockDocs.map((doc) => String(doc.data().requestId ?? doc.data().leadId ?? "")),
  );
  const leadRows: LeadExportRow[] = leadDocs.map((doc) => ({ ...doc.data(), id: doc.id } as LeadExportRow))
    .sort((a, b) => timestampMillis(b.createdAt) - timestampMillis(a.createdAt));
  const contactsByRequest = new Map<string, Record<string, unknown>>();
  const requestIds = [...new Set(leadRows
    .map((lead) => String(lead.requestId ?? lead.id))
    .filter((requestId) => unlockedRequests.has(requestId)))];

  for (let offset = 0; offset < requestIds.length; offset += 300) {
    const ids = requestIds.slice(offset, offset + 300);
    const contacts = await db.getAll(...ids.map((id) => db.collection("lead_contacts").doc(id)));
    for (const contact of contacts) {
      if (contact.exists) contactsByRequest.set(contact.id, contact.data() ?? {});
    }
  }

  const rows = [
    ["Lead ID", "Created", "Status", "Request", "Suburb", "Budget", "Timeline", "Buyer name", "Buyer email", "Buyer phone"],
    ...leadRows.map((lead) => {
      const requestId = String(lead.requestId ?? lead.id);
      const contact = contactsByRequest.get(requestId);
      return [
        lead.id,
        timestamp(lead.createdAt),
        lead.status,
        lead.need,
        lead.suburb,
        lead.budget,
        lead.timeline,
        contact?.name,
        contact?.email,
        contact?.phone,
      ];
    }),
  ];
  const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="kasi-leads.csv"',
      "cache-control": "no-store",
    },
  });
}
