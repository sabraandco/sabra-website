// Free guide requests from /builder-grade-guide.html.
// Reached through /api/subscribe?guide=1, because the Vercel Hobby plan allows 12 functions and
// the site already uses all 12. Regular newsletter signups never reach this file.
//
//   POST ?guide=1 { email, name? }  sends the guide email. New people join the Newsletter
//                                   segment. Existing contacts can request it too, and an
//                                   earlier unsubscribe is respected.
//   GET  ?guide=1&e=<email>&t=<token>   records the download, then opens the PDF.
//
// Environment variables in Vercel:
//   RESEND_API_KEY, RESEND_SEGMENT_ID, NEWSLETTER_FROM (or CONTACT_FROM)   already set
//   RESEND_GUIDE_SEGMENT_ID            everyone who requests the guide
//   RESEND_GUIDE_NEW_SEGMENT_ID        people who joined the newsletter through the guide
//   RESEND_GUIDE_DOWNLOAD_SEGMENT_ID   people who opened the download link
// The three guide segments only power tracking. If one is missing, the guide still sends.

const crypto = require('crypto');
const { tokenFor } = require('../api/unsubscribe.js');

const SITE = 'https://www.sabraandcompany.com';
const PDF_PATH = '/guides/7-ways-builder-grade-home-feel-custom.pdf';
const GUIDE_TITLE = '7 Ways to Make a Builder-Grade Home Feel Custom';
const ADDRESS = '13395 Voyager Parkway, Suite 130 #722, Colorado Springs, CO 80921';

const C = { ink: '#1E1A16', text: '#3A2E24', muted: '#6D6154', cream: '#F5F0E8', paper: '#FFFDF9', rule: '#E3DACC' };
const SERIF = "'Cormorant',Georgia,'Times New Roman',serif";
const SANS = "'Jost','Helvetica Neue',Helvetica,Arial,sans-serif";
const P = 'margin:0 0 18px;font-family:' + SANS + ';font-size:16px;line-height:1.7;color:' + C.text;

// Matches the signature on Sabra's sent email. Photo is scaled slightly so it fits a phone.
const SIG_LINK = 'color:#5E4B32;text-decoration:none';
const SIG_NAME = 'font-family:Georgia,\'Times New Roman\',serif;font-weight:bold;color:#765A35';
const SIGNATURE_HTML = '<table role="presentation" cellpadding="0" cellspacing="0" border="0" ' +
  'style="border-collapse:collapse;margin:0 0 26px;color:#5E4B32;font-family:' + SANS + '"><tr>' +
  '<td style="padding:0 16px 0 0;vertical-align:top"><img width="120" height="163" alt="Sabra Starr" style="display:block" ' +
  'src="https://ci3.googleusercontent.com/mail-sig/AIorK4xCCG2-LdVrjO-4bxQvp6Tp7VjrCPqDaInbhanoGsFh66Iwm_LkzPzs6l_w72z9YuSd0OmhT7PvlxHK"></td>' +
  '<td style="border-left:1px solid #B7AA98;padding:2px 0 2px 16px;vertical-align:top">' +
  '<div style="' + SIG_NAME + ';font-size:18px;line-height:22px;letter-spacing:.5px">SABRA STARR</div>' +
  '<div style="font-size:10px;line-height:16px;letter-spacing:1.2px;text-transform:uppercase">Founder &amp; Interior Designer</div>' +
  '<div style="' + SIG_NAME + ';font-size:13px;line-height:20px">SABRA &amp; CO.</div>' +
  '<div style="font-size:11px;line-height:18px;color:#927B5A;font-style:italic;margin-top:4px">Calm, functional homes for busy families.</div>' +
  '<div style="font-size:11px;line-height:18px;margin-top:7px">' +
  '<a href="tel:+16154774090" style="' + SIG_LINK + '">(615) 477-4090</a><br>' +
  '<a href="mailto:sabra@sabraandcompany.com" style="' + SIG_LINK + '">sabra@sabraandcompany.com</a><br>' +
  '<a href="https://sabraandcompany.com/" style="' + SIG_LINK + '">sabraandcompany.com</a><br>' +
  '<a href="https://instagram.com/sabraandco" style="' + SIG_LINK + '">@sabraandco</a>' +
  '</div></td></tr></table>';
const SIGNATURE_TEXT = 'SABRA STARR\nFounder & Interior Designer\nSABRA & CO.\nCalm, functional homes for busy families.\n' +
  '(615) 477-4090\nsabra@sabraandcompany.com\nsabraandcompany.com\n@sabraandco';

function clean(value, limit) {
  return String(value == null ? '' : value).trim().slice(0, limit);
}

function looksLikeEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function downloadToken(email, secret) {
  return crypto.createHmac('sha256', secret).update('guide:' + email).digest('hex').slice(0, 32);
}

function downloadUrl(email, secret) {
  return SITE + '/api/subscribe?guide=1&e=' + encodeURIComponent(email) + '&t=' + downloadToken(email, secret);
}

function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

function guideEmail(name, isNew, link, unsubscribeUrl) {
  const hello = 'Hi ' + (name || 'there') + '!';
  const listNote = isNew
    ? 'You&rsquo;ll also get my newsletter every other week, with design tips, favorite finds and what&rsquo;s happening in the studio. You can unsubscribe anytime.'
    : '';
  const listNoteText = isNew
    ? 'You\'ll also get my newsletter every other week, with design tips, favorite finds and what\'s happening in the studio. You can unsubscribe anytime.\n\n'
    : '';

  const html = '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light">' +
    '<title>Your guide is here!</title>' +
    '<link href="https://fonts.googleapis.com/css2?family=Cormorant:ital,wght@0,400;0,500;1,400&amp;' +
    'family=Jost:wght@400;500&amp;display=swap" rel="stylesheet">' +
    '<style>body{margin:0;padding:0;background:' + C.cream + '}' +
    '@media (max-width:620px){.pad{padding-left:24px!important;padding-right:24px!important}}</style></head>' +
    '<body style="margin:0;padding:0;background:' + C.cream + '">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:' +
    C.cream + '"><tr><td align="center" style="padding:24px 12px">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:640px;' +
    'background:' + C.paper + ';border:1px solid ' + C.rule + '">' +
    '<tr><td align="center" style="padding:36px 24px 26px;border-bottom:1px solid ' + C.rule + '">' +
    '<a href="' + SITE + '" style="text-decoration:none;font-family:' + SERIF + ';font-size:24px;' +
    'letter-spacing:7px;text-transform:uppercase;color:' + C.ink + ';font-weight:500">Sabra &amp; Co.</a></td></tr>' +
    '<tr><td class="pad" style="padding:34px 48px 16px">' +
    '<h1 style="margin:0 0 18px;font-family:' + SERIF + ';font-size:34px;line-height:1.15;font-weight:500;color:' +
    C.ink + '">' + escapeHtml(hello) + '</h1>' +
    '<p style="' + P + '">Here&rsquo;s your guide: ' + escapeHtml(GUIDE_TITLE) + '.</p>' +
    '<p style="margin:0 0 26px"><a href="' + escapeHtml(link) + '" style="display:inline-block;padding:15px 30px;' +
    'background:' + C.ink + ';color:' + C.cream + ';font-family:' + SANS + ';font-size:16px;font-weight:500;' +
    'text-decoration:none">Download the guide</a></p>' +
    '<p style="' + P + '">If you only do one thing, start with the hardware. It&rsquo;s the cheapest change in the ' +
    'house, and it shifts a room more than it should!</p>' +
    (listNote ? '<p style="' + P + '">' + listNote + '</p>' : '') +
    '<p style="' + P + '">And if you&rsquo;re staring at a room you can&rsquo;t figure out, just reply to this ' +
    'email. I&rsquo;d love to hear about it!</p>' +
    '<p style="margin:0 0 14px;font-family:' + SANS + ';font-size:16px;line-height:1.7;color:' + C.text + '">Warmly,</p>' +
    SIGNATURE_HTML + '</td></tr>' +
    '<tr><td class="pad" align="center" style="background:' + C.cream + ';padding:28px 48px 34px;font-family:' +
    SANS + ';font-size:12px;line-height:1.8;color:' + C.muted + '">' +
    'Sabra &amp; Co. &middot; ' + ADDRESS + '<br>' +
    'You&rsquo;re receiving this because you requested this guide at sabraandcompany.com.<br>' +
    '<a href="' + escapeHtml(unsubscribeUrl) + '" style="color:' + C.muted + ';text-decoration:underline">Unsubscribe</a>' +
    '</td></tr></table></td></tr></table></body></html>';

  const text = hello + '\n\nHere\'s your guide: ' + GUIDE_TITLE + '.\n' + link + '\n\n' +
    'If you only do one thing, start with the hardware. It\'s the cheapest change in the house, and it shifts ' +
    'a room more than it should!\n\n' + listNoteText +
    'And if you\'re staring at a room you can\'t figure out, just reply to this email. I\'d love to hear about it!' +
    '\n\nWarmly,\n\n' + SIGNATURE_TEXT + '\n\nSabra & Co. · ' + ADDRESS + '\nYou\'re receiving this because you requested this guide at ' +
    'sabraandcompany.com.\nUnsubscribe: ' + unsubscribeUrl;

  return { subject: 'Your builder grade home guide is here!', html: html, text: text };
}

// Tracking only: a failure here must never stop someone getting the guide.
async function addToSegment(headers, email, segmentId) {
  if (!segmentId) return;
  try {
    const r = await fetch('https://api.resend.com/contacts/' + encodeURIComponent(email) + '/segments/' +
      encodeURIComponent(segmentId), { method: 'POST', headers: headers });
    if (!r.ok) console.error('Guide segment error', segmentId, r.status, await r.text());
  } catch (err) {
    console.error('Guide segment failed', err);
  }
}

module.exports = async function handler(req, res, helpers) {
  const cleanName = helpers.cleanName;
  const apiKey = process.env.RESEND_API_KEY;

  /* --------------------------------------------------- download link */
  if (req.method === 'GET') {
    const email = clean(req.query && req.query.e, 200).toLowerCase();
    const token = clean(req.query && req.query.t, 64);
    if (apiKey && email && token && safeEqual(token, downloadToken(email, apiKey))) {
      await addToSegment({ 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
        email, process.env.RESEND_GUIDE_DOWNLOAD_SEGMENT_ID);
    }
    res.statusCode = 302;
    res.setHeader('Location', PDF_PATH);
    res.setHeader('Cache-Control', 'no-store');
    return res.end();
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  body = body || {};

  // Honeypot: hidden from people, filled in by bots. Pretend it worked.
  if (clean(body.website, 200)) {
    return res.status(200).json({ ok: true, already: false, emailed: true });
  }

  const newsletter = process.env.RESEND_SEGMENT_ID;
  const from = process.env.NEWSLETTER_FROM || process.env.CONTACT_FROM;
  if (!apiKey || !newsletter || !from) {
    console.error('Guide not configured', { apiKey: !!apiKey, segment: !!newsletter, from: !!from });
    return res.status(500).json({ ok: false, error: 'The guide is not switched on yet.' });
  }

  const email = clean(body.email, 200).toLowerCase();
  if (!email || !looksLikeEmail(email)) {
    return res.status(400).json({ ok: false, error: 'That email address does not look right.' });
  }
  const name = cleanName(body.name);
  const headers = { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' };
  const contactUrl = 'https://api.resend.com/contacts/' + encodeURIComponent(email);

  /* Existing contacts are never blocked, and their subscription status is left as it is. */
  let existing = null;
  try {
    const found = await fetch(contactUrl, { method: 'GET', headers: headers });
    if (found.ok) existing = await found.json().catch(function () { return {}; });
    else if (found.status !== 404) console.error('Guide contact lookup', found.status, await found.text());
  } catch (err) {
    console.error('Guide contact lookup failed', err);
  }

  let isNew = false;
  if (!existing) {
    try {
      const created = await fetch('https://api.resend.com/contacts', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(Object.assign({ email: email, unsubscribed: false, segments: [{ id: newsletter }] },
          name ? { first_name: name } : {})),
      });
      if (created.ok) {
        isNew = true;
      } else {
        const detail = await created.text();
        if (created.status !== 409 && !/already exists/i.test(detail)) {
          console.error('Guide contact error', created.status, detail);
          return res.status(502).json({ ok: false, error: 'We could not send that just now. Please try again.' });
        }
      }
    } catch (err) {
      console.error('Guide contact request failed', err);
      return res.status(502).json({ ok: false, error: 'We could not send that just now. Please try again.' });
    }
  } else if (name && !existing.first_name) {
    try {
      const r = await fetch(contactUrl, { method: 'PATCH', headers: headers, body: JSON.stringify({ first_name: name }) });
      if (!r.ok) console.error('Guide save first name', r.status, await r.text());
    } catch (err) {
      console.error('Guide save first name failed', err);
    }
  }

  await addToSegment(headers, email, process.env.RESEND_GUIDE_SEGMENT_ID);
  if (isNew) await addToSegment(headers, email, process.env.RESEND_GUIDE_NEW_SEGMENT_ID);

  const link = downloadUrl(email, apiKey);
  const unsubscribeUrl = SITE + '/api/unsubscribe?e=' + encodeURIComponent(email) + '&t=' + tokenFor(email, apiKey);
  const greetingName = name || (existing && existing.first_name) || '';
  const message = guideEmail(greetingName, isNew, link, unsubscribeUrl);

  let emailed = false;
  try {
    const sent = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: Object.assign({}, headers, {
        // one guide email per address per day, even if the form is sent twice
        'Idempotency-Key': 'guide-' + crypto.createHash('sha256').update(email).digest('hex').slice(0, 32) +
          '-' + new Date().toISOString().slice(0, 10),
      }),
      body: JSON.stringify({
        from: from, to: [email], subject: message.subject, html: message.html, text: message.text,
        headers: {
          'List-Unsubscribe': '<' + unsubscribeUrl + '>',
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      }),
    });
    emailed = sent.ok || sent.status === 409;
    if (!emailed) console.error('Guide email error', sent.status, await sent.text());
  } catch (err) {
    console.error('Guide email failed', err);
  }

  // The page always gets the download link, so nobody leaves empty handed.
  return res.status(200).json({ ok: true, already: !isNew, emailed: emailed, download: link.replace(SITE, '') });
};

module.exports._internals = { guideEmail, downloadToken };
