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

function verifySession(req, secret) {
  const cookie = req.headers.cookie || '';
  const m = cookie.match(/sc_admin=([^;]+)/);
  if (!m) return false;
  const [expStr, sig] = decodeURIComponent(m[1]).split('.');
  if (!expStr || !sig) return false;
  const expected = crypto.createHmac('sha256', secret).update(expStr).digest('hex');
  if (sig.length !== expected.length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
  return Number(expStr) > Date.now();
}

module.exports = async function handler(req, res) {
  // GET ?check=1 — lightweight session check used by the admin dashboard on load.
  // Returns { ok: true } if the sc_admin cookie is still valid, { ok: false } otherwise.
  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'no-store');
    const secret = process.env.ADMIN_SECRET;
    if (!secret) return res.status(200).json({ ok: false });
    return res.status(200).json({ ok: verifySession(req, secret) });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
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
