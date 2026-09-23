# The Journal editor at /admin

Write a post in plain text, add photos, press publish. It commits to GitHub, Vercel
rebuilds, and the post is live in about a minute. No code, no GitHub, no Claude.

---

## One time setup

### 1. Create a GitHub token

GitHub → your profile photo → **Settings → Developer settings → Personal access tokens →
Fine-grained tokens → Generate new token**.

- **Repository access:** Only select repositories → pick your website repo, nothing else
- **Permissions:** Repository permissions → **Contents: Read and write**. Leave every
  other permission alone.
- **Expiration:** a year is reasonable. Diary a reminder, because publishing stops
  working the day it expires.

Copy the token. GitHub shows it once.

### 2. Pick a password and a secret

- **Password:** what you will type at /admin. Use something long you will remember.
- **Secret:** a long random string you never type. It signs your login so the cookie
  cannot be forged. Mash the keyboard for 40 characters, or run `openssl rand -hex 32`.

### 3. Add five environment variables in Vercel

Vercel → your project → **Settings → Environment Variables**. Add each to Production,
Preview and Development:

| Name | Value |
|---|---|
| `ADMIN_PASSWORD` | the password from step 2 |
| `ADMIN_SECRET` | the random string from step 2 |
| `GITHUB_TOKEN` | the token from step 1 |
| `GITHUB_REPO` | `your-username/your-repo-name` |
| `GITHUB_BRANCH` | `main` (only if your branch is not called main) |

**Redeploy afterwards.** Environment variables only reach new deployments.

---

## Writing a post

Go to `yoursite.com/admin`, sign in, and fill in:

- **Title** — becomes the headline and the web address
- **Category** and **read time** — shown in the byline
- **Standfirst** — the sentence under the title
- **Search description** — what Google and AI assistants show, around 25 words
- **Journal page summary** — the couple of lines on the index card
- **Lead photo** — sits under the title, with a description and caption

Then build the body from blocks: paragraph, heading, small heading, bullet list,
numbered list, photo. Add as many as you like, reorder with the arrows, remove with ✕.

Headings work best phrased as questions. That is what people search for and what
assistants quote.

**Preview** opens a rough version in a new tab. It shows your words and photos, not the
final styling.

**Publish** sends it. You will get a link when it is done.

---

## What happens when you publish

1. Your photos are resized to 1400px wide in your browser, then saved as both `.jpg`
   and `.webp` into `images/`
2. A new page is built from `post-template.html`, so it inherits the site design,
   navigation, footer and structured data automatically
3. A card is added to the top of `blog.html`
4. The post is added to `sitemap.xml`
5. Vercel notices the commit and rebuilds

Publishing the same title twice updates that post rather than creating a duplicate.

---

## Notes worth knowing

**Photos.** Upload the full size file straight from your photographer. The browser
shrinks it before anything is sent, so a 30MB original arrives as a few hundred KB.

**Your session** lasts 8 hours, then you sign in again.

**Nothing you type becomes code.** All text is escaped, so a stray `<` or `&` in your
writing shows as a character rather than breaking the page.

**The editor is hidden from search.** /admin is set to noindex and is not in the sitemap.

**If publishing fails,** the message says why. The usual causes are an expired GitHub
token, a missing environment variable, or a redeploy not having happened after adding
them. Vercel → Logs, filtered to `/api/publish`, has the detail.

**Changing the design** of posts still means editing `post-template.html`. The editor
handles content, not layout. That is deliberate: it keeps the thing you use every two
weeks simple, and the thing you rarely touch out of the way.
