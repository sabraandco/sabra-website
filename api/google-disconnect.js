// Clears the Google OAuth tokens, disconnecting the integration.

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const cookieOpts = 'Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0';
  res.setHeader('Set-Cookie', [
    `g_access_token=; ${cookieOpts}`,
    `g_refresh_token=; ${cookieOpts}`,
    `g_token_exp=; ${cookieOpts}`,
  ]);

  return res.status(200).json({ ok: true });
};
