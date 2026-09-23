// Password login for /admin. Sets a short lived signed cookie; the password itself
// is never stored in the browser and never leaves the server.
//
// Environment variables: ADMIN_PASSWORD, ADMIN_SECRET

const crypto = require('crypto');

const SESSION_HOURS = 8;

function sign(exp, secret) {
  return crypto.createHmac('sha256', secret).update(String(exp)).digest('hex');
}

function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const pass = process.env.ADMIN_PASSWORD;
  const secret = process.env.ADMIN_SECRET;
  if (!pass || !secret) {
    return res.status(500).json({ ok: false, error: 'The admin area is not configured yet.' });
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  const given = String((body && body.password) || '');

  // constant time compare, and a small delay so the endpoint cannot be rapidly guessed
  await new Promise(r => setTimeout(r, 400));

  if (!safeEqual(given, pass)) {
    return res.status(401).json({ ok: false, error: 'That password is not right.' });
  }

  const exp = Date.now() + SESSION_HOURS * 3600 * 1000;
  const token = `${exp}.${sign(exp, secret)}`;
  res.setHeader('Set-Cookie',
    `sc_admin=${encodeURIComponent(token)}; Path=/; Max-Age=${SESSION_HOURS * 3600}; ` +
    `HttpOnly; Secure; SameSite=Strict`);
  return res.status(200).json({ ok: true, hours: SESSION_HOURS });
};

module.exports._internals = { sign, safeEqual };
