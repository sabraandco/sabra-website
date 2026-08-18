// Receives the website enquiry forms and emails them via Resend.
// Runs as a Vercel Serverless Function at /api/contact  (no build step, no dependencies).
//
// Required environment variables in Vercel:
//   RESEND_API_KEY   your Resend API key
//   CONTACT_TO       where enquiries should land, e.g. sabra@sabraandcompany.com
//   CONTACT_FROM     verified sender, e.g. "Sabra & Co. Website <hello@sabraandcompany.com>"
//                    (before your domain is verified, use "onboarding@resend.dev")

const MAX = { name: 100, email: 200, phone: 40, package: 120, message: 4000 };

function clean(value, limit) {
  return String(value == null ? '' : value).trim().slice(0, limit);
}

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function looksLikeEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  body = body || {};

  // Honeypot: real people never see this field, bots fill it in.
  // Return success so the bot has no signal that it was caught.
  if (clean(body.website, 200)) {
    return res.status(200).json({ ok: true });
  }

  const firstName = clean(body.first_name, MAX.name);
  const lastName  = clean(body.last_name,  MAX.name);
  const email     = clean(body.email,      MAX.email);
  const phone     = clean(body.phone,      MAX.phone);
  const pkg       = clean(body.package,    MAX.package);
  const message   = clean(body.message,    MAX.message);
  const source    = clean(body.source,     60) || 'website';

  const missing = [];
  if (!firstName) missing.push('first name');
  if (!email) missing.push('email');
  if (!message) missing.push('message');
  if (missing.length) {
    return res.status(400).json({ ok: false, error: 'Please add your ' + missing.join(', ') + '.' });
  }
  if (!looksLikeEmail(email)) {
    return res.status(400).json({ ok: false, error: 'That email address does not look right.' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.CONTACT_TO;
  const from = process.env.CONTACT_FROM;
  if (!apiKey || !to || !from) {
    console.error('Missing env vars', { apiKey: !!apiKey, to: !!to, from: !!from });
    return res.status(500).json({ ok: false, error: 'The form is not configured yet.' });
  }

  const fullName = (firstName + ' ' + lastName).trim();
  const rows = [
    ['Name', fullName],
    ['Email', email],
    ['Phone', phone || 'Not provided'],
    ['Interested in', pkg || 'Not specified'],
    ['Sent from', source + ' page'],
  ];

  const html =
    '<div style="font-family:Georgia,serif;color:#1E1612;max-width:600px">' +
    '<h2 style="font-weight:400;letter-spacing:.02em">New enquiry from ' + escapeHtml(fullName) + '</h2>' +
    '<table style="border-collapse:collapse;margin:1.2rem 0;width:100%">' +
    rows.map(function (r) {
      return '<tr>' +
        '<td style="padding:6px 14px 6px 0;color:#7A6C5E;font-size:13px;letter-spacing:.08em;' +
        'text-transform:uppercase;vertical-align:top;white-space:nowrap">' + escapeHtml(r[0]) + '</td>' +
        '<td style="padding:6px 0;font-size:15px">' + escapeHtml(r[1]) + '</td></tr>';
    }).join('') +
    '</table>' +
    '<div style="border-top:1px solid #E0D8CC;padding-top:1rem">' +
    '<div style="color:#7A6C5E;font-size:13px;letter-spacing:.08em;text-transform:uppercase;' +
    'margin-bottom:.5rem">About their space</div>' +
    '<div style="font-size:15px;line-height:1.65;white-space:pre-wrap">' + escapeHtml(message) + '</div>' +
    '</div></div>';

  const text = rows.map(function (r) { return r[0] + ': ' + r[1]; }).join('\n') +
    '\n\nAbout their space:\n' + message;

  try {
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: from,
        to: [to],
        reply_to: email,
        subject: 'New enquiry from ' + fullName + (pkg ? ' about ' + pkg : ''),
        html: html,
        text: text,
      }),
    });

    if (!resendRes.ok) {
      const detail = await resendRes.text();
      console.error('Resend error', resendRes.status, detail);
      return res.status(502).json({ ok: false, error: 'We could not send that just now.' });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Send failed', err);
    return res.status(502).json({ ok: false, error: 'We could not send that just now.' });
  }
};
