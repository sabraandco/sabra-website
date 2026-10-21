// Fetches GA4 Analytics data for sabraandcompany.com.
// Returns sessions, users, pageviews, daily breakdown, traffic sources,
// top pages and conversion events for the last 28 days.
// Requires Google OAuth (connect via Setup tab) and GA4_PROPERTY_ID env var.

const { getToken } = require('./google-token');

async function ga4(token, propertyId, body) {
  const r = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
  return r.json();
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  // ?status=1 — lightweight token-only check used by the SEO dashboard
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

  const range28 = { startDate: '28daysAgo', endDate: 'today' };

  try {
    const [summaryData, dailyData, sourcesData, pagesData, eventsData] = await Promise.all([
      // Overall summary
      ga4(token, propertyId, {
        dateRanges: [range28],
        metrics: [
          { name: 'sessions' },
          { name: 'activeUsers' },
          { name: 'screenPageViews' },
          { name: 'bounceRate' },
          { name: 'averageSessionDuration' },
        ],
      }),
      // Daily breakdown for chart
      ga4(token, propertyId, {
        dateRanges: [range28],
        dimensions: [{ name: 'date' }],
        metrics: [{ name: 'activeUsers' }, { name: 'sessions' }],
        orderBys: [{ dimension: { dimensionName: 'date' } }],
        limit: 30,
      }),
      // Traffic sources
      ga4(token, propertyId, {
        dateRanges: [range28],
        dimensions: [{ name: 'sessionDefaultChannelGroup' }],
        metrics: [{ name: 'sessions' }],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        limit: 8,
      }),
      // Top pages with avg time
      ga4(token, propertyId, {
        dateRanges: [range28],
        dimensions: [{ name: 'pagePath' }],
        metrics: [
          { name: 'screenPageViews' },
          { name: 'activeUsers' },
          { name: 'averageSessionDuration' },
        ],
        orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
        limit: 10,
      }),
      // Conversion events
      ga4(token, propertyId, {
        dateRanges: [range28],
        dimensions: [{ name: 'eventName' }],
        metrics: [{ name: 'eventCount' }],
        dimensionFilter: {
          filter: {
            fieldName: 'eventName',
            inListFilter: { values: ['quote_request', 'phone_tap', 'generate_lead', 'contact'] },
          },
        },
        limit: 20,
      }),
    ]);

    if (summaryData.error) {
      return res.status(400).json({ ok: false, error: summaryData.error.message });
    }

    // Summary
    const row = (summaryData.rows && summaryData.rows[0] && summaryData.rows[0].metricValues) || [];
    const summary = {
      sessions: parseInt(row[0]?.value || '0', 10),
      users: parseInt(row[1]?.value || '0', 10),
      pageviews: parseInt(row[2]?.value || '0', 10),
      bounceRate: parseFloat(row[3]?.value || '0'),
      avgDuration: parseFloat(row[4]?.value || '0'),
    };

    // Daily data for chart
    const daily = (dailyData.rows || []).map(r => ({
      date: r.dimensionValues[0].value,           // YYYYMMDD
      users: parseInt(r.metricValues[0].value, 10),
      sessions: parseInt(r.metricValues[1].value, 10),
    }));

    // Traffic sources
    const sources = (sourcesData.rows || []).map(r => ({
      channel: r.dimensionValues[0].value,
      sessions: parseInt(r.metricValues[0].value, 10),
    }));

    // Top pages
    const pages = (pagesData.rows || []).map(r => ({
      path: r.dimensionValues[0].value,
      views: parseInt(r.metricValues[0].value, 10),
      users: parseInt(r.metricValues[1].value, 10),
      avgTime: parseFloat(r.metricValues[2].value || '0'),
    }));

    // Conversion events
    const eventMap = {};
    (eventsData.rows || []).forEach(r => {
      eventMap[r.dimensionValues[0].value] = parseInt(r.metricValues[0].value, 10);
    });
    const conversions = {
      quoteRequests: (eventMap['quote_request'] || 0) + (eventMap['generate_lead'] || 0) + (eventMap['contact'] || 0),
      phoneTaps: eventMap['phone_tap'] || 0,
    };

    return res.status(200).json({ ok: true, summary, daily, sources, pages, conversions });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'Analytics request failed: ' + e.message });
  }
};
