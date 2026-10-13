# Email newsletter: setup

Signups from your website go straight into Resend, the same service that already sends
your contact-form emails. Resend's free plan covers up to 1,000 subscribers.

Until you finish steps 1 to 3, the signup forms are live but reply "Sign-up is not
switched on yet," so nothing is lost by uploading the site first.

---

## 1. Check your sending address (2 minutes)

In Vercel → your project → **Settings → Environment Variables**, look at `CONTACT_FROM`.

- If it ends in `@sabraandcompany.com`, your domain is already verified in Resend. Go to step 2.
- If it says `onboarding@resend.dev`, verify your domain first: Resend → **Domains → Add
  Domain**, enter `sabraandcompany.com`, and add the records it shows you wherever your
  domain is registered. This also makes your contact-form emails look more trustworthy.

## 2. Create your subscriber list in Resend (2 minutes)

1. Resend → **Segments → Create Segment**
2. Name it `Newsletter` and click **Add**
3. Click the **⋯** (More options) next to it and copy the **Segment ID**

## 3. Add two settings in Vercel (3 minutes)

Vercel → your project → **Settings → Environment Variables**. Add to Production, Preview
and Development:

| Name | Value |
|---|---|
| `RESEND_SEGMENT_ID` | the Segment ID from step 2 |
| `NEWSLETTER_FROM` | `Sabra at Sabra & Co. <sabra@sabraandcompany.com>` (optional; the welcome email comes from this address) |

Then **redeploy**. Settings only reach new deployments.

## 4. Test it

Open your site in a private window, enter your own email in the footer form, and check:

- the form says "You're on the list"
- the welcome email arrives
- your address appears in Resend under **Contacts** and in the **Newsletter** segment

---

## Sending a newsletter

Send from **yoursite.com/admin/newsletter.html**, not from Resend's editor. Resend's editor
swaps your fonts and styling for its own, so a designed email pasted there loses its look.

**One time:** this page uses the same password as the Journal editor at /admin. If you have
not set that up yet, add `ADMIN_PASSWORD` and `ADMIN_SECRET` in Vercel (see SETUP-ADMIN.md,
step 2 and 3; the GitHub settings there are only needed for blog posts), then redeploy.

**Each issue:**
1. Upload any new photos for the issue to your site first (Claude gives you a small zip).
2. Go to /admin/newsletter.html and sign in.
3. **Choose the .html file** Claude made for the issue. The subject fills in and a preview shows,
   with a button to see it at phone size.
4. **Send me a test**, open it, and check the photos and the Unsubscribe link.
5. **Send to my Newsletter list**, now or scheduled for a date and time.
   It shows up in Resend under **Broadcasts**, where you can watch opens and unsubscribes.

The page refuses to send an email that is missing the unsubscribe link or your mailing
address, since both are legal requirements for marketing email.

**If you ever write one in Resend's editor instead:** start with
**Hi {{{contact.first_name|there}}}!**, and in the footer link the word "Unsubscribe" to
`{{{RESEND_UNSUBSCRIBE_URL}}}` and add your website and mailing address,
13395 Voyager Parkway, Suite 130 #722, Colorado Springs, CO 80921.

The automatic welcome email already has its own unsubscribe link, handled by
`api/unsubscribe.js`. Anyone who unsubscribes there is marked unsubscribed in Resend, so
your newsletters skip them too.

---

## How the signup box behaves

**Where it appears**
- On every page, in the footer.
- At the end of each blog post. New posts published from /admin get it automatically.
- In a card that slides up in the bottom corner (on phones, a short bar along the bottom).

**When the card shows**
- After 30 seconds on the site, counted across pages.
- On blog posts, earlier: once someone has read 60% of the post.

**How often the card shows**
- Closed with the ×: hidden for 30 days.
- Ignored: shown again after 7 days.
- Subscribed: never again, and the footer form shows a thank-you instead.
- Never on the contact or thank-you pages.

**First names:** right after someone signs up, the form asks "What should I call you?"
with a Skip button. Names are saved in Resend (Contacts → First name). The welcome email
waits up to 2 minutes so it can say their name; if they skip or close the page, it goes
out as "Hi there!".

**Seeing the card again yourself:** your browser remembers that you've seen it. Use a
private window to see it fresh.

**Changing the wording:** the card's text is in `newsletter.js` (search for "Notes on a
home"). The footer and end-of-post wording is in each page's HTML (search for "nl-post").
The welcome email is in `api/subscribe.js`. Both are written to sound like you, so edit freely.
