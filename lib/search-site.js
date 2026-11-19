// Finds how sabraandcompany.com is set up in Search Console for the connected
// Google account: a domain property (sc-domain:sabraandcompany.com) or a URL
// prefix (https://www.sabraandcompany.com/ and variants). Used by
// api/search-console.js and api/weekly-report.js.

const PREFER = [
  'sc-domain:sabraandcompany.com',
  'https://www.sabraandcompany.com/',
  'https://sabraandcompany.com/',
  'http://www.sabraandcompany.com/',
  'http://sabraandcompany.com/',
];

async function findSearchSite(token) {
  const r = await fetch('https://searchconsole.googleapis.com/webmasters/v3/sites', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error((j.error && j.error.message) || `Search Console answered ${r.status}`);
  const usable = (j.siteEntry || []).filter(s => s.permissionLevel && s.permissionLevel !== 'siteUnverifiedUser');
  for (const want of PREFER) {
    const hit = usable.find(s => s.siteUrl === want);
    if (hit) return hit.siteUrl;
  }
  const loose = usable.find(s => /sabraandcompany\.com/i.test(s.siteUrl));
  if (loose) return loose.siteUrl;
  const seen = (j.siteEntry || []).map(s => s.siteUrl).join(', ') || 'none';
  throw new Error(`The connected Google account has no verified Search Console property for sabraandcompany.com (it can see: ${seen}).`);
}

module.exports = { findSearchSite };
