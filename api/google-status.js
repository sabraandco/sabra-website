// GET /api/google-status
// Returns {connected: true} if a valid Google OAuth token exists, regardless of GA4 setup.
import { getToken } from './google-token.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    await getToken(req);
    res.json({ connected: true });
  } catch (e) {
    res.json({ connected: false });
  }
}
