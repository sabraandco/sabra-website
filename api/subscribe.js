// Newsletter signups from the website.
// Runs as a Vercel Serverless Function at /api/subscribe (no build step, no dependencies).
//
// Two steps:
//   1. { email }                 adds them to your Resend contacts and Newsletter segment, and
//                                schedules a "Hi there!" welcome email for 2 minutes later.
//                                Replies with a signed ticket for step 2.
//   2. { action:'name', ticket, name }   saves their first name, cancels the scheduled email
//      { action:'skip', ticket }         and sends the welcome now ("Hi Jane!" or "Hi there!").
//   If they never do step 2 (closed the tab), the scheduled "Hi there!" email goes out anyway.
//
// Environment variables in Vercel:
//   RESEND_API_KEY     already set for the contact form
//   RESEND_SEGMENT_ID  the ID of your "Newsletter" segment in Resend
//   NEWSLETTER_FROM    optional sender for the welcome email,
//                      e.g. "Sabra at Sabra & Co. <sabra@sabraandcompany.com>"
//                      (falls back to CONTACT_FROM when not set)

const crypto = require('crypto');
const { tokenFor } = require('./unsubscribe.js');

const SITE = 'https://www.sabraandcompany.com';
const ADDRESS = '13395 Voyager Parkway, Suite 130 #722, Colorado Springs, CO 80921';
const WELCOME_DELAY_MS = 2 * 60 * 1000;
const TICKET_HOURS = 2;

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

// "  jane  " -> "Jane"; letters, spaces, hyphens, apostrophes and periods only
function cleanName(value) {
  let n = String(value == null ? '' : value).normalize('NFC').replace(/<[^>]*>/g, '')
    .replace(/[^\p{L}\p{M}' .\-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 40);
  if (n && n === n.toLowerCase()) n = n.charAt(0).toUpperCase() + n.slice(1);
  return n;
}

/* ---- signed ticket: proves step 2 comes from the person who just signed up ---- */
function b64(s) { return Buffer.from(s).toString('base64url'); }
function makeTicket(data, secret) {
  const payload = b64(JSON.stringify(data));
  const sig = crypto.createHmac('sha256', secret).update('ticket:' + payload).digest('base64url');
  return payload + '.' + sig;
}
function readTicket(ticket, secret) {
  const parts = String(ticket || '').split('.');
  if (parts.length !== 2) return null;
  const want = crypto.createHmac('sha256', secret).update('ticket:' + parts[0]).digest('base64url');
  const a = Buffer.from(parts[1]), b = Buffer.from(want);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    if (!data.e || Date.now() - data.ts > TICKET_HOURS * 3600 * 1000) return null;
    return data;
  } catch (e) { return null; }
}

/* ---- welcome email: same design as the newsletters ---- */
const C = { ink: '#1E1A16', text: '#3A2E24', muted: '#6D6154', sage: '#6B8070',
  cream: '#F5F0E8', paper: '#FFFDF9', rule: '#E3DACC' };
const SERIF = "'Cormorant',Georgia,'Times New Roman',serif";
const SANS = "'Jost','Helvetica Neue',Helvetica,Arial,sans-serif";
const P = 'margin:0 0 18px;font-family:' + SANS + ';font-size:16px;line-height:1.7;color:' + C.text;
const START_HERE = [
  ['What an interior designer actually costs', '/interior-designer-cost-colorado-springs.html'],
  ['How to warm up a gray living room', '/warming-up-a-cold-gray-home.html'],
  ['The couch everyone told me not to buy', '/how-to-choose-a-couch-that-wears-in.html'],
];

function emailImage(src, alt, w, caption) {
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" ' +
    'style="margin:6px 0 24px"><tr><td align="center"><img src="' + SITE + src + '" width="' + w +
    '" alt="' + alt + '" style="display:block;width:100%;max-width:' + w + 'px;height:auto;border:0">' +
    (caption ? '<p style="margin:10px 0 0;font-family:' + SERIF + ';font-style:italic;font-size:17px;' +
      'line-height:1.4;color:' + C.muted + ';text-align:center">' + caption + '</p>' : '') +
    '</td></tr></table>';
}

function welcomeEmail(name, unsubscribeUrl) {
  const glad = 'I’m so glad you’re here' + (name ? ', ' + name : '') + '!';
  const unsub = escapeHtml(unsubscribeUrl);
  const startHere = START_HERE.map(function (s, i) {
    return '<tr><td style="padding:14px 0;' + (i ? 'border-top:1px solid ' + C.rule + ';' : '') + '">' +
      '<a href="' + SITE + s[1] + '" style="font-family:' + SERIF + ';font-size:22px;line-height:1.3;' +
      'font-weight:500;color:' + C.ink + ';text-decoration:none">' + escapeHtml(s[0]) +
      '&nbsp;<span style="color:' + C.sage + '">&rarr;</span></a></td></tr>';
  }).join('');

  const html = '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light">' +
    '<title>You&rsquo;re on the list!</title>' +
    '<link href="https://fonts.googleapis.com/css2?family=Cormorant:ital,wght@0,400;0,500;1,400;1,500&amp;' +
    'family=Jost:wght@400;500&amp;display=swap" rel="stylesheet">' +
    '<style>body{margin:0;padding:0;background:' + C.cream + '}' +
    '@media (max-width:620px){.pad{padding-left:24px!important;padding-right:24px!important}' +
    'h1{font-size:30px!important}}</style></head>' +
    '<body style="margin:0;padding:0;background:' + C.cream + '">' +
    '<div style="display:none;max-height:0;overflow:hidden;opacity:0">Thank you so much for signing up! ' +
    'Here&rsquo;s what to expect, plus a few places to start.' + '&#8199;&#65279;&#847; '.repeat(40) + '</div>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:' +
    C.cream + '"><tr><td align="center" style="padding:24px 12px">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:640px;' +
    'background:' + C.paper + ';border:1px solid ' + C.rule + '">' +
    // header
    '<tr><td align="center" style="padding:36px 24px 26px;border-bottom:1px solid ' + C.rule + '">' +
    '<a href="' + SITE + '" style="text-decoration:none;font-family:' + SERIF + ';font-size:24px;' +
    'letter-spacing:7px;text-transform:uppercase;color:' + C.ink + ';font-weight:500">Sabra &amp; Co.</a>' +
    '<p style="margin:8px 0 0;font-family:' + SANS + ';font-size:10px;letter-spacing:3px;text-transform:uppercase;' +
    'color:' + C.muted + '">Settled Warmth &middot; Every other week</p></td></tr>' +
    // welcome
    '<tr><td class="pad" style="padding:34px 48px 16px">' +
    '<h1 style="margin:0 0 18px;font-family:' + SERIF + ';font-size:34px;line-height:1.15;font-weight:500;' +
    'color:' + C.ink + '">' + escapeHtml(glad) + '</h1>' +
    '<p style="' + P + '">Thank you so much for signing up! Every other week I&rsquo;ll send one email with ' +
    'design tips you can actually use, my newest favorite finds, and a peek at what I&rsquo;m working on. ' +
    'No boring newsletters, I promise!</p>' +
    emailImage('/images/email/welcome-rooms.jpg', 'Three rooms styled by Sabra: a living room with a wood ' +
      'coffee table, a bed layered in warm linen, and a nightstand with tulips', 544,
      'A few corners of Settled Warmth') +
    '</td></tr>' +
    // start here
    '<tr><td class="pad" style="border-top:1px solid ' + C.rule + ';padding:34px 48px 20px">' +
    '<p style="margin:0 0 4px;font-family:' + SANS + ';font-size:11px;letter-spacing:3px;text-transform:uppercase;' +
    'color:' + C.sage + ';font-weight:500">Start here</p>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">' + startHere +
    '</table></td></tr>' +
    // sign off
    '<tr><td class="pad" style="border-top:1px solid ' + C.rule + ';padding:34px 48px 16px">' +
    '<p style="' + P + '">Hit reply and say hi! I read every one.</p>' +
    '<p style="margin:26px 0 4px;font-family:' + SANS + ';font-size:16px;color:' + C.text + '">Talk soon!</p>' +
    '<p style="margin:0 0 22px;font-family:' + SERIF + ';font-style:italic;font-size:34px;line-height:1.1;' +
    'color:' + C.ink + '">Sabra</p></td></tr>' +
    // footer
    '<tr><td class="pad" align="center" style="background:' + C.cream + ';padding:28px 48px 34px;font-family:' +
    SANS + ';font-size:12px;line-height:1.8;color:' + C.muted + '">' +
    '<a href="' + SITE + '" style="color:' + C.muted + ';text-decoration:underline">sabraandcompany.com</a>' +
    ' &nbsp;&middot;&nbsp; <a href="https://www.pinterest.com/sabraandco" style="color:' + C.muted +
    ';text-decoration:underline">Pinterest</a><br>Sabra &amp; Co. &middot; ' + ADDRESS + '<br>' +
    'You&rsquo;re receiving this because you signed up at sabraandcompany.com.<br>' +
    '<a href="' + unsub + '" style="color:' + C.muted + ';text-decoration:underline">Unsubscribe</a>' +
    '</td></tr></table></td></tr></table></body></html>';

  const text =
    glad + '\n\nThank you so much for signing up! Every other week I\'ll ' +
    'send one email with design tips you can actually use, my newest favorite finds, and a peek at what ' +
    'I\'m working on. No boring newsletters, I promise!\n\nSTART HERE\n' +
    START_HERE.map(function (s) { return '- ' + s[0] + ': ' + SITE + s[1]; }).join('\n') +
    '\n\nHit reply and say hi! I read every one.\n\nTalk soon!\nSabra\n\n--\nSabra & Co. · ' + SITE + '\n' +
    ADDRESS + '\nYou\'re receiving this because you signed up at sabraandcompany.com.\n' +
    'Unsubscribe: ' + unsubscribeUrl;
  return { subject: 'You’re on the list!', html: html, text: text };
}

async function sendWelcome(cfg, email, name, when) {
  const unsubscribeUrl = SITE + '/api/unsubscribe?e=' + encodeURIComponent(email) +
    '&t=' + tokenFor(email, cfg.apiKey);
  const w = welcomeEmail(name, unsubscribeUrl);
  const payload = {
    from: cfg.from, to: [email], subject: w.subject, html: w.html, text: w.text,
    // lets Gmail and Apple Mail show their own one-tap Unsubscribe button
    headers: {
      'List-Unsubscribe': '<' + unsubscribeUrl + '>',
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  };
  if (when) payload.scheduled_at = when;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: cfg.headers, body: JSON.stringify(payload),
  });
  if (!r.ok) {
    console.error('Welcome email error', r.status, await r.text());
    return null;
  }
  const data = await r.json().catch(function () { return {}; });
  return data.id || null;
}

// true when the scheduled email was stopped in time (so it is safe to send a new one)
async function cancelScheduled(cfg, id) {
  if (!id) return false;
  const r = await fetch('https://api.resend.com/emails/' + encodeURIComponent(id) + '/cancel', {
    method: 'POST', headers: cfg.headers,
  });
  if (!r.ok) console.error('Cancel scheduled welcome', r.status, await r.text());
  return r.ok;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  body = body || {};

  // Honeypot: hidden from people, filled in by bots. Pretend it worked.
  if (clean(body.website, 200)) {
    return res.status(200).json({ ok: true });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const segment = process.env.RESEND_SEGMENT_ID;
  const from = process.env.NEWSLETTER_FROM || process.env.CONTACT_FROM;
  if (!apiKey || !segment || !from) {
    console.error('Newsletter not configured', { apiKey: !!apiKey, segment: !!segment, from: !!from });
    return res.status(500).json({ ok: false, error: 'Sign-up is not switched on yet.' });
  }
  const cfg = {
    apiKey: apiKey, from: from,
    headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
  };

  /* ---------------------------------------------------- step 2: name or skip */
  if (body.action === 'name' || body.action === 'skip') {
    const t = readTicket(body.ticket, apiKey);
    if (!t) return res.status(400).json({ ok: false, error: 'That took too long. You are still on the list!' });
    const name = body.action === 'name' ? cleanName(body.name) : '';

    try {
      if (name) {
        const r = await fetch('https://api.resend.com/contacts/' + encodeURIComponent(t.e), {
          method: 'PATCH', headers: cfg.headers, body: JSON.stringify({ first_name: name }),
        });
        if (!r.ok) console.error('Save first name', r.status, await r.text());
      }
      // swap the scheduled "Hi there!" for one sent right now (with their name, if given)
      if (t.id && await cancelScheduled(cfg, t.id)) {
        await sendWelcome(cfg, t.e, name, null);
      }
    } catch (err) {
      console.error('Step 2 failed', err);
    }
    return res.status(200).json({ ok: true, name: name });
  }

  /* --------------------------------------------------------- step 1: email */
  const email = clean(body.email, 200).toLowerCase();
  if (!email || !looksLikeEmail(email)) {
    return res.status(400).json({ ok: false, error: 'That email address does not look right.' });
  }

  let already = false;
  try {
    const contactRes = await fetch('https://api.resend.com/contacts', {
      method: 'POST',
      headers: cfg.headers,
      body: JSON.stringify({ email: email, unsubscribed: false, segments: [{ id: segment }] }),
    });
    if (!contactRes.ok) {
      const detail = await contactRes.text();
      if (contactRes.status === 409 || /already exists/i.test(detail)) {
        already = true;   // still let them tell us their name; no second welcome email
      } else {
        console.error('Resend contact error', contactRes.status, detail);
        return res.status(502).json({ ok: false, error: 'We could not add you just now. Please try again.' });
      }
    }
  } catch (err) {
    console.error('Contact request failed', err);
    return res.status(502).json({ ok: false, error: 'We could not add you just now. Please try again.' });
  }

  // They are subscribed now. Schedule the welcome so step 2 can personalise it.
  let id = null;
  if (!already) {
    try {
      id = await sendWelcome(cfg, email, '', new Date(Date.now() + WELCOME_DELAY_MS).toISOString());
      // scheduling refused for any reason: send the plain welcome now rather than none at all
      if (!id) await sendWelcome(cfg, email, '', null);
    } catch (err) {
      console.error('Welcome email failed', err);
    }
  }

  return res.status(200).json({
    ok: true,
    already: already,
    ticket: makeTicket({ e: email, id: id, ts: Date.now() }, apiKey),
  });
};

module.exports._internals = { cleanName, makeTicket, readTicket, welcomeEmail };
