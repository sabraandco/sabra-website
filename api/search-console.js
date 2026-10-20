// Fetches Search Console performance data for sabraandcompany.com.
// Returns top queries and per-page clicks/impressions for the last 28 days.
// Requires Google OAuth (connect via Setup tab in SEO dashboard).

const { getToken } = require('./google-token');

const SITE = 'https://www.sabraandcompany.com/';
const DAYS = 28;

function dateStr(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

async function scPost(token, body) {
  const r = await fetch(
    `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SITE)}/searchAnalytics/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        startDate: dateStr(DAYS),
        endDate: dateStr(1),
        rowLimit: 25,
        ...body,
      }),
    }
  );
  return r.json();
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  let token, setCookies;
  try {
    ({ token, setCookies } = await getToken(req));
  } catch (e) {
    return res.status(e.status || 500).json({ ok: false, error: e.message });
  }

  if (setCookies && setCookies.length) res.setHeader('Set-Cookie', setCookies);

  try {
    // Top queries
    const [queriesData, pagesData] = await Promise.all([
      scPost(token, { dimensions: ['query'] }),
      scPost(token, { dimensions: ['page'] }),
    ]);

    if (queriesData.error) {
      return res.status(400).json({ ok: false, error: queriesData.error.message });
    }

    const queries = (queriesData.rows || []).map(r => ({
      query: r.keys[0],
      clicks: r.clicks,
      impressions: r.impressions,
      ctr: r.ctr,
      position: r.position,
    }));

    const pages = (pagesData.rows || []).map(r => ({
      page: r.keys[0],
      clicks: r.clicks,
      impressions: r.impressions,
      ctr: r.ctr,
      position: r.position,
    }));

    return res.status(200).json({ ok: true, queries, pages });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'Search Console request failed: ' + e.message });
  }
};
