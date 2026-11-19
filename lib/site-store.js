// Tiny server-side store for the website, kept in the Sabra & Co Supabase
// project (tables site_store and site_store_auth, separate from the CRM).
// Holds the Google connection for the weekly report (encrypted) and last
// week's numbers so the report can compare week over week.
//
// The public key below can only call two functions, and both require a
// passphrase derived from ADMIN_SECRET, which lives only in Vercel.

const crypto = require('crypto');

const SUPABASE_URL = 'https://wcqkzwwafckqjgaofjnr.supabase.co';
const SUPABASE_KEY = 'sb_publishable_15rR7tdNAexECZnM-yvb2Q_dslk8JFJ';

function pass() {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) throw new Error('ADMIN_SECRET is not set');
  return crypto.createHmac('sha256', secret).update('sabra-site-store-v1').digest('hex');
}

async function rpc(fn, args) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`store ${fn} failed (${r.status}): ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

async function get(key) { return rpc('site_store_get', { p_pass: pass(), p_key: key }); }
async function put(key, value) { return rpc('site_store_put', { p_pass: pass(), p_key: key, p_value: value }); }

// AES-256-GCM, keyed from two secrets that only exist in Vercel
function key() {
  return crypto.createHash('sha256')
    .update(`${process.env.ADMIN_SECRET || ''}|${process.env.GOOGLE_CLIENT_SECRET || ''}`).digest();
}
function seal(text) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const body = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), body].map(b => b.toString('base64')).join('.');
}
function open(sealed) {
  const [iv, tag, body] = String(sealed).split('.').map(s => Buffer.from(s, 'base64'));
  const d = crypto.createDecipheriv('aes-256-gcm', key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(body), d.final()]).toString('utf8');
}

// Google refresh token: saved whenever the dashboard is open and connected
async function saveGoogle(refreshToken) {
  const hash = crypto.createHash('sha256').update(refreshToken).digest('hex').slice(0, 16);
  return put('google', { token: seal(refreshToken), hash, savedAt: new Date().toISOString() });
}
async function loadGoogle() {
  const v = await get('google');
  if (!v || !v.token) return null;
  try { return { refreshToken: open(v.token), savedAt: v.savedAt }; } catch (e) { return null; }
}

module.exports = { get, put, saveGoogle, loadGoogle, _internals: { seal, open } };
