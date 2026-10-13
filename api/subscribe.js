// Newsletter signups from the website. Adds the email to your Resend contacts, files it in
// your Newsletter segment, then sends a short welcome email.
// Runs as a Vercel Serverless Function at /api/subscribe (no build step, no dependencies).
//
// Environment variables in Vercel:
//   RESEND_API_KEY     already set for the contact form
//   RESEND_SEGMENT_ID  the ID of your "Newsletter" segment in Resend   (new)
//   NEWSLETTER_FROM    optional sender for the welcome email,
//                      e.g. "Sabra at Sabra & Co. <sabra@sabraandcompany.com>"
//                      (falls back to CONTACT_FROM when not set)

const SITE = 'https://www.sabraandcompany.com';
const ADDRESS = '13395 Voyager Parkway, Suite 130 #722, Colorado Springs, CO 80921';

function clean(value, limit) {
  return String(value == null ? '' : value).trim().slice(0, limit);
}

function looksLikeEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

function welcomeEmail() {
  const p = 'margin:0 0 16px;font-size:16px;line-height:1.7;color:#3E352D';
  const html =
    '<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;padding:8px 4px">' +
    '<p style="' + p + '">Hi there,</p>' +
    '<p style="' + p + '">Thank you for signing up. I&#39;m so glad you&#39;re here. Every other week ' +
    'I&#39;ll send one email with design tips you can actually use, my newest favorite finds, and a ' +
    'peek at what I&#39;m working on. No boring newsletters, I promise.</p>' +
    '<p style="' + p + '">If you&#39;re planning a project, a good place to start is ' +
    '<a href="' + SITE + '/interior-designer-cost-colorado-springs.html" style="color:#1E1A16">what ' +
    'an interior designer actually costs in Colorado Springs</a>.</p>' +
    '<p style="' + p + '">Talk soon,<br>Sabra</p>' +
    '<div style="border-top:1px solid #E0D8CC;margin-top:28px;padding-top:14px;font-family:Arial,' +
    'sans-serif;font-size:12px;line-height:1.7;color:#7A6C5E">' +
    'Sabra &amp; Co. &middot; <a href="' + SITE + '" style="color:#7A6C5E">sabraandcompany.com</a><br>' +
    ADDRESS + '<br>' +
    'You&#39;re receiving this because you signed up on our website. If that wasn&#39;t you, just ' +
    'reply and I&#39;ll remove you.</div></div>';
  const text =
    'Hi there,\n\nThank you for signing up. I\'m so glad you\'re here. Every other week I\'ll send one ' +
    'email with design tips you can actually use, my newest favorite finds, and a peek at what I\'m ' +
    'working on. No boring newsletters, I promise.\n\n' +
    'If you\'re planning a project, a good place to start is what an interior designer actually costs ' +
    'in Colorado Springs: ' + SITE + '/interior-designer-cost-colorado-springs.html\n\n' +
    'Talk soon,\nSabra\n\n--\nSabra & Co. · ' + SITE + '\n' + ADDRESS + '\n' +
    'You\'re receiving this because you signed up on our website. If that wasn\'t you, just reply ' +
    'and I\'ll remove you.';
  return { subject: 'You’re on the list', html: html, text: text };
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

  // Honeypot: hidden from people, filled in by bots. Pretend it worked.
  if (clean(body.website, 200)) {
    return res.status(200).json({ ok: true });
  }

  const email = clean(body.email, 200).toLowerCase();
  if (!email || !looksLikeEmail(email)) {
    return res.status(400).json({ ok: false, error: 'That email address does not look right.' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const segment = process.env.RESEND_SEGMENT_ID;
  const from = process.env.NEWSLETTER_FROM || process.env.CONTACT_FROM;
  if (!apiKey || !segment || !from) {
    console.error('Newsletter not configured', { apiKey: !!apiKey, segment: !!segment, from: !!from });
    return res.status(500).json({ ok: false, error: 'Sign-up is not switched on yet.' });
  }

  const headers = { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' };

  try {
    const contactRes = await fetch('https://api.resend.com/contacts', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({
        email: email,
        unsubscribed: false,
        segments: [{ id: segment }],
      }),
    });

    if (!contactRes.ok) {
      const detail = await contactRes.text();
      // Already on the list: tell them it worked, skip a second welcome email.
      if (contactRes.status === 409 || /already exists/i.test(detail)) {
        return res.status(200).json({ ok: true, already: true });
      }
      console.error('Resend contact error', contactRes.status, detail);
      return res.status(502).json({ ok: false, error: 'We could not add you just now. Please try again.' });
    }
  } catch (err) {
    console.error('Contact request failed', err);
    return res.status(502).json({ ok: false, error: 'We could not add you just now. Please try again.' });
  }

  // They are subscribed at this point; a failed welcome email is logged, not shown to them.
  try {
    const w = welcomeEmail();
    const sendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({ from: from, to: [email], subject: w.subject, html: w.html, text: w.text }),
    });
    if (!sendRes.ok) console.error('Welcome email error', sendRes.status, await sendRes.text());
  } catch (err) {
    console.error('Welcome email failed', err);
  }

  return res.status(200).json({ ok: true });
};
