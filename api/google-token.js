// Shared helper: returns a valid access token from cookies, refreshing if needed.
// Used by search-console.js and analytics.js.
// Environment variables: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET

function parseCookies(req) {
  const raw = req.headers.cookie || '';
  return Object.fromEntries(raw.split(';').map(c => {
    const [k, ...v] = c.trim().split('=');
    return [k, decodeURIComponent(v.join('='))];
  }));
}

// Returns { token, setCookies } or throws with a { status, message }
async function getToken(req) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const cookies = parseCookies(req);

  const accessToken = cookies['g_access_token'];
  const refreshToken = cookies['g_refresh_token'];
  const exp = parseInt(cookies['g_token_exp'] || '0', 10);
  const nowSecs = Math.floor(Date.now() / 1000);

  // Still valid with 60s buffer
  if (accessToken && exp > nowSecs + 60) {
    return { token: accessToken, setCookies: [] };
  }

  // Try to refresh
  if (!refreshToken) {
    throw { status: 401, message: 'Not connected to Google. Please connect in the Setup tab.' };
  }

  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  const tokens = await r.json();
  if (!tokens.access_token) {
    throw { status: 401, message: 'Google session expired. Please reconnect in the Setup tab.' };
  }

  const newExp = Math.floor(Date.now() / 1000) + (tokens.expires_in || 3600);
  const cookieOpts = 'Path=/; HttpOnly; Secure; SameSite=Lax';
  const setCookies = [
    `g_access_token=${encodeURIComponent(tokens.access_token)}; ${cookieOpts}; Max-Age=${tokens.expires_in || 3600}`,
    `g_token_exp=${newExp}; ${cookieOpts}; Max-Age=${tokens.expires_in || 3600}`,
  ];

  return { token: tokens.access_token, setCookies };
}

module.exports = { getToken, parseCookies };
