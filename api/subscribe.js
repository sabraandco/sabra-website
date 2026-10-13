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

function welcomeEmail(name, unsubscribeUrl) {
  const hi = name ? 'Hi ' + name + '!' : 'Hi there!';
  const p = 'margin:0 0 16px;font-size:16px;line-height:1.7;color:#3E352D';
  const html =
    '<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;padding:8px 4px">' +
    '<p style="' + p + '">' + escapeHtml(hi) + '</p>' +
    '<p style="' + p + '">Thank you so much for signing up! I&#39;m so glad you&#39;re here! Every other ' +
    'week I&#39;ll send one email with design tips you can actually use, my newest favorite finds, and a ' +
    'peek at what I&#39;m working on. No boring newsletters, I promise!</p>' +
    '<p style="' + p + '">If you&#39;re planning a project, a good place to start is ' +
    '<a href="' + SITE + '/interior-designer-cost-colorado-springs.html" style="color:#1E1A16">what ' +
    'an interior designer actually costs in Colorado Springs</a>.</p>' +
    '<p style="' + p + '">Talk soon!<br>Sabra</p>' +
    '<div style="border-top:1px solid #E0D8CC;margin-top:28px;padding-top:14px;font-family:Arial,' +
    'sans-serif;font-size:12px;line-height:1.7;color:#7A6C5E">' +
    'Sabra &amp; Co. &middot; <a href="' + SITE + '" style="color:#7A6C5E">sabraandcompany.com</a><br>' +
    ADDRESS + '<br>' +
    'You&#39;re receiving this because you signed up at sabraandcompany.com. ' +
    '<a href="' + unsubscribeUrl + '" style="color:#7A6C5E">Unsubscribe</a></div></div>';
  const text =
    hi + '\n\nThank you so much for signing up! I\'m so glad you\'re here! Every other week I\'ll ' +
    'send one email with design tips you can actually use, my newest favorite finds, and a peek at what ' +
    'I\'m working on. No boring newsletters, I promise!\n\n' +
    'If you\'re planning a project, a good place to start is what an interior designer actually costs ' +
    'in Colorado Springs: ' + SITE + '/interior-designer-cost-colorado-springs.html\n\n' +
    'Talk soon!\nSabra\n\n--\nSabra & Co. · ' + SITE + '\n' + ADDRESS + '\n' +
    'You\'re receiving this because you signed up at sabraandcompany.com.\n' +
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
