# DevhulonConnect — local services marketplace (Next.js + Firebase)

## Getting Started (DevhulonConnect)

```bash
npm install
npm run dev   # http://localhost:3000
```

## Firebase backend
1. Create project at https://console.firebase.google.com
2. Add Web app → copy config into `.env.local` (see `.env.local.example`)
3. Firestore → Create database → **paste `firestore.rules` (repo root) into Rules → Publish**
4. Storage → paste `storage.rules` → Publish
5. Authentication → enable Google provider
6. **Sign in on the site**, then visit `/admin/seed` → "Seed Firestore"

### Firestore rules model (already in `firestore.rules`)
- **Public read** for all content — buyers browse without an account.
- **Signed-in write** — users edit only their own docs (`users/{uid}`, own listings, own reviews, own posts).
- Anonymous visitors may **only bump counters** (`profileViews`, `phoneClicks`, `whatsappClicks`, `websiteClicks`, `reviewCount`) — any other field change is denied.
- Leads: sellers can browse contact-stripped request previews; every contact unlock costs credits.
  Inbox status changes and quotes require a recorded unlock.
- Public business profiles do not expose phone numbers, WhatsApp numbers, email addresses,
  websites or street addresses. These private seller contacts live in the server-only
  `business_contacts` collection and are managed through authenticated APIs. Buyers request
  quotes through DevhulonConnect; buyer lead contacts remain protected until an authorised
  seller unlocks that specific request.
- Before deploying this privacy change to an existing Firebase project, run
  `npm run migrate:business-contacts` with credentials for the intended project to
  review its dry-run counts. Applying requires an explicit `--apply`, matching
  `--project-id=<id>` and `--confirm-project=<id>`. The one-time migration moves
  legacy contact fields out of public business records and clears cached seller-pool
  records; it never prints contact values.
- Subscriptions, wallets, credit ledgers, unlock records and lead contacts are server-written.
- Seller signup uses a seven-step saved onboarding flow: account, required email/optional SMS verification, business, services/areas, profile/portfolio, plan and dashboard activation. Progress is stored privately on the user's document; passwords are never included in onboarding drafts. The server checks verified-email claims before onboarding checkout and profile activation.

Collections: provinces, cities, suburbs, categories, businesses, business_contacts, business_reviews, jobs, events, deals, articles, leads, lead_contacts, lead_unlocks, quotes, conversations (with a nested messages subcollection), message_usage, team_memberships, support_tickets, business_claims, favorites, saved_searches, notifications, reports, payments, subscriptions, billing_methods (server-only Paystack authorization records), users.

Marketplace lifecycle (spec §64): lead preview → seller spends credits to **unlock contact** → seller **accepts** → seller **sends a quote** (`quotes/{id}`) → buyer **compares** at `/compare-quotes` → buyer accepts → lead `won` → review. Unlocks are keyed by the shared request ID, so matched inbox copies and marketplace previews cannot charge twice; existing per-lead unlocks remain recognized. Messaging lives at `/messages` (one thread per buyer+seller+business, deterministic id); seller sends go through an authenticated transaction that enforces the Starter monthly allowance. Rules for `quotes` and `conversations`/`messages` are in `firestore.rules` — republish them in Firebase Console → Firestore → Rules after pulling.

Portfolio + service areas (spec §9/§10): portfolio items live in `portfolio/{id}` (public read, owner-only writes, plan entitlement checked in rules). The per-plan **item count** (10 Starter / unlimited Premium) cannot be expressed in rules (rules can't count docs), so it is enforced server-side by `POST/PATCH/DELETE /api/portfolio` (Admin SDK + subscription doc). Service areas (`businesses/{id}.serviceAreas`) are set through `PATCH /api/business`, which enforces the plan's area cap (1 Starter / unlimited Premium); the seller onboarding creation endpoint applies the same cap while atomically creating the listing and optional first portfolio item. Both routes require the caller's Firebase ID token; `POST /api/billing`-style env config (`FIREBASE_*` service account) must be set for them to work.

Bookings (spec §39): buyers request a date/time on a business profile (`bookings/{id}`, buyerUid pinned by rules); the seller confirms / reschedules / completes / marks no-show / cancels from the seller hub's **Bookings** tab; the buyer can cancel while it's live. Role-pinned field sets in `firestore.rules` keep each side from editing the other's fields. After completion, the buyer can leave a review (§20).

Seller analytics (spec §36): the hub's **Analytics** tab computes real metrics from the rows the seller can already read (leads/quotes/bookings with 30-day windows and a 6-week SVG trend chart) plus the rules-protected counters on the business doc (`profileViews`, `phoneClicks`, `whatsappClicks`, `websiteClicks`, and the new `saves` counter bumped ±1 by `toggleFavorite`). Overview is Starter-level (`basicAnalytics`); the weekly chart + conversion funnel gate on Premium's `advancedAnalytics` with an upgrade panel — never a broken screen (§60).

> If a feed shows "Firestore rules are blocking this feed", re-publish the rules file and reload.
> Deploy `firestore.indexes.json` as well (`firebase deploy --only firestore:indexes`):
> the live lead marketplace query uses a composite index on status, owner and creation time.

Subscription entitlements are enforced from the server-owned subscription record.
Business creation and edits, team management, featured placements, lead export,
and support requests use authenticated API routes; Firestore client rules also
prevent direct plan/featured changes and restrict team access. Deploy the updated
`firestore.rules` and API code together before enabling these benefits in
production.

### Requests are the unit of work (contested marketplace)

A buyer posting a need creates ONE canonical **request** document plus one
seller-facing **lead** per matched seller, and every one of those leads now
carries `requestId` pointing back at the request. That single field is what makes
"one job, several competing businesses" representable — previously the link was
written only to the server-only `lead_allocations` audit collection, so the N
leads were unlinkable orphans.

Accepting a quote runs through **`POST /api/quotes/award`** (`lib/server/award.ts`),
not the browser. It takes a Firestore transaction on the request document
(`awardedSellerUid` is the lock, so two simultaneous accepts cannot both win) and
then cascades: every rival's lead becomes `lost` with `lostReason:
"awarded_elsewhere"`, every rival's quote becomes `declined`, and each losing
seller is notified. Before this, only the winner's copy was updated, so losing
sellers chased a closed job indefinitely.

Consequences worth knowing:
- `/compare-quotes` groups by `requestId`, so it compares **seller against
  seller** on one job. Grouping by `leadId` could only ever show one seller's
  revisions of their own quote.
- Losing to a competitor is reported as `lostToCompetition`, not `lost`, in
  seller analytics — bidding and losing is the intended behaviour, not a failure.
- Firestore rules forbid reopening a lead the cascade closed
  (`!resource.data.lostAt || status == 'won'`), so a seller cannot drag their own
  closed lead back to "accepted".
- Legacy leads and quotes without `requestId` fall back to their own id, which
  behaves as a request of one — no migration needed.

### Terms acceptance is a RECORD

`users` is client-writable (that is what makes the buyer/seller role chooser
work), so a browser-written acceptance record would be indistinguishable from a
forged one — and the only purpose of that record is to be evidence when someone
disputes having agreed.

- **`POST /api/legal/accept-terms`** writes `{termsAcceptedAt, termsVersion,
  consentVersion, termsRole}` server-side, from the verified token.
- **Rules pin** all four fields, so a client can neither forge nor alter them.
- Re-accepting after a terms change adds a **new** record — the previous
  agreement is historical evidence, not stale data.
- The tick is enforced at **signup only**. Requiring it on every sign-in would
  train people to click it without reading, destroying its evidentiary value.
- **No IP address is stored.** It is personal information under POPIA with its own
  retention rules, and date + version is what actually evidences acceptance.

### Verification is a RECORD, not a boolean

`verified` used to be a bare boolean an admin flipped with a one-click button.
Three problems, all now fixed:

1. **No provenance.** Nothing recorded who verified, when, or how. Displaying
   "Verified" is a factual representation about a business (CPA), so "an admin
   clicked a button at some point" is not a defensible answer if challenged.
2. **No re-verification.** A boolean never goes stale, so a 2024 phone check
   quietly becomes a permanent claim about a business that may have changed hands.
3. **Auto-verification on claim — the worst of the three.** `approveClaim` set
   `verified: true` automatically. Proving you *own* a listing is not proving the
   business *is reachable*, which is exactly what `/about` says the badge means.
   Claiming a listing was a one-click route to a trust badge with nobody checking
   anything.

Now:

- **`POST /api/admin/verify`** — admin-only (`adminFromRequest`, same registry the
  rules use). Records `{ verifiedAt, verifiedBy, method, notes, expiresAt }`. The
  acting admin comes from their verified token; the **expiry is computed
  server-side** because that window is policy and a client could send any value.
  The admin UI must state *what* they actually did before the badge is granted —
  deliberate friction.
- **`VERIFICATION_VALID_DAYS = 365`** — re-check yearly, or sooner if a business
  stops answering.
- **Rules pin both `verified` AND `verification`**, so a seller cannot author
  their own evidence, nor null the record to make a badge vanish.
- **`VerificationBadge` shows the method and date publicly** ("Called the listed
  number on 3 March 2026"), so a buyer can judge the badge rather than trust it.
  It degrades gracefully for listings verified before records existed, and never
  says "trusted" or "guaranteed" — `/about` is explicit that verification means
  real and contactable, nothing more.

**Pagination:** seller lead/quote inboxes and buyer request/quote lists load the
newest 50 records realtime, with stable cursor-based "Load older" pages beyond
that. These pages use owner-filtered Firestore queries and corresponding
`createdAt` indexes; other capped feeds remain bounded to keep realtime reads
controlled.

Public service-category pages use an indexed `categorySlug` Firestore query and
cursor-based “Load more” pages rather than filtering one broad, capped businesses
page. The first page is server-rendered; the realtime category listener is still
capped at 200 documents, so additional pages refresh when the visitor reloads.
The public paging route only accepts known category slugs and returns public
business fields already readable under Firestore rules.

`/find-pro` now loads candidates from indexed category and location partitions
instead of scanning the whole seller pool. Search results and lead allocation
use the same candidate loader and pure ranking, with exact suburb, city, province,
and category fallback queries. Candidate reads are bounded per partition and
limited to the relevant service categories. A small live listener only updates
already-selected candidates; it cannot inject unrelated sellers into rankings.
Firestore composite indexes for category/city and category/suburb queries are
defined in `firestore.indexes.json` and must be deployed before production use.

Seller quote templates are stored locally in the current browser, per signed-in
account, with a maximum of ten. They do not sync across devices and are not
server-backed.

The homepage, `/find-pro`, and quote request forms offer native suggestions from
the bundled South African suburb, city and province dataset. Suggestions help
with spelling and discovery but remain optional free text.

### Complaints & disputes

`/complaints` is a **process**, not boilerplate — real timescales (2-business-day
acknowledgement, 10-business-day assessment), an explicit statement of what we
**can and cannot** do (we cannot refund what a *business* owes you), and links to
the NCC, Information Regulator and CGSO. Every other legal page says what the rules
*are*; this one says what happens when they're broken. Wired into the footer and
sitemap — an unlinked dispute page is worse than none, because it invites the
complaint you then fail to handle.

### Review integrity

- **Self-review is blocked in the rules**, not just the client: the rule reads the
  actual business document via `get()` rather than trusting a client-stamped
  `ownerUid`, which an attacker could simply omit.
- **Reviews record provenance** (`hasBooking`/`bookingId`) against a real booking.
  Recorded rather than *required*, because forcing a booking would exclude every
  customer served by phone quote or walk-in — the majority on a directory.

### Scale: cost, cold starts, and observability

**Tab-scoped subscriptions.** The seller dashboard opened **12 realtime listeners**
the moment it mounted, whatever tab you were on — so a seller who only wanted to
check their listing was paying Firestore reads for bookings, quotes, portfolio and
five post collections, all staying live for as long as the page was open. Firestore
bills per document read, so this was the largest avoidable cost in the app. Feeds
are now gated on their tab; `listings`, `leads` and the subscription stay always-on
because the header renders from them. **Default view: 12 live queries → 4.**

> **Deliberate trade-off:** a gated tab's badge count now appears only after you
> visit that tab. Showing a real count for 9 unopened collections is precisely the
> cost being removed, and rendering `0` would be worse — it would tell a seller
> they have no bookings when we simply haven't looked.

**Shared seller-pool snapshot** (`shared-seller-pool.ts`) — the limitation of the
process-local cache is now closed. The rendered pool is stored in Firestore where
every Vercel instance sees the same document, so concurrent cold instances collapse
onto **one** rebuild per 10 minutes instead of one each. Two safeguards:

- It stores only a **projection** of `businesses` — the fields matching actually
  reads — to stay inside Firestore's 1 MiB document limit.
- If the snapshot would exceed that limit it is **refused, not truncated**, and
  matching falls back to the paginated read. Silently dropping the tail of the
  marketplace is the exact invisible-truncation bug the paginated reader exists to
  prevent.

Everything degrades to the paginated read if the shared layer is missing.

**Error reporting** (`error-reporting.ts` + `/api/errors`) — hand-rolled rather
than Sentry, so there is no third-party script, no new dependency and no paid plan
to diagnose a crash. It reports to infrastructure the project already owns.

- Reports to **our** endpoint, not a vendor's.
- **No PII**: bearer tokens, long digit runs and email addresses are scrubbed in
  the browser *and again server-side* — a client cannot be trusted to have
  removed them already.
- **Session-capped** at 25, so one error loop cannot flood storage or bury every
  other error. No retry: a failing reporter must never become what breaks the page.
- `GET /api/errors` is **admin-only** — a stack trace is a map of your app.
- Written records are **anonymous** unless the caller happens to be signed in.
- Disable in production without a deploy: `NEXT_PUBLIC_ERROR_REPORTING=off`.

### Matching at scale (the seller pool)

`loadSellerPool()` historically read the **entire**
`businesses` AND `business_reviews` collections over REST every time — on every
POST `/api/leads`. Two distinct problems, both fixed:

1. **Silent truncation (correctness).** It called `fetchPublicCollection(…, 300)`,
   which returns a **single page**. Nothing downstream knew the pool was
   truncated, so past ~300 listings every seller beyond the first page became
   permanently **unmatchable** while buyers were told "no pros match that yet".
   The legacy/fallback loader uses `fetchAllPublicDocuments`, which follows
   `pageToken`. Partial results are returned if a later page fails — never an
   empty pool. Normal search and broadcast lead allocation now use the indexed
   candidate loader instead.
2. **Refetch per request (performance).** `seller-pool-cache.ts` caches the pool
   with three properties, each fixing a different failure:
   - **TTL (60s fresh / 10min max-stale)** — bounds staleness.
   - **Single-flight** — the thundering herd. Without it, N buyers posting at once
     all miss an empty cache and all fire the same expensive read; this collapses
     them onto one in-flight promise. *This is the part that actually survives a
     traffic spike.*
   - **Stale-while-revalidate** — an expired cache never blocks a buyer; if we
     have anything, serve it and refresh behind the caller.

**The loader moved to `@/lib/server/seller-pool`.** `lib/matching.ts` is in the
**browser bundle** (`FindProClient` imports `matchPros`), and importing a
`lib/server/*` module from a shared module would drag server code into browsers.
The pure ranking stays in `matching.ts` on purpose — server render and browser rank
the same rows, so the two results cannot disagree. Verified: no server-cache
symbols in any `.next/static/chunks` file.

**Legacy shared cache:** a process-local cache and sharded Firestore snapshot
remain available for compatibility and fallback paths. They still use a 5,000
document safety cap; the search and lead-allocation paths no longer depend on
that full-pool snapshot.

```bash
node --experimental-strip-types scripts/verify-seller-cache.ts   # 17 checks
```

Asserts the three cache properties against the real module, including that a
**failed load does not poison the cache** (the in-flight promise is cleared on both
paths — otherwise one network error would leave every later request awaiting a
dead promise forever).

### Privacy & POPIA (mechanical, not just written down)

The privacy policy used to promise things the code could not do. Both promises
are now implemented:

- **Consent is captured at the point of collection and enforced server-side.**
  Posting a quote request discloses your name, number and email to up to 5
  independent businesses, so every lead form has an **unticked** checkbox naming
  who receives the data and why (`ConsentCheckbox`). The server refuses any lead
  without it (`consent !== true` → 400) and stamps `consentAt`,
  `consentVersion` and `termsVersion` onto the stored record, so the lawful basis
  is provable from the record alone. Publishing a listing is treated the same way.
- **Erasure works, and is self-service.** `firestore.rules` keeps
  `allow delete: if false` on `leads`/`quotes`/`bookings` — correctly, since those
  are a commercial audit trail — but that used to make the policy's "removed or
  anonymised on request" impossible. `POST /api/privacy/erase` resolves the caller
  from their ID token (never a body field) and **anonymises** instead of deleting:
  personal fields are replaced with `[redacted]` and the uid is cleared, while the
  commercial record (quoted / won / lost) survives for seller record-keeping and
  aggregate statistics. Reachable from **Dashboard → Privacy & your data**.
- **Retention is a number, not a promise.** 180 days for quote requests, 30 days
  for unanswered open requests, reviews kept while published. See
  `LEAD_RETENTION_DAYS` / `LEAD_OPEN_EXPIRY_DAYS` in `src/lib/legal.ts`.
- Erasure refuses (with an explanation) if the account still owns a public
  listing — we don't silently delete a directory entry other customers rely on.
- The erasure audit row in `privacy_erasures` stores **counts only**, no
  identifier: proving we honoured erasure must not itself become a POPIA problem.

Legal versions and consent copy live in **`src/lib/legal.ts`** (pure, shared by
client and server) so the wording in the checkbox, the value the server records,
and the fan-out ceiling in the prose can never drift apart. Bump
`CONSENT_VERSION` / `TERMS_VERSION` when the wording changes materially.

> Outbound-only: this covers consent, access and erasure. Retention IS now enforced
> on a schedule — see below.

### First-party marketplace analytics

The site records daily aggregate counts for broad page categories, submitted
searches, and successfully submitted quote requests. It stores no user or device
identifier, cookie, search text, location, or IP address in the analytics
records; it does not claim unique visitors or user-level conversion rates.
Analytics are visible to admins at `/admin/analytics` and retained for 400 days.
The event endpoint is allow-listed, same-origin checked, and rate-limited; its
separate rate-limit records are removed after 7 days. Both retention windows are
enforced by the daily retention sweep.

### Retention sweep (enforces the published privacy policy)

`GET|POST /api/cron/retention` runs bounded maintenance passes daily (Vercel Cron,
`vercel.json`, 03:17):

1. **Expiry (30 days)** — an open request nobody answered is closed and every
   seller on it is stood down, using the same `status: "lost"` shape as losing to
   a competitor, so the dashboard and analytics need no special case.
2. **Redaction (180 days)** — personal fields are replaced with `[redacted]` and
   `requesterUid` cleared; the commercial outcome survives.
3. **Analytics (400 days)** — old daily aggregate counters are deleted.
4. **Rate limits (7 days)** — expired anti-abuse counters, including their
   temporary IP subjects, are deleted.

Set **`CRON_SECRET`** (see `.env.local.example`). The route **fails closed** when
it is unset — 503, never 200 — because an unauthenticated endpoint that deletes
user data must not be reachable. Verified: unset → 503, wrong/missing bearer →
401, correct secret → proceeds.

Manual trigger:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://<domain>/api/cron/retention
```

### Starter, Premium and credits

`src/lib/plans.ts` is the plan source of truth. Starter is free and includes 35
credits per monthly allocation period, with up to 3 unique eligible lead
opportunities in that period. Premium is R300/month (or R3,000 for the currently
configured annual checkout), includes 300 credits per paid monthly allocation,
and has no fixed monthly opportunity limit. Annual Premium is charged upfront;
its included credits are allocated monthly while the paid period remains active.

An opportunity is counted once for a unique request successfully allocated to
that seller; repeat views and notifications do not count again. Unlocking a lead
spends the displayed credits, not another opportunity. Starter remains capped at
3 opportunities even when the seller buys extra credits. Included monthly credits
do not roll over; purchased credits are held in a separate balance and survive a
Premium expiry or downgrade.

Purchased credits cost R2 each. Lead contact unlocks cost at least 10 credits
(R20) for a small job; larger requests cost 20 credits (R40), 40 credits (R80),
or 80 credits (R160) based on the request's estimated project value. If no buyer
budget is supplied, the request description is used to estimate its tier.
Sellers see both the credit and rand cost before unlocking.

Premium checkout can be one-time or explicitly opted-in automatic renewal through
Paystack. Reusable authorization codes are stored in the server-only
`billing_methods` collection and are never exposed to clients. `/api/cron/billing-renewals`
charges due renewals daily, verifies successful charges, applies idempotent plan
and credit updates, and retries failures after one day and three days (three
attempts maximum). The billing page can turn off renewal; cancellation preserves
access through the paid period. Yoco and Paystack checkouts without opt-in remain
one-time payments. At the end of a paid period without a confirmed extension, the
effective plan returns to Starter. Existing listings, leads, quotes, reviews,
conversations and purchased credits are preserved.

`GET|POST /api/cron/plan-credits` runs daily (Vercel Cron, `vercel.json`, 04:23).
Each monthly allocation updates the wallet, credit ledger, and next grant date in
one transaction. The deterministic ledger record makes retries safe. It shares
the retention sweep's `CRON_SECRET` and also fails closed if the secret is unset.

`GET|POST /api/cron/billing-renewals` runs daily (04:10 UTC), before the 04:23
plan-credit expiry/downgrade job, and uses the same
`CRON_SECRET`. An ambiguous provider response is reconciled against Paystack before
another charge is attempted, preventing duplicate renewal charges. Refund webhooks
revoke unspent purchased credits, or unused credits for the currently refunded
subscription period; a ledger row records amounts revoked and any purchased-credit
shortfall caused by credits already spent. Partial refunds are marked for manual
review rather than automatically revoking the full credit amount.

Manual trigger:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://<domain>/api/cron/plan-credits
```

### Verifying the sweep logic

The sweep deletes user data, so its decision layer is verified for real (no test
runner, no new dependencies — a standalone script that imports the **actual**
shipped modules):

```bash
node --experimental-strip-types scripts/verify-retention.ts   # 32 checks
```

It covers every `createdAt` shape actually in the dataset (ISO string, Firestore
Timestamp, Date, epoch), both window boundaries, and — most importantly — the
safety property that **an unreadable timestamp is skipped, never swept**. If
`toMillis` ever returned `0` for an unrecognised shape, every live lead would look
infinitely old and be deleted; that case is asserted false on purpose.

`scripts/` is excluded from `tsconfig.json` because these run directly under Node
rather than being bundled by Next (they use explicit `.ts` specifiers and resolve
`@/` through `scripts/alias-hook.mjs`).

**Why dates are filtered in code, not in the query:** `createdAt` is a *mixed
type* in this dataset — the server routes write an ISO string, older client writes
used `serverTimestamp()` — so a Firestore range query (`createdAt <= X`) compares
by type first and would silently return nothing across the mix. Pass 1 queries a
single indexed field (`status`); pass 2 pages by `__name__`. Both evaluate age via
`toMillis`, which handles Timestamp / Date / ISO / epoch.

### Abuse limits (server-enforced)

Every lead-creating route is rate limited per account **and** per IP, enforced in
`lib/server/rate-limit.ts` with transactional Firestore counters (a serverless
function shares no memory, so an in-process `Map` would not hold). Broadcasts are
capped tightest because one broadcast spends a credit on *every* seller it
matches. Counters fail **open** — a Firestore hiccup must not block real buyers,
and the plan allowance still applies independently.

`maxSellers` is clamped server-side to `[1, 5]` (default 3); the body value is a
request, never an instruction.

Listing creation is also server-side (`POST /api/business`) because rules cannot
COUNT documents: the number of listings per account and
`limitsFor(plan).services` are both enforced there, from the server-owned
subscription.

## Monetisation

### Google AdSense (auto-ready)
The `AdSlot` component (`src/components/AdSenseAd.tsx`) already renders real
AdSense units the moment you're approved — no code changes needed:

1. Get approved at https://adsense.com (original content + privacy policy required).
2. Create an **ad unit** → copy your `ca-pub-…` client ID and the unit's slot ID.
3. Add both to `.env.local`:
   ```
   NEXT_PUBLIC_ADSENSE_CLIENT=ca-pub-…
   NEXT_PUBLIC_ADSENSE_SLOT=1234567890
   ```
4. Restart `npm run dev`.

Until those vars are set, every slot shows a labelled placeholder (never more
than 1–2 slots per page — Google penalises ads that outweigh content).

### Subscription plan benefits

`src/lib/plans.ts` is the source of truth for Starter (free) and Premium
(R300/month; R3,000/year in the current configuration), including included
credits, feature gates, and quotas. Confirmed Premium payments grant 300 credits
for the applicable allocation; `/api/cron/plan-credits` processes due monthly
allocations and Starter refills.

Plan-gated capabilities are applied in the seller dashboard and their server
routes: service and portfolio quotas, monthly lead opportunities, a
50-per-UTC-month Starter seller-message allowance (Premium is unlimited),
analytics, featured profile/deal/event placements, plan-ranked visibility and
priority leads, Premium team seats, Premium lead CSV export (buyer contact details are
included only for unlocked leads), and priority-marked support tickets with an
admin queue. Listing and service-area limits are also checked by the
server on create/edit. CSV exports include all matching leads and protect
spreadsheet cells from formula execution.

Subscription credits and benefits are code-complete only after the updated
Firestore rules, Firebase/Vercel environment, and cron configuration have been
deployed. Production payment-provider configuration remains environment-specific.

## Side-by-side business comparison
`src/components/ComparisonTable.tsx` renders a feature×price matrix (rating,
services, price, hours and Request a Quote) on every suburb+category page.
The design system lives in `globals.css` (`.hippo-hero`, `.hippo-card`,
`.btn-hippo`, `.btn-navy`, `.btn-sun`) and `@theme` colours — navy `#10243e`,
hippo green `#7ac142`, sun yellow `#ffc72c`, mist `#f2f6fa`.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deployment

The **site** deploys to Vercel. The **backend config** (Firestore rules, indexes,
Storage rules) deploys to Firebase. They are separate deploys and neither one
implies the other — see "The order that matters" below.

```bash
npm run verify   # typecheck + lint + tests (the same gate CI runs)
```

### 1. One-time setup

```bash
npm install -g firebase-tools
firebase login

# Set your real project id here (it ships in the repo, it is not a secret):
#   .firebaserc -> projects.default
npm run deploy:firebase        # firestore.rules + indexes + storage.rules
```

`node scripts/check-deploy-config.mjs` (also part of `npm test`) validates the
JSON, checks both rules files parse and balance, and **refuses to pass while
`.firebaserc` still holds a placeholder** — deploying to the wrong project is not
a recoverable mistake.

Create the first admin. `firestore.rules` sets `allow write: if false` on
`/admins`, so it cannot be done through the app (deliberately — otherwise any
signed-in user could promote themselves). Use the script, which resolves your
email to a Firebase uid via the Admin SDK:

```bash
node scripts/bootstrap-admin.mjs you@example.com
node scripts/bootstrap-admin.mjs you@example.com --remove   # revoke
```

Then sign in at `/admin/seed` to write reference data.

### 2. Environment variables

Copy `.env.local.example` → `.env.local` for local work; set the same keys in
Vercel for production.

**Required in production, or the app degrades silently:**

| Variable | Consequence if missing |
| --- | --- |
| `FIREBASE_PROJECT_ID` / `FIREBASE_CLIENT_EMAIL` / `FIREBASE_PRIVATE_KEY` | ~10 route handlers return **503**. Every page still renders, so this looks healthy while every form fails. The server logs a loud one-time warning naming the missing vars. |
| `NEXT_PUBLIC_FIREBASE_*` web settings, including `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Firebase client features cannot connect to the intended project; uploads also fail if the configured Storage bucket does not exist. |
| `CRON_SECRET` | `/api/cron/retention`, `/api/cron/plan-credits` and `/api/cron/billing-renewals` fail **closed** (503, never 200) — scheduled maintenance and billing renewals stop. Intended. |
| `PAYMENT_PROVIDER` and the matching live provider secret | Seller checkout cannot complete without a supported payment provider. Use test keys only in staging; configure the matching production webhook before accepting live payments. |
| `RESEND_API_KEY` and a verified `EMAIL_FROM` sender | Transactional email stays in dry-run mode without a Resend key; production notifications will not reach users. |
| `NEXT_PUBLIC_SITE_URL` / `NEXT_PUBLIC_CONTACT_EMAIL` | The code has defaults, but confirm and explicitly set the intended public domain and monitored contact address before launch. |

Optional branding and contact details: `NEXT_PUBLIC_SITE_NAME` /
`NEXT_PUBLIC_SITE_SHORT` / `NEXT_PUBLIC_SITE_LEGAL` / `NEXT_PUBLIC_CONTACT_PHONE` /
`NEXT_PUBLIC_CONTACT_PHONE_TEL` / `NEXT_PUBLIC_CONTACT_HOURS`. AdSense variables
are optional. Payment variables are only optional if paid checkout is disabled.

Only the Firebase web settings and site identity/contact values use the
`NEXT_PUBLIC_` prefix. Firebase Admin credentials, payment secrets, `RESEND_API_KEY`
and `CRON_SECRET` must remain server-only; prefixing them exposes them to the
browser. CI fails the build if a literal private key is ever committed.

### 3. The order that matters

Rules and indexes must be published **before or with** the first app deploy —
otherwise the app runs against the previous, more permissive rules and every
security property described in this README is inert.

```
firebase deploy --only firestore,storage   →   first Vercel deploy
```

### 4. Verify before and after deploying

Balanced braces are necessary, not sufficient — they do not prove the rules are
semantically correct. Before trusting them:

```bash
npm run emulators      # test rules against real requests, not eyeballed syntax
```

and exercise the end-to-end flows in a staging Firebase project or emulator:
submit a lead and confirm seller delivery, run retention against disposable test
data, and test a payment-provider checkout/webhook in test mode. Do not use a live
payment or production user data as a test. Verify the production Storage bucket
exists and test an authenticated verification upload in staging.

Before launch, also complete the external setup that source checks cannot verify:
confirm Firebase rules and indexes are deployed to the intended project, the
Storage bucket exists, the Resend sending domain is verified, Paystack is switched
to live keys with its webhook pointed at `/api/billing/webhook`, the domain and
contact details are correct, and the legal policies have been reviewed and dated.

### CI

`.github/workflows/ci.yml` runs `typecheck`, `lint`, `test` and `build` on every
push and PR, plus a secret-hygiene check. Before it existed nothing ran
automatically — a regression in the retention sweep or seller-pool cache could
reach production silently, because those checks are standalone scripts no tool
invoked.

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
