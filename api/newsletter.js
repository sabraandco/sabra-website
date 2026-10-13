// Sends a designed newsletter through Resend, from /admin/newsletter.html.
// Resend's own broadcast editor replaces custom fonts and styling, so emails built with
// the Sabra & Co. design are sent from here instead, exactly as designed.
//
//   { action:'test', html, subject, to, name }   one test email to you, with the name filled in
//   { action:'send', html, subject, when? }      a Resend broadcast to the Newsletter segment,
//                                                now or at `when` (an ISO date/time)
//
// Only works when signed in at /admin (same password and cookie as the Journal editor).
// Environment variables: ADMIN_SECRET, RESEND_API_KEY, RESEND_SEGMENT_ID,
//                        NEWSLETTER_FROM (or CONTACT_FROM)

const crypto = require('crypto');

const SITE = 'https://www.sabraandcompany.com';
const NAME_TAG = /\{\{\{\s*contact\.first_name\s*(?:\|([^}]*))?\}\}\}/g;
const UNSUB_TAG = /\{\{\{\s*RESEND_UNSUBSCRIBE_URL\s*\}\}\}/g;

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

function looksLikeEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v); }

function escapeHtml(v) {
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// What a subscriber would see: their name (or the fallback) and a working-looking unsubscribe link
function personalise(html, name) {
  return html
    .replace(NAME_TAG, function (_, fallback) { return escapeHtml(name || fallback || ''); })
    .replace(UNSUB_TAG, SITE);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }
  if (!verifySession(req)) {
    return res.status(401).json({ ok: false, error: 'Please sign in again.', signin: true });
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};

  const apiKey = process.env.RESEND_API_KEY;
  const segment = process.env.RESEND_SEGMENT_ID;
  const from = process.env.NEWSLETTER_FROM || process.env.CONTACT_FROM;
  if (!apiKey || !segment || !from) {
    return res.status(500).json({ ok: false, error: 'The newsletter settings are missing in Vercel.' });
  }
  const headers = { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' };

  const html = String(body.html || '');
  const subject = String(body.subject || '').trim().slice(0, 200);
  if (html.length < 200 || !/<html/i.test(html)) {
    return res.status(400).json({ ok: false, error: 'That does not look like a newsletter file.' });
  }
  if (!subject) return res.status(400).json({ ok: false, error: 'Add a subject line.' });
  // the legal must-haves for marketing email
  if (!/\{\{\{\s*RESEND_UNSUBSCRIBE_URL\s*\}\}\}/.test(html)) {
    return res.status(400).json({ ok: false, error: 'This email has no unsubscribe link, so it cannot be sent.' });
  }
  if (!/Colorado Springs, CO/.test(html)) {
    return res.status(400).json({ ok: false, error: 'This email is missing your mailing address in the footer.' });
  }

  try {
    /* ------------------------------------------------------------ test */
    if (body.action === 'test') {
      const to = String(body.to || '').trim().toLowerCase();
      if (!looksLikeEmail(to)) return res.status(400).json({ ok: false, error: 'Add the address to send the test to.' });
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST', headers: headers,
        body: JSON.stringify({ from: from, to: [to], subject: '[Test] ' + subject,
          html: personalise(html, String(body.name || '').trim().slice(0, 40)) }),
      });
      if (!r.ok) {
        const detail = await r.text();
        console.error('Newsletter test', r.status, detail);
        return res.status(502).json({ ok: false, error: 'Resend did not accept the test (' + r.status + ').' });
      }
      return res.status(200).json({ ok: true, message: 'Test sent to ' + to + '.' });
    }

    /* ------------------------------------------------------------ send */
    if (body.action === 'send') {
      const payload = {
        segment_id: segment, from: from, subject: subject, html: html,
        name: subject, send: true,
      };
      if (body.when) {
        const t = new Date(body.when);
        if (isNaN(t) || t.getTime() < Date.now() + 60 * 1000) {
          return res.status(400).json({ ok: false, error: 'Pick a time at least a couple of minutes from now.' });
        }
        payload.scheduled_at = t.toISOString();
      }
      const r = await fetch('https://api.resend.com/broadcasts', {
        method: 'POST', headers: headers, body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const detail = await r.text();
        console.error('Newsletter send', r.status, detail);
        return res.status(502).json({ ok: false, error: 'Resend did not accept it (' + r.status + '). Nothing was sent.' });
      }
      return res.status(200).json({ ok: true,
        message: payload.scheduled_at ? 'Scheduled! You can see it in Resend under Broadcasts.'
                                      : 'Sent! You can watch it go out in Resend under Broadcasts.' });
    }
  } catch (err) {
    console.error('Newsletter failed', err);
    return res.status(502).json({ ok: false, error: 'Could not reach Resend. Nothing was sent.' });
  }

  return res.status(400).json({ ok: false, error: 'Unknown action.' });
};

module.exports._internals = { personalise, verifySession };
