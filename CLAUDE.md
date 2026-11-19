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
- Every page carries the Google Analytics tag (G-05ZTH074FN) just before `</head>`.
- FAQ schema questions and answers must match the FAQ text visible on the page.

## Limits
- Vercel Hobby allows 12 serverless functions in `api/`. Adding a 13th file breaks the deploy.
