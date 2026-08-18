# Enquiry forms setup

The forms on the home, gallery and contact pages all post to `/api/contact`, which emails
you through Resend. Three things to set up once, then it runs itself.

---

## 1. Verify your domain in Resend

In Resend, go to **Domains → Add Domain** and enter `sabraandcompany.com`.

Resend gives you a handful of DNS records (DKIM, SPF, and usually a return path).
Add those wherever your DNS lives. Verification usually completes within an hour.

You can skip this at first and use `onboarding@resend.dev` as the sender to test the
plumbing, but verify the domain before launch. Mail sent from your own domain is far
less likely to land in spam.

## 2. Create an API key

In Resend, **API Keys → Create API Key**, with **Sending access** permission.
Copy it now; Resend only shows it once.

## 3. Add three environment variables in Vercel

Vercel dashboard → your project → **Settings → Environment Variables**.
Add each to Production, Preview and Development:

| Name | Value |
|---|---|
| `RESEND_API_KEY` | the key from step 2 |
| `CONTACT_TO` | where enquiries should arrive, e.g. `sabra@sabraandcompany.com` |
| `CONTACT_FROM` | `Sabra & Co. Website <hello@sabraandcompany.com>` |

`CONTACT_FROM` must be on the domain you verified in step 1. The mailbox itself does not
need to exist; it is only the "from" line. Replies go to whoever submitted the form,
so hitting reply in your inbox answers the client directly.

Before the domain is verified, set `CONTACT_FROM` to `onboarding@resend.dev` to test.

**Environment variables only apply to new deployments.** After adding them, redeploy
(Vercel → Deployments → ⋯ → Redeploy) or just push any commit.

---

## Testing it

1. Open the live site and send yourself a test enquiry.
2. It should land in the `CONTACT_TO` inbox within a few seconds.
3. Check the Resend dashboard's **Emails** tab to confirm delivery.

If something fails, the page shows an error message and the detail is logged in
Vercel → your project → **Logs**, filtered to `/api/contact`.

Common causes:

- *"The form is not configured yet."* — an environment variable is missing, or you
  added them but have not redeployed since.
- *"We could not send that just now."* — Resend rejected it. Almost always because
  `CONTACT_FROM` is not on a verified domain.

---

## What is already handled

- **Required fields.** First name, email and message. The browser blocks empty
  submissions before anything is sent, and the function checks again server side.
- **Spam.** A hidden honeypot field sits off screen. People never see it; bots fill it
  in. Those submissions are silently dropped and no email is sent, so the bot gets no
  signal that it was caught.
- **Safety.** All submitted text is escaped before it goes into the email, so nothing
  someone types can inject markup into your inbox.
- **Length limits.** Messages are capped at 4,000 characters so a flood attempt cannot
  blow up your send volume.
- **Which page it came from.** Each email says whether the enquiry came from the home,
  gallery or contact page.

## After a successful send

The visitor is redirected to `thank-you.html`, which confirms the message arrived and
explains what happens next. That page is set to `noindex` and kept out of the sitemap,
so it will not turn up in search results for someone who has not actually sent anything.

Because it is a real URL, you can use it as a conversion goal in Google Analytics or
Vercel Analytics: count visits to `/thank-you.html` and you have your enquiry count.

If the send fails, the visitor stays on the form, keeps what they typed, and sees the
error inline. Only a confirmed success redirects.

## Costs

Resend's free tier covers 3,000 emails a month, capped at 100 a day, on one verified
domain. Enquiry volume for a studio your size sits far below that.

Vercel Serverless Functions are included on your plan. Note that Vercel's Hobby tier is
intended for non-commercial projects, so confirm your plan covers a business site.

## If you ever want to add a field

1. Add the input to the form in the HTML, giving it a `name` (e.g. `name="timeline"`).
   The script sends every named field automatically.
2. In `api/contact.js`, add it to the `rows` array so it appears in the email.
