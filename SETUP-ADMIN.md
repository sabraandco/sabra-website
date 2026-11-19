# The website dashboard at /admin

`/admin/` opens the website dashboard (`/admin/seo.html`): live SEO, AEO and GEO checks of every
page in the sitemap, PageSpeed, Search Console keywords and rankings, Google Analytics traffic, and
recommendations built from whatever currently fails. `/admin/newsletter.html` sends the newsletter.

Sign-in uses two Vercel environment variables: `ADMIN_PASSWORD` (what you type) and `ADMIN_SECRET`
(any long random string, used to sign the login cookie). Google data also needs `GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET` and `GA4_PROPERTY_ID`; connect from the dashboard's Setup tab.

The old in-browser post editor was removed in November 2026. Posts are written and published
through Claude (see CLAUDE.md), so `GITHUB_TOKEN`, `GITHUB_REPO` and `GITHUB_BRANCH` are no longer used.
