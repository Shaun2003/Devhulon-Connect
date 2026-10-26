/**
 * One-off repair for the `submitReview` bug that stranded businesses with real
 * reviews at `rating: 0`. Recomputes the true average from `business_reviews`
 * and writes `rating` + `reviewCount` back.
 *
 * Run:  node scripts/backfill-ratings.cjs            (dry run, prints a plan)
 *       node scripts/backfill-ratings.cjs --commit   (actually writes)
 *
 * Safe to re-run: recomputes from scratch rather than incrementing.
 */
const https = require('https');
const fs = require('fs');

const env = fs.readFileSync('.env.local', 'utf8');
const get = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1].trim();
const project = get('NEXT_PUBLIC_FIREBASE_PROJECT_ID');
const key = get('NEXT_PUBLIC_FIREBASE_API_KEY');
const COMMIT = process.argv.includes('--commit');
const BASE = 'https://firestore.googleapis.com/v1/projects/' + project + '/databases/(default)/documents';

function req(method, path, body) {
  return new Promise((resolve, reject) => {
    const sep = path.indexOf('?') >= 0 ? '&' : '?';
    const payload = body ? JSON.stringify(body) : null;
    const opts = {
      method,
      headers: Object.assign(
        { 'Content-Type': 'application/json' },
        payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}
      ),
    };
    const r = https.request(BASE + path + sep + 'key=' + key, opts, (res) => {
      let b = '';
      res.on('data', (c) => (b += c));
      res.on('end', () => resolve({ status: res.statusCode, body: b ? JSON.parse(b) : null }));
    });
    r.on('error', reject);
    if (payload) r.write(payload);
    r.end();
  });
}

const num = (v) => {
  if (!v) return 0;
  if (typeof v.integerValue === 'string') return Number(v.integerValue);
  if (typeof v.doubleValue === 'number') return v.doubleValue;
  return 0;
};

(async () => {
  const bizRes = await req('GET', '/businesses?pageSize=300');
  const revRes = await req('GET', '/business_reviews?pageSize=300');
  const businesses = (bizRes.body && bizRes.body.documents) || [];
  const reviews = (revRes.body && revRes.body.documents) || [];
  console.log('scanned ' + businesses.length + ' businesses, ' + reviews.length + ' reviews');

  const byBiz = {};
  for (const d of reviews) {
    const f = d.fields || {};
    const bid = f.businessId && f.businessId.stringValue;
    if (!bid) continue;
    const status = (f.status && f.status.stringValue) || 'live';
    if (status !== 'live') continue;
    if (!byBiz[bid]) byBiz[bid] = [];
    byBiz[bid].push(num(f.rating));
  }

  let fixed = 0;
  for (const d of businesses) {
    const id = d.name.split('/').pop();
    const f = d.fields || {};
    const list = byBiz[id] || [];
    const wantCount = list.length;
    let wantRating = 0;
    if (wantCount > 0) {
      const sum = list.reduce((a, b) => a + b, 0);
      wantRating = Math.round((sum / wantCount) * 10) / 10;
    }
    const curRating = num(f.rating);
    const curCount = num(f.reviewCount);
    if (curRating === wantRating && curCount === wantCount) continue;

    console.log(
      '  ' + id + '  rating ' + curRating + ' -> ' + wantRating +
      '   reviews ' + curCount + ' -> ' + wantCount
    );
    if (COMMIT) {
      const mask = 'updateMask.fieldPaths=rating&updateMask.fieldPaths=reviewCount';
      const body = {
        fields: {
          rating: { doubleValue: wantRating },
          reviewCount: { integerValue: String(wantCount) },
        },
      };
      const res = await req('PATCH', '/businesses/' + id + '?' + mask, body);
      console.log('      PATCH status ' + res.status);
      if (res.status !== 200) console.log('      body: ' + JSON.stringify(res.body).slice(0, 300));
    }
    fixed++;
  }
  console.log(COMMIT ? '\npatched ' + fixed + ' business(es)' : '\ndry run: ' + fixed + ' would change (re-run with --commit)');
})();
