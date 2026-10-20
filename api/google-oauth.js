// Initiates Google OAuth2 flow for Search Console + Analytics access.
// Environment variables: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, ADMIN_SECRET

const crypto = require('crypto');

const SCOPES = [
  'https://www.googleapis.com/auth/webmasters.readonly',
  'https://www.googleapis.com/auth/analytics.readonly',
].join(' ');

function getRedirectUri(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'www.sabraandcompany.com';
  const proto = req.headers['x-forwarded-proto'] || 'https';
  return `${proto}://${host}/api/google-callback`;
}

function sign(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

module.exports = async function handler(req, res) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.ADMIN_SECRET;

  if (!clientId || !secret) {
    return res.status(500).send('GOOGLE_CLIENT_ID or ADMIN_SECRET not configured.');
  }

  // CSRF state token
  const state = crypto.randomBytes(16).toString('hex');
  const sig = sign(state, secret);
  const stateCookie = `${state}.${sig}`;

  const redirectUri = getRedirectUri(req);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state: stateCookie,
  });

  res.setHeader('Set-Cookie', `sc_oauth_state=${stateCookie}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`);
  res.redirect(302, `https://accounts.google.com/o/oauth2/v2/auth?${params}`);
};
