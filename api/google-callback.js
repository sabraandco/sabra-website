// Handles Google OAuth2 callback. Exchanges auth code for tokens and stores
// them in httpOnly cookies so API routes can use them server-side.
// Environment variables: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, ADMIN_SECRET

const crypto = require('crypto');

function getRedirectUri(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'www.sabraandcompany.com';
  const proto = req.headers['x-forwarded-proto'] || 'https';
  return `${proto}://${host}/api/google-callback`;
}

function sign(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

function parseCookies(req) {
  const raw = req.headers.cookie || '';
  return Object.fromEntries(raw.split(';').map(c => {
    const [k, ...v] = c.trim().split('=');
    return [k, decodeURIComponent(v.join('='))];
  }));
}

module.exports = async function handler(req, res) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const adminSecret = process.env.ADMIN_SECRET;

  if (!clientId || !clientSecret || !adminSecret) {
    return res.status(500).send('Google OAuth environment variables not configured.');
  }

  const { code, state, error } = req.query;

  if (error) {
    return res.redirect(302, '/admin/seo.html?google=denied');
  }

  // Verify CSRF state
  const cookies = parseCookies(req);
  const savedState = cookies['sc_oauth_state'] || '';
  if (!state || state !== savedState) {
    return res.status(400).send('OAuth state mismatch. Please try connecting again.');
  }
  const [stateVal, stateSig] = savedState.split('.');
  if (!stateVal || sign(stateVal, adminSecret) !== stateSig) {
    return res.status(400).send('Invalid OAuth state signature.');
  }

  // Exchange code for tokens
  const redirectUri = getRedirectUri(req);
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  const tokens = await tokenRes.json();
  if (!tokens.access_token) {
    return res.status(500).send('Failed to exchange code for tokens: ' + JSON.stringify(tokens));
  }

  const expires = Math.floor(Date.now() / 1000) + (tokens.expires_in || 3600);
  const cookieOpts = 'Path=/; HttpOnly; Secure; SameSite=Lax';

  const setCookies = [
    `g_access_token=${encodeURIComponent(tokens.access_token)}; ${cookieOpts}; Max-Age=${tokens.expires_in || 3600}`,
    `g_token_exp=${expires}; ${cookieOpts}; Max-Age=${tokens.expires_in || 3600}`,
    // Clear the CSRF state cookie
    `sc_oauth_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
  ];

  // Store refresh token if provided (offline access)
  if (tokens.refresh_token) {
    setCookies.push(`g_refresh_token=${encodeURIComponent(tokens.refresh_token)}; ${cookieOpts}; Max-Age=${60 * 60 * 24 * 90}`);
  }

  res.setHeader('Set-Cookie', setCookies);
  res.redirect(302, '/admin/seo.html?google=connected');
};
