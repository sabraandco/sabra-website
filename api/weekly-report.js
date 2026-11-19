// Weekly site report, emailed every Monday morning (Vercel cron, see vercel.json).
//
// Covers, each compared with the week before:
//   1. Traffic: visitors, sessions, top traffic sources (Google Analytics)
//   2. Top 10 pages (Google Analytics)
//   3. Conversions: inquiry form submissions, phone and email taps
//   4. Search Console: top search terms, clicks, impressions, position,
//      and any pages Google has not indexed
//   5. PageSpeed: mobile and desktop scores and Core Web Vitals, homepage
//   6. SEO, AEO and GEO scores and open issues (same audit as the dashboard)
//
// Runs as:
//   GET  (Vercel cron)                   builds and emails the report
//   GET  ?preview=1  (admin signed in)   returns the email as a web page
//   POST ?send=1     (admin signed in)   emails it now
//
// Environment variables: ADMIN_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
// GA4_PROPERTY_ID, RESEND_API_KEY, CONTACT_FROM, CONTACT_TO (or REPORT_TO),
// optional CRON_SECRET.

const crypto = require('crypto');
const Audit = require('../admin/audit-core.js');
const store = require('../lib/site-store');
const { accessFromRefresh } = require('../lib/google-token');

const SITE = 'https://www.sabraandcompany.com';
const GSC_SITE = 'https://www.sabraandcompany.com/';
const SUBJECT = 'Sabra & Co weekly site report';

// ------------------------------------------------------------------ helpers
function verifySession(req) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return false;
  const m = (req.headers.cookie || '').match(/sc_admin=([^;]+)/);
  if (!m) return false;
  const [expStr, sig] = decodeURIComponent(m[1]).split('.');
  if (!expStr || !sig) return false;
  const expected = crypto.createHmac('sha256', secret).update(expStr).digest('hex');
  if (sig.length !== expected.length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
  return Number(expStr) > Date.now();
}

function isCron(req) {
  const auth = req.headers.authorization || '';
  if (process.env.CRON_SECRET) return auth === `Bearer ${process.env.CRON_SECRET}`;
  return /vercel-cron/i.test(req.headers['user-agent'] || '');
}

async function safe(fn, fallback) {
  try { return await fn(); } catch (e) { return Object.assign({ error: e.message || String(e) }, fallback || {}); }
}

async function fetchJson(url, opts = {}, ms = 25000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(url, { ...opts, signal: ac.signal });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) throw new Error((j.error && (j.error.message || j.error)) || `HTTP ${r.status}`);
    return j;
  } finally { clearTimeout(t); }
}

async function fetchText(url) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 15000);
  try {
    const r = await fetch(url, { headers: { 'Cache-Control': 'no-cache', 'User-Agent': 'SabraCo-WeeklyReport' }, signal: ac.signal });
    return r.ok ? await r.text() : null;
  } catch (e) { return null; } finally { clearTimeout(t); }
}

function ymd(daysAgo) {
  const d = new Date(Date.now() - daysAgo * 86400000);
  return d.toISOString().slice(0, 10);
}
function niceDate(daysAgo) {
  return new Date(Date.now() - daysAgo * 86400000)
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Denver' });
}

// ------------------------------------------------------------------ Google Analytics
async function ga(token, body) {
  const id = process.env.GA4_PROPERTY_ID;
  if (!id) throw new Error('GA4_PROPERTY_ID is not set in Vercel');
  return fetchJson(`https://analyticsdata.googleapis.com/v1beta/properties/${id}:runReport`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
const num = v => Number(v || 0);
const rowsOf = (j, f) => (j.rows || []).map(f);

async function analytics(token) {
  const weeks = [
    { startDate: '7daysAgo', endDate: 'yesterday' },
    { startDate: '14daysAgo', endDate: '8daysAgo' },
  ];
  const one = async range => {
    const [sum, src, pages, thanks, events] = await Promise.all([
      ga(token, { dateRanges: [range], metrics: [{ name: 'activeUsers' }, { name: 'sessions' }, { name: 'screenPageViews' }] }),
      ga(token, { dateRanges: [range], dimensions: [{ name: 'sessionDefaultChannelGroup' }], metrics: [{ name: 'sessions' }],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }], limit: 20 }),
      ga(token, { dateRanges: [range], dimensions: [{ name: 'pagePath' }], metrics: [{ name: 'screenPageViews' }],
        orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }], limit: 100 }),
      // every inquiry form sends people to thank-you.html when it goes through
      ga(token, { dateRanges: [range], dimensions: [{ name: 'pagePath' }], metrics: [{ name: 'screenPageViews' }],
        dimensionFilter: { filter: { fieldName: 'pagePath', stringFilter: { matchType: 'BEGINS_WITH', value: '/thank-you' } } } }),
      ga(token, { dateRanges: [range], dimensions: [{ name: 'eventName' }], metrics: [{ name: 'eventCount' }],
        dimensionFilter: { filter: { fieldName: 'eventName', inListFilter: { values: ['phone_tap', 'email_tap'] } } } }),
    ]);
    const m = (sum.rows && sum.rows[0] && sum.rows[0].metricValues) || [];
    const ev = {};
    rowsOf(events, r => { ev[r.dimensionValues[0].value] = num(r.metricValues[0].value); });
    const pageMap = {};
    rowsOf(pages, r => {
      let p = r.dimensionValues[0].value.replace(/\?.*$/, '');
      if (p === '/index.html') p = '/';
      pageMap[p] = (pageMap[p] || 0) + num(r.metricValues[0].value);
    });
    return {
      visitors: num(m[0] && m[0].value), sessions: num(m[1] && m[1].value), views: num(m[2] && m[2].value),
      sources: Object.fromEntries(rowsOf(src, r => [r.dimensionValues[0].value, num(r.metricValues[0].value)])),
      pages: pageMap,
      inquiries: rowsOf(thanks, r => num(r.metricValues[0].value)).reduce((a, b) => a + b, 0),
      phoneTaps: ev.phone_tap || 0, emailTaps: ev.email_tap || 0,
    };
  };
  const [cur, prev] = await Promise.all(weeks.map(one));
  return { cur, prev };
}

// ------------------------------------------------------------------ Search Console
async function gsc(token, body) {
  return fetchJson(`https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(GSC_SITE)}/searchAnalytics/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function searchConsole(token, urls) {
  // Search Console data runs about 2 days behind, so the week ends 3 days ago
  const cur = { startDate: ymd(9), endDate: ymd(3) };
  const prev = { startDate: ymd(16), endDate: ymd(10) };
  const total = j => { const r = (j.rows || [])[0] || {}; return { clicks: r.clicks || 0, impressions: r.impressions || 0, position: r.position || 0 }; };
  const [tc, tp, qc, qp] = await Promise.all([
    gsc(token, { ...cur }), gsc(token, { ...prev }),
    gsc(token, { ...cur, dimensions: ['query'], rowLimit: 10 }),
    gsc(token, { ...prev, dimensions: ['query'], rowLimit: 250 }),
  ]);
  const prevQ = Object.fromEntries((qp.rows || []).map(r => [r.keys[0], r]));
  const queries = (qc.rows || []).map(r => ({
    query: r.keys[0], clicks: r.clicks, impressions: r.impressions, position: r.position,
    prev: prevQ[r.keys[0]] || null,
  }));

  // indexing: ask Google about every page in the sitemap
  const inspect = await Promise.all(urls.map(u => safe(() => fetchJson(
    'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ inspectionUrl: u, siteUrl: GSC_SITE }),
    }).then(j => {
      const s = (j.inspectionResult && j.inspectionResult.indexStatusResult) || {};
      return { url: u, verdict: s.verdict || 'UNKNOWN', state: s.coverageState || 'Unknown', lastCrawl: s.lastCrawlTime || '' };
    }), { url: u, verdict: 'UNKNOWN', state: 'Could not check' })));

  const sm = await safe(() => fetchJson(`https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(GSC_SITE)}/sitemaps`, {
    headers: { Authorization: `Bearer ${token}` },
  }), {});
  const sitemaps = (sm.sitemap || []).map(s => ({ path: s.path, errors: num(s.errors), warnings: num(s.warnings), lastDownloaded: s.lastDownloaded || '' }));

  return {
    range: { cur: `${niceDate(9)} to ${niceDate(3)}` },
    cur: total(tc), prev: total(tp), queries, inspect, sitemaps,
  };
}

// ------------------------------------------------------------------ PageSpeed
async function pagespeed(strategy, key) {
  const q = new URLSearchParams({ url: SITE + '/', strategy, category: 'performance' });
  if (key) q.set('key', key);
  const j = await fetchJson(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${q}`, {}, 40000);
  const a = (j.lighthouseResult && j.lighthouseResult.audits) || {};
  const f = (j.loadingExperience && j.loadingExperience.metrics) || {};
  const perf = j.lighthouseResult && j.lighthouseResult.categories && j.lighthouseResult.categories.performance;
  const field = k => f[k] ? { value: f[k].percentile, rating: f[k].category } : null;
  return {
    score: perf && perf.score != null ? Math.round(perf.score * 100) : null,
    lab: {
      lcp: a['largest-contentful-paint'] && a['largest-contentful-paint'].numericValue,
      cls: a['cumulative-layout-shift'] && a['cumulative-layout-shift'].numericValue,
      tbt: a['total-blocking-time'] && a['total-blocking-time'].numericValue,
    },
    field: {
      lcp: field('LARGEST_CONTENTFUL_PAINT_MS'),
      inp: field('INTERACTION_TO_NEXT_PAINT'),
      cls: field('CUMULATIVE_LAYOUT_SHIFT_SCORE'),
    },
  };
}

// ------------------------------------------------------------------ site audit
// fetch every page in the sitemap now; score them once PageSpeed is back
async function fetchSite() {
  const [sitemap, robots, llms, blog] = await Promise.all(['/sitemap.xml', '/robots.txt', '/llms.txt', '/blog.html'].map(p => fetchText(SITE + p)));
  const urls = [];
  (sitemap || '').replace(/<loc>\s*([^<\s]+)\s*<\/loc>/g, (_, u) => { urls.push(u.trim()); });
  const site = { sitemap: urls, robots: robots || '', llms, blog: blog || '' };
  const html = await Promise.all(urls.map(u => fetchText(SITE + Audit.slugOf(u))));
  return { urls, site, html };
}

function scoreSite(raw, homeMobileScore) {
  const { DOMParser } = require('linkedom');
  const { urls, site, html } = raw;
  const speed = {};
  if (homeMobileScore != null) { speed[SITE + '/'] = homeMobileScore; speed[SITE] = homeMobileScore; }
  const pages = urls.map((u, i) => html[i] ? Audit.auditPage(u, html[i], site, { DOMParser, speed }) : null).filter(Boolean);
  const summary = Audit.summarize(pages);
  const recs = Audit.buildRecs(pages, { llms: site.llms !== null, blogLinks: Audit.blogLinks(site.blog), sitemap: urls });
  return { urls, pages, summary, recs };
}

// ------------------------------------------------------------------ gather everything
// Everything runs at once so the report finishes well inside Vercel's 60 seconds.
// Each step's timing is saved as weekly_debug so a failed run can be diagnosed.
async function gather(log) {
  const out = { generatedAt: new Date().toISOString(), week: `${niceDate(7)} to ${niceDate(1)}` };
  const t0 = Date.now();
  const mark = (name, extra) => { log[name] = Object.assign({ ms: Date.now() - t0 }, extra || {}); };

  const keyP = safe(async () => ((await store.get('psi_key')) || {}).key || '', {});
  const speedP = keyP.then(k => {
    const key = typeof k === 'string' ? k : '';
    return Promise.all([safe(() => pagespeed('mobile', key)), safe(() => pagespeed('desktop', key))]);
  }).then(r => { mark('pagespeed', { mobile: r[0].score, desktop: r[1].score, error: r[0].error || r[1].error }); return r; });

  const siteP = safe(() => fetchSite()).then(r => { mark('site', { pages: r.urls ? r.urls.length : 0, error: r.error }); return r; });

  const googleP = safe(() => store.loadGoogle(), {}).then(async g => {
    if (!g || !g.refreshToken) {
      out.googleError = g && g.error ? 'The saved Google connection could not be read.' : 'Google is not connected for the report yet.';
      mark('google', { error: out.googleError }); return null;
    }
    const t = await safe(() => accessFromRefresh(g.refreshToken), {});
    if (typeof t !== 'string') {
      out.googleError = 'Google turned down the saved connection, so it needs reconnecting.';
      mark('google', { error: t.error }); return null;
    }
    mark('google'); return t;
  });

  const analyticsP = googleP.then(t => t ? safe(() => analytics(t)) : null)
    .then(r => { mark('analytics', { error: r && r.error }); return r; });
  const searchP = Promise.all([googleP, siteP]).then(([t, site]) => t ? safe(() => searchConsole(t, site.urls || [])) : null)
    .then(r => { mark('search', { error: r && r.error }); return r; });
  const lastP = safe(() => store.get('weekly_last'), {});

  const [[mobile, desktop], site, an, sc, last] = await Promise.all([speedP, siteP, analyticsP, searchP, lastP]);
  out.speed = { mobile, desktop };
  out.audit = site.error ? site : await safe(async () => scoreSite(site, mobile && mobile.score != null ? mobile.score : null));
  mark('audit', { error: out.audit.error });
  out.analytics = an; out.search = sc; out.last = last;
  return out;
}

function snapshotOf(d) {
  const s = (d.audit && d.audit.summary) || {};
  const ins = (d.search && d.search.inspect) || [];
  return {
    at: d.generatedAt,
    scores: { seo: s.seo, aeo: s.aeo, geo: s.geo },
    speed: { mobile: d.speed.mobile && d.speed.mobile.score, desktop: d.speed.desktop && d.speed.desktop.score },
    indexed: ins.length ? ins.filter(i => i.verdict === 'PASS').length : null,
    issues: d.audit && d.audit.recs ? d.audit.recs.length : null,
  };
}

// ------------------------------------------------------------------ email
const C = { page: '#F6F5F2', card: '#FFFFFF', ink: '#43352A', ink2: '#5A4B3F', taupe: '#706458', rule: '#E5E1DA',
  sage: '#5F7466', mauve: '#8C6E76', chrome: '#4A3A2E', chromeText: '#FBF6EF' };
const SERIF = "'Cormorant Garamond',Georgia,'Times New Roman',serif";
const SANS = "'Instrument Sans','Helvetica Neue',Helvetica,Arial,sans-serif";
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmt = n => n == null ? '…' : Number(n).toLocaleString('en-US', { maximumFractionDigits: 1 });

// change vs last week; lowerBetter flips the colour (search position)
function delta(cur, prev, opts = {}) {
  if (cur == null || prev == null) return '';
  const diff = cur - prev;
  if (Math.abs(diff) < (opts.eps || 0.0001)) return `<span style="color:${C.taupe}">same as last week</span>`;
  const good = opts.lowerBetter ? diff < 0 : diff > 0;
  const arrow = diff > 0 ? '&#9650;' : '&#9660;';
  let txt;
  if (opts.points) txt = `${arrow} ${fmt(Math.abs(diff))}${opts.unit || ''}`;
  else if (!prev) txt = `${arrow} new`;
  else txt = `${arrow} ${Math.round(Math.abs(diff) / prev * 100)}%`;
  return `<span style="color:${good ? C.sage : C.mauve};white-space:nowrap">${txt}</span>`;
}

function section(n, title, body) {
  return `<tr><td style="padding:0 0 16px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.card};border:1px solid ${C.rule};border-radius:10px">
  <tr><td style="padding:22px 22px 6px">
    <div style="font-family:${SANS};font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:${C.taupe}">${n}</div>
    <div style="font-family:${SERIF};font-size:24px;line-height:1.2;color:${C.ink};margin:4px 0 12px">${title}</div>
  </td></tr>
  <tr><td style="padding:0 22px 20px;font-family:${SANS};font-size:14px;line-height:1.55;color:${C.ink2}">${body}</td></tr>
  </table></td></tr>`;
}

function stats(items) {
  // items: [label, value, deltaHtml]; two per row so it holds up on a phone
  let rows = '';
  for (let i = 0; i < items.length; i += 2) {
    rows += '<tr>' + items.slice(i, i + 2).map(([l, v, d]) => `<td width="50%" valign="top" style="padding:10px 10px 10px 0">
      <div style="font-family:${SANS};font-size:12px;color:${C.taupe}">${l}</div>
      <div style="font-family:${SERIF};font-size:30px;line-height:1.1;color:${C.ink}">${v}</div>
      <div style="font-family:${SANS};font-size:12px;margin-top:2px">${d || '&nbsp;'}</div></td>`).join('') + '</tr>';
  }
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>`;
}

function table(head, rows) {
  if (!rows.length) return `<p style="margin:6px 0 0;color:${C.taupe}">Nothing to show yet.</p>`;
  const th = head.map((h, i) => `<td style="padding:6px 0;border-bottom:1px solid ${C.rule};font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:${C.taupe}${i ? ';text-align:right;padding-left:10px' : ''}">${h}</td>`).join('');
  const tr = rows.map(r => '<tr>' + r.map((c, i) => `<td style="padding:8px 0;border-bottom:1px solid ${C.rule};vertical-align:top${i ? ';text-align:right;padding-left:10px;white-space:nowrap' : ''}">${c}</td>`).join('') + '</tr>').join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-family:${SANS};font-size:13px;color:${C.ink2}"><tr>${th}</tr>${tr}</table>`;
}

const note = t => `<p style="margin:12px 0 0;font-size:12px;color:${C.taupe}">${t}</p>`;
const warn = t => `<p style="margin:0;padding:12px 14px;background:#F4EEEC;border-radius:8px;color:${C.ink}">${t}</p>`;

function renderEmail(d) {
  const A = d.analytics, S = d.search, last = d.last && !d.last.error ? d.last : null;
  const audit = d.audit && !d.audit.error ? d.audit : null;
  const names = {};
  (audit ? audit.pages : []).forEach(p => { names[p.slug] = p.name; });
  const pageName = p => names[p] || (p === '/' ? 'Homepage' : p.replace(/^\//, '').replace(/\.html$/, '').replace(/-/g, ' '));
  const reconnect = `${esc(d.googleError || 'Google data is unavailable this week.')} Open your <a href="${SITE}/admin/seo.html" style="color:${C.sage}">dashboard</a>, and if it says Google is not connected, click Connect Google. Next Monday's report will pick it up.`;
  const blocks = [];

  // 1. traffic
  if (A && !A.error) {
    const src = Object.keys(A.cur.sources).sort((a, b) => A.cur.sources[b] - A.cur.sources[a]).slice(0, 6);
    blocks.push(section('1', 'Traffic', stats([
      ['Visitors', fmt(A.cur.visitors), delta(A.cur.visitors, A.prev.visitors)],
      ['Sessions', fmt(A.cur.sessions), delta(A.cur.sessions, A.prev.sessions)],
    ]) + '<div style="height:10px"></div>' + table(['Top traffic sources', 'Sessions', 'vs last week'],
      src.map(s => [esc(s), fmt(A.cur.sources[s]), delta(A.cur.sources[s], A.prev.sources[s] || 0)]))));
    const top = Object.keys(A.cur.pages).sort((a, b) => A.cur.pages[b] - A.cur.pages[a]).slice(0, 10);
    blocks.push(section('2', 'Top pages', table(['Page', 'Views', 'vs last week'],
      top.map(p => [esc(pageName(p)), fmt(A.cur.pages[p]), delta(A.cur.pages[p], A.prev.pages[p] || 0)]))));
    blocks.push(section('3', 'Conversions', stats([
      ['Inquiry form submissions', fmt(A.cur.inquiries), delta(A.cur.inquiries, A.prev.inquiries)],
      ['Phone taps', fmt(A.cur.phoneTaps), delta(A.cur.phoneTaps, A.prev.phoneTaps)],
      ['Email taps', fmt(A.cur.emailTaps), delta(A.cur.emailTaps, A.prev.emailTaps)],
    ]) + note('Inquiries count every consultation request sent through the forms on your Contact page, homepage and gallery.' + (Date.now() < Date.parse('2026-12-08') ? ' Phone and email taps started tracking on November 19.' : ''))));
  } else {
    const msg = A && A.error ? `Google Analytics did not answer this week (${esc(A.error)}).` : reconnect;
    blocks.push(section('1 to 3', 'Traffic, top pages and conversions', warn(msg)));
  }

  // 4. search console
  if (S && !S.error) {
    const notIndexed = S.inspect.filter(i => i.verdict !== 'PASS');
    const smErr = S.sitemaps.filter(s => s.errors || s.warnings);
    let idx = `<div style="font-family:${SERIF};font-size:20px;color:${C.ink};margin:18px 0 6px">Indexing</div>`;
    idx += `<p style="margin:0">${S.inspect.length - notIndexed.length} of ${S.inspect.length} pages in your sitemap are in Google${last && last.indexed != null ? ' (' + last.indexed + ' last report)' : ''}.</p>`;
    if (notIndexed.length) idx += table(['Not indexed yet', 'Google says'], notIndexed.map(i => [esc(pageName(Audit.slugOf(i.url))), esc(String(i.state).replace(/\s+-\s+/g, ', '))]));
    if (smErr.length) idx += warn(smErr.map(s => `Sitemap ${esc(s.path)}: ${s.errors} errors, ${s.warnings} warnings.`).join('<br>'));
    else if (S.sitemaps.length) idx += note('No sitemap errors.');
    blocks.push(section('4', 'Google Search', stats([
      ['Clicks', fmt(S.cur.clicks), delta(S.cur.clicks, S.prev.clicks)],
      ['Impressions', fmt(S.cur.impressions), delta(S.cur.impressions, S.prev.impressions)],
      ['Average position', S.cur.position ? fmt(S.cur.position) : '…', delta(S.cur.position || null, S.prev.position || null, { lowerBetter: true, points: true, eps: 0.05 })],
    ]) + '<div style="height:10px"></div>' + table(['Top search terms', 'Clicks', 'Impr.', 'Position'],
      S.queries.map(q => [esc(q.query), fmt(q.clicks), fmt(q.impressions), fmt(q.position) + (q.prev ? '<br>' + delta(q.position, q.prev.position, { lowerBetter: true, points: true, eps: 0.05 }) : '')]))
      + note(`Search data covers ${S.range.cur}, since Google reports it about two days late. A lower position is better: 1 is the top result.`) + idx));
  } else {
    const msg = S && S.error ? `Search Console did not answer this week (${esc(S.error)}).` : reconnect;
    blocks.push(section('4', 'Google Search', warn(msg)));
  }

  // 5. pagespeed
  const sp = d.speed || {};
  const okSp = x => x && !x.error && x.score != null;
  if (okSp(sp.mobile) || okSp(sp.desktop)) {
    const m = okSp(sp.mobile) ? sp.mobile : null, dk = okSp(sp.desktop) ? sp.desktop : null;
    const rate = r => ({ FAST: 'Good', AVERAGE: 'Needs work', SLOW: 'Poor' }[r] || '');
    const src = m || dk;
    const f = src.field;
    let vitals;
    if (f.lcp || f.inp || f.cls) {
      vitals = table(['Core Web Vitals (real visitors, mobile)', 'Result'], [
        f.lcp && ['Largest content loads (LCP)', `${(f.lcp.value / 1000).toFixed(1)}s, ${rate(f.lcp.rating)}`],
        f.inp && ['Response to taps (INP)', `${f.inp.value}ms, ${rate(f.inp.rating)}`],
        f.cls && ['Layout shift (CLS)', `${(f.cls.value / 100).toFixed(2)}, ${rate(f.cls.rating)}`],
      ].filter(Boolean));
    } else {
      const L = src.lab;
      const g = (v, good, poor) => v == null ? '' : v <= good ? 'Good' : v <= poor ? 'Needs work' : 'Poor';
      vitals = table(['Core Web Vitals (lab test, mobile)', 'Result'], [
        ['Largest content loads (LCP)', L.lcp == null ? '…' : `${(L.lcp / 1000).toFixed(1)}s, ${g(L.lcp, 2500, 4000)}`],
        ['Layout shift (CLS)', L.cls == null ? '…' : `${L.cls.toFixed(2)}, ${g(L.cls, 0.1, 0.25)}`],
        ['Blocking time (TBT)', L.tbt == null ? '…' : `${Math.round(L.tbt)}ms, ${g(L.tbt, 200, 600)}`],
      ]) + note('Google does not have enough real-visitor data for your site yet, so these come from a lab test. Real-visitor numbers appear here once traffic grows.');
    }
    const ls = last && last.speed;
    blocks.push(section('5', 'PageSpeed, homepage', stats([
      ['Mobile', m ? m.score : '…', m && ls ? delta(m.score, ls.mobile, { points: true }) : ''],
      ['Desktop', dk ? dk.score : '…', dk && ls ? delta(dk.score, ls.desktop, { points: true }) : ''],
    ]) + '<div style="height:10px"></div>' + vitals));
  } else {
    blocks.push(section('5', 'PageSpeed, homepage', warn('PageSpeed could not test the homepage this week. Google limits free tests; if this keeps happening, add a PageSpeed API key in the dashboard\'s PageSpeed tab.')));
  }

  // 6. scores and issues
  if (audit) {
    const s = audit.summary, ls = last && last.scores;
    const recs = audit.recs;
    const top = recs.filter(r => r.pri !== 'low');
    const low = recs.length - top.length;
    const label = { high: 'High', medium: 'Medium' };
    let issues = top.length ? top.map(r => `<tr><td style="padding:10px 0;border-bottom:1px solid ${C.rule}">
        <span style="display:inline-block;font-size:11px;padding:2px 8px;border-radius:999px;background:${r.pri === 'high' ? '#F1E6E8' : '#ECEFEA'};color:${r.pri === 'high' ? C.mauve : C.sage}">${label[r.pri]}</span>
        <div style="font-weight:600;color:${C.ink};margin:6px 0 2px">${esc(r.title)}</div>
        <div style="font-size:13px">${esc(r.body)}</div></td></tr>`).join('') : '';
    issues = issues ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-family:${SANS};font-size:14px;color:${C.ink2}">${issues}</table>`
      : `<p style="margin:0">No high or medium priority issues. Nice work.</p>`;
    blocks.push(section('6', 'SEO, AEO and GEO', stats([
      ['SEO', s.seo, ls ? delta(s.seo, ls.seo, { points: true }) : ''],
      ['AEO', s.aeo, ls ? delta(s.aeo, ls.aeo, { points: true }) : ''],
      ['GEO', s.geo, ls ? delta(s.geo, ls.geo, { points: true }) : ''],
      ['Pages checked', s.pages, ''],
    ]) + `<div style="font-family:${SERIF};font-size:20px;color:${C.ink};margin:14px 0 2px">What the dashboard flags</div>` + issues
      + (low ? note(`Plus ${low} low priority suggestion${low > 1 ? 's' : ''} in the dashboard.`) : '')));
  } else {
    blocks.push(section('6', 'SEO, AEO and GEO', warn('The site check could not run this week.')));
  }

  const since = last && last.at ? `Changes are compared with the week before${last.at ? ', and scores with your last report (' + new Date(last.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Denver' }) + ')' : ''}.`
    : 'Changes are compared with the week before. Score changes start with next week\'s report.';

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${SUBJECT}</title></head>
<body style="margin:0;padding:0;background:${C.page}">
<div style="display:none;max-height:0;overflow:hidden">Your site this week: traffic, search, speed and SEO scores.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.page}"><tr><td align="center" style="padding:20px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px">
<tr><td style="background:${C.chrome};border-radius:10px;padding:22px 22px 20px">
  <div style="font-family:${SANS};font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#D9CFC3">Sabra &amp; Co</div>
  <div style="font-family:${SERIF};font-size:30px;line-height:1.15;color:${C.chromeText};margin-top:6px">Weekly site report</div>
  <div style="font-family:${SANS};font-size:13px;color:#D9CFC3;margin-top:6px">${esc(d.week)}</div>
</td></tr>
<tr><td style="height:16px"></td></tr>
${blocks.join('\n')}
<tr><td style="padding:4px 6px 24px;font-family:${SANS};font-size:12px;line-height:1.6;color:${C.taupe};text-align:center">
  ${since}<br>
  <a href="${SITE}/admin/seo.html" style="color:${C.sage}">Open your dashboard</a>
</td></tr>
</table></td></tr></table></body></html>`;
}

// ------------------------------------------------------------------ send
async function sendEmail(html) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.CONTACT_FROM || process.env.NEWSLETTER_FROM;
  const to = (process.env.REPORT_TO || process.env.CONTACT_TO || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!key || !from || !to.length) throw new Error('Email is not configured (RESEND_API_KEY, CONTACT_FROM, CONTACT_TO).');
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject: SUBJECT, html }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.message || `Resend error ${r.status}`);
  return j.id;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const cron = isCron(req);
  const admin = verifySession(req);
  if (!cron && !admin) return res.status(401).json({ ok: false, error: 'Sign in to the dashboard first.' });

  const preview = admin && req.query.preview === '1';
  const sendNow = admin && req.method === 'POST' && req.query.send === '1';
  if (!cron && !preview && !sendNow) return res.status(400).json({ ok: false, error: 'Use ?preview=1 or POST ?send=1.' });

  try {
    if (cron) {
      // one report a week, even if the cron fires twice
      const sent = await safe(() => store.get('weekly_sent'), {});
      if (sent && sent.at && Date.now() - Date.parse(sent.at) < 5 * 86400000) {
        return res.status(200).json({ ok: true, skipped: 'Already sent this week.' });
      }
    }
    const log = { startedAt: new Date().toISOString(), mode: cron ? 'cron' : preview ? 'preview' : 'send' };
    await safe(() => store.put('weekly_debug', log));
    const data = await gather(log);
    const html = renderEmail(data);
    log.renderedMs = Date.now() - Date.parse(log.startedAt);
    safe(() => store.put('weekly_debug', log));
    if (preview) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(200).send(html);
    }
    const id = await sendEmail(html);
    await safe(() => store.put('weekly_last', snapshotOf(data)));
    if (cron) await safe(() => store.put('weekly_sent', { at: new Date().toISOString(), id }));
    return res.status(200).json({ ok: true, id, googleConnected: !data.googleError });
  } catch (e) {
    await safe(() => store.put('weekly_debug', { failedAt: new Date().toISOString(), error: e.message || String(e), stack: String(e.stack || '').slice(0, 800) }));
    return res.status(500).json({ ok: false, error: e.message || String(e) });
  }
};

module.exports._internals = { renderEmail, snapshotOf, delta };
