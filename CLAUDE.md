# sabraandcompany.com

Static HTML site for Sabra & Co. (Colorado Springs interior design). GitHub `main` deploys to
Vercel automatically. Sabra makes every change through Claude; she does not edit or sync files herself.

## Publishing a Journal post
Posts are added by Claude, not through /admin. For each new post:
1. Build `<slug>.html` from `post-template.html` (fill every `{{...}}` placeholder; the breadcrumb is
   Home > Design Journal > the post).
2. Add a card for it at the top of the grid in `blog.html`.
3. Add its URL to `sitemap.xml`.
4. Add it to the top of the "## Design Journal" list in `llms.txt`:
   `- [Title](https://www.sabraandcompany.com/<slug>.html): meta description`
5. Keep the meta description 70 to 165 characters and the title 30 to 65.

The dashboard at /admin checks all of this live, so a missed step shows up there.

## Writing rules
- No em or en dashes in site copy (phone numbers and the like are fine).
- Every page carries the Google Analytics tag (G-05ZTH074FN) just before `</head>`. Copy the tag from an
  existing page: it also sends `phone_tap` and `email_tap` events that the weekly report counts.
- FAQs on pages and posts are `<details class="faq-item">` dropdowns with the question as an h3 in the summary.
- FAQ schema questions and answers must match the FAQ text visible on the page.

## Dashboard and weekly report
- `admin/audit-core.js` is the one SEO/AEO/GEO audit. The dashboard (`admin/seo.html`) and the weekly
  email (`api/weekly-report.js`) both use it, so change checks there and both stay in step.
- The weekly report emails Sabra every Monday about 7am Mountain (cron in `vercel.json`). It needs the
  Google connection, which the dashboard saves server-side whenever it loads while connected.
- Server-side storage for it (encrypted Google token, last week's numbers) lives in the Supabase project
  "Sabra & Co CRM", tables `site_store` and `site_store_auth`, reached only through `lib/site-store.js`.
- `package.json` exists only for `linkedom`, which the report uses to parse pages. No build step.

## Limits
- Vercel Hobby allows 12 serverless functions in `api/` (11 used). Adding more breaks the deploy, so
  shared helpers go in `lib/`, not `api/`.
