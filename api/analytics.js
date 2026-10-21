// Fetches GA4 Analytics data for sabraandcompany.com.
// Returns sessions, users, pageviews, bounce rate for the last 28 days.
// Requires Google OAuth (connect via Setup tab) and GA4_PROPERTY_ID env var.

const { getToken } = require('./google-token');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  // ?status=1 — lightweight token-only check used by the SEO dashboard
  // to determine whether Google is connected, without requiring GA4_PROPERTY_ID.
  if (req.query.status === '1') {
    res.setHeader('Cache-Control', 'no-store');
    try {
      await getToken(req);
      return res.status(200).json({ connected: true });
    } catch (e) {
      return res.status(200).json({ connected: false });
    }
  }

  const propertyId = process.env.GA4_PROPERTY_ID;
  if (!propertyId) {
    return res.status(500).json({ ok: false, error: 'GA4_PROPERTY_ID not configured in Vercel environment variables.' });
  }

  let token, setCookies;
  try {
    ({ token, setCookies } = await getToken(req));
  } catch (e) {
    return res.status(e.status || 500).json({ ok: false, error: e.message });
  }

  if (setCookies && setCookies.length) res.setHeader('Set-Cookie', setCookies);

  try {
    // GA4 Data API
    const r = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          dateRanges: [{ startDate: '28daysAgo', endDate: 'yesterday' }],
          metrics: [
            { name: 'sessions' },
            { name: 'activeUsers' },
            { name: 'screenPageViews' },
            { name: 'bounceRate' },
            { name: 'averageSessionDuration' },
          ],
        }),
      }
    );

    const data = await r.json();

    if (data.error) {
      return res.status(400).json({ ok: false, error: data.error.message });
    }

    const row = (data.rows && data.rows[0] && data.rows[0].metricValues) || [];
    const summary = {
      sessions: parseInt(row[0]?.value || '0', 10),
      users: parseInt(row[1]?.value || '0', 10),
      pageviews: parseInt(row[2]?.value || '0', 10),
      bounceRate: parseFloat(row[3]?.value || '0'),
      avgDuration: parseFloat(row[4]?.value || '0'),
    };

    // Top pages by views
    const pagesR = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          dateRanges: [{ startDate: '28daysAgo', endDate: 'yesterday' }],
          dimensions: [{ name: 'pagePath' }],
          metrics: [{ name: 'screenPageViews' }, { name: 'activeUsers' }],
          orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
          limit: 15,
        }),
      }
    );

    const pagesData = await pagesR.json();
    const pages = (pagesData.rows || []).map(r => ({
      path: r.dimensionValues[0].value,
      views: parseInt(r.metricValues[0].value, 10),
      users: parseInt(r.metricValues[1].value, 10),
    }));

    return res.status(200).json({ ok: true, summary, pages });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'Analytics request failed: ' + e.message });
  }
};
