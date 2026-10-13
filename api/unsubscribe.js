// One-click unsubscribe for emails sent by the website (the welcome email).
// Runs as a Vercel Serverless Function at /api/unsubscribe (no build step, no dependencies).
//
//   GET  /api/unsubscribe?e=<email>&t=<token>   shows a page with an "Unsubscribe me" button
//   POST /api/unsubscribe?e=<email>&t=<token>   unsubscribes (the button, and Gmail/Apple Mail's
//                                               built-in unsubscribe via List-Unsubscribe-Post)
//
// Opening the link never unsubscribes on its own: email security scanners open links
// automatically, and would otherwise unsubscribe real readers.
//
// Uses RESEND_API_KEY (already set). The token is signed with it, so a link only works
// for the address it was sent to.

const crypto = require('crypto');

const SITE = 'https://www.sabraandcompany.com';

function tokenFor(email, secret) {
  return crypto.createHmac('sha256', secret).update('unsub:' + email).digest('hex').slice(0, 32);
}

function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function page(title, bodyHtml) {
  return '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="robots" content="noindex">' +
    '<title>' + escapeHtml(title) + ' | Sabra &amp; Co.</title>' +
    '<style>' +
    "@font-face{font-family:'Cormorant';font-weight:300;font-display:swap;src:url(/fonts/cormorant-latin-300-normal.woff2) format('woff2')}" +
    "@font-face{font-family:'Jost';font-weight:300;font-display:swap;src:url(/fonts/jost-latin-300-normal.woff2) format('woff2')}" +
    "@font-face{font-family:'Jost';font-weight:400;font-display:swap;src:url(/fonts/jost-latin-400-normal.woff2) format('woff2')}" +
    'body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;' +
    "background:#F5F0E8;color:#3E352D;font-family:'Jost',Arial,sans-serif;font-weight:300;padding:24px;box-sizing:border-box}" +
    '.box{max-width:460px;text-align:center}' +
    ".logo{font-family:'Cormorant',Georgia,serif;font-size:1.1rem;letter-spacing:.22em;text-transform:uppercase;color:#1E1A16;margin-bottom:2.2rem}" +
    "h1{font-family:'Cormorant',Georgia,serif;font-weight:300;font-size:2.1rem;line-height:1.2;color:#1E1A16;margin:0 0 1rem}" +
    'p{font-size:1rem;line-height:1.75;margin:0 0 1.4rem}' +
    "button,.btn{display:inline-block;border:0;background:#1E1A16;color:#F5F0E8;font-family:'Jost',Arial,sans-serif;" +
    'font-size:.74rem;letter-spacing:.18em;text-transform:uppercase;padding:1rem 2rem;cursor:pointer;text-decoration:none}' +
    'a{color:#1E1A16}' +
    '</style></head><body><main class="box"><div class="logo">Sabra &amp; Co.</div>' +
    bodyHtml + '</main></body></html>';
}

function send(res, status, title, bodyHtml) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).send(page(title, bodyHtml));
}

module.exports = async function handler(req, res) {
  const secret = process.env.RESEND_API_KEY;
  const q = req.query || {};
  let body = req.body || {};
  if (typeof body === 'string') {
    body = Object.fromEntries(new URLSearchParams(body));
  }
  const email = String(q.e || body.e || '').trim().toLowerCase().slice(0, 200);
  const token = String(q.t || body.t || '');

  const badLink =
    '<h1>That link didn&#39;t work.</h1>' +
    '<p>It may have been cut off by your email app. Just reply to any of my emails and ' +
    'I&#39;ll take you off the list myself.</p>' +
    '<p><a href="' + SITE + '">Back to sabraandcompany.com</a></p>';

  if (!secret) return send(res, 500, 'Unsubscribe', badLink);
  if (!email || !token || !safeEqual(token, tokenFor(email, secret))) {
    return send(res, 400, 'Unsubscribe', badLink);
  }

  const action = '/api/unsubscribe?e=' + encodeURIComponent(email) + '&t=' + encodeURIComponent(token);

  if (req.method === 'GET' || req.method === 'HEAD') {
    return send(res, 200, 'Unsubscribe',
      '<h1>Leaving so soon?</h1>' +
      '<p>Click below and <strong>' + escapeHtml(email) + '</strong> won&#39;t get any more ' +
      'emails from me. No hard feelings!</p>' +
      '<form method="post" action="' + escapeHtml(action) + '">' +
      '<button type="submit">Unsubscribe me</button></form>');
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return send(res, 405, 'Unsubscribe', badLink);
  }

  try {
    const r = await fetch('https://api.resend.com/contacts/' + encodeURIComponent(email), {
      method: 'PATCH',
      headers: { 'Authorization': 'Bearer ' + secret, 'Content-Type': 'application/json' },
      body: JSON.stringify({ unsubscribed: true }),
    });
    // 404 = not on the list (already removed); same result for them either way
    if (!r.ok && r.status !== 404) {
      console.error('Resend unsubscribe error', r.status, await r.text());
      return send(res, 502, 'Unsubscribe',
        '<h1>Something went wrong.</h1>' +
        '<p>Please try the button again in a minute, or reply to any of my emails and ' +
        'I&#39;ll remove you myself.</p>' +
        '<form method="post" action="' + escapeHtml(action) + '">' +
        '<button type="submit">Try again</button></form>');
    }
  } catch (err) {
    console.error('Unsubscribe failed', err);
    return send(res, 502, 'Unsubscribe',
      '<h1>Something went wrong.</h1><p>Please try again in a minute, or reply to any of my ' +
      'emails and I&#39;ll remove you myself.</p>');
  }

  return send(res, 200, 'Unsubscribed',
    '<h1>You&#39;re unsubscribed.</h1>' +
    '<p>You won&#39;t get any more emails from me. No hard feelings! ' +
    'If you ever miss me, you know where to find me.</p>' +
    '<a class="btn" href="' + SITE + '">Visit the website</a>');
};

module.exports.tokenFor = tokenFor;
