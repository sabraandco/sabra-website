// Publishes a Journal post: builds the page from post-template.html, adds a card to
// blog.html, updates sitemap.xml, and commits everything to GitHub. Vercel redeploys.
//
// Required environment variables:
//   ADMIN_PASSWORD  the password for /admin
//   ADMIN_SECRET    any long random string, used to sign the login cookie
//   GITHUB_TOKEN    fine grained token with Contents read and write on this repo only
//   GITHUB_REPO     e.g. sabraandco/sabra-website
//   GITHUB_BRANCH   optional, defaults to main

const crypto = require('crypto');

const SITE = 'https://www.sabraandcompany.com';
const API = 'https://api.github.com';

// ---------------------------------------------------------------- helpers
function esc(t) {
  return String(t == null ? '' : t)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function jsonEsc(t) { return String(t == null ? '' : t).replace(/\\/g, '\\\\').replace(/"/g, '\\"'); }
function urlEnc(t) { return encodeURIComponent(String(t == null ? '' : t)); }

function slugify(t) {
  return String(t).toLowerCase().trim()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70);
}

function verifySession(req) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return false;
  const cookie = req.headers.cookie || '';
  const m = cookie.match(/sc_admin=([^;]+)/);
  if (!m) return false;
  const [expStr, sig] = decodeURIComponent(m[1]).split('.');
  if (!expStr || !sig) return false;
  const expected = crypto.createHmac('sha256', secret).update(expStr).digest('hex');
  if (sig.length !== expected.length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
  return Number(expStr) > Date.now();
}

// ---------------------------------------------------------------- github
async function gh(path, opts = {}) {
  const res = await fetch(`${API}/repos/${process.env.GITHUB_REPO}/${path}`, {
    ...opts,
    headers: {
      'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'sabra-admin',
      ...(opts.headers || {}),
    },
  });
  return res;
}

async function getFile(path) {
  const branch = process.env.GITHUB_BRANCH || 'main';
  const res = await gh(`contents/${path}?ref=${branch}`);
  if (!res.ok) throw new Error(`Could not read ${path} (${res.status})`);
  const j = await res.json();
  return { text: Buffer.from(j.content, 'base64').toString('utf8'), sha: j.sha };
}

async function putFile(path, contentBase64, message, sha) {
  const body = {
    message,
    content: contentBase64,
    branch: process.env.GITHUB_BRANCH || 'main',
  };
  if (sha) body.sha = sha;
  const res = await gh(`contents/${path}`, { method: 'PUT', body: JSON.stringify(body) });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Could not write ${path} (${res.status}) ${detail.slice(0, 200)}`);
  }
  return res.json();
}

// ---------------------------------------------------------------- content
// Blocks come from the editor as plain text. Nothing here accepts raw HTML.
function renderBlocks(blocks, slug) {
  const out = [];
  for (const b of blocks) {
    if (b.type === 'heading') {
      out.push(`  <h2>${esc(b.text)}</h2>`);
    } else if (b.type === 'subheading') {
      out.push(`  <h3>${esc(b.text)}</h3>`);
    } else if (b.type === 'list') {
      const items = String(b.text || '').split('\n').map(s => s.trim()).filter(Boolean);
      out.push('  <ul>\n' + items.map(i => `   <li>${esc(i)}</li>`).join('\n') + '\n  </ul>');
    } else if (b.type === 'numbered') {
      const items = String(b.text || '').split('\n').map(s => s.trim()).filter(Boolean);
      out.push('  <ol>\n' + items.map(i => `   <li>${esc(i)}</li>`).join('\n') + '\n  </ol>');
    } else if (b.type === 'image') {
      const stem = b.image;
      const cap = esc(b.caption || '');
      const pin = esc(b.pin || b.caption || '');
      const media = `${SITE}/images/${stem}.jpg`;
      const page = `${SITE}/${slug}.html`;
      const save = `<a class="pin-save" target="_blank" rel="noopener" href="https://www.pinterest.com/pin/create/button/?url=${page}&amp;media=${media}&amp;description=${urlEnc(b.pin || b.caption || '')}">Save to Pinterest</a>`;
      out.push(
        '  <figure>\n' +
        `   <picture><source type="image/webp" srcset="images/${stem}.webp"/>` +
        `<img loading="lazy" decoding="async" width="${b.w || 900}" height="${b.h || 1350}" ` +
        `src="images/${stem}.jpg" alt="${esc(b.alt || b.caption || '')}" ` +
        `data-pin-description="${pin}"/></picture>\n` +
        (cap ? `   <figcaption>${cap}\n    ${save}</figcaption>\n` : `   <figcaption>${save}</figcaption>\n`) +
        '  </figure>');
    } else {
      // paragraphs: blank lines split, single newlines join
      const paras = String(b.text || '').split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
      for (const p of paras) out.push(`  <p>${esc(p).replace(/\n/g, ' ')}</p>`);
    }
  }
  return out.join('\n\n');
}

function buildArticle(d, slug) {
  const leadSave = `<a class="pin-save" target="_blank" rel="noopener" href="https://www.pinterest.com/pin/create/button/?url=${SITE}/${slug}.html&amp;media=${SITE}/images/${d.leadImage}.jpg&amp;description=${urlEnc(d.leadPin || d.title)}">Save to Pinterest</a>`;
  return `<article class="article">
<header class="article-head">
 <div class="article-head-inner">
  <span class="article-kicker">${esc(d.category)}</span>
  <h1 class="article-title">${esc(d.title)}</h1>
  <p class="article-deck">${esc(d.deck)}</p>
  <div class="article-byline">By Sabra &nbsp;·&nbsp; ${esc(d.dateLabel)} &nbsp;·&nbsp; ${esc(d.readTime)}</div>
 </div>
</header>

<figure class="article-lead">
 <picture><source type="image/webp" srcset="images/${d.leadImage}.webp"/><img fetchpriority="high" decoding="async" width="${d.leadW || 900}" height="${d.leadH || 1350}" src="images/${d.leadImage}.jpg" alt="${esc(d.leadAlt || d.title)}" data-pin-description="${esc(d.leadPin || d.title)}"/></picture>
 <figcaption>${esc(d.leadCaption || '')}${d.leadCaption ? '\n  ' + leadSave : leadSave}</figcaption>
</figure>

<div class="post-body">
${renderBlocks(d.blocks || [], slug)}
</div>`;
}

function buildCard(d, slug) {
  return `<a class="post-card" href="${slug}.html">
  <div class="post-thumb"><picture><source type="image/webp" srcset="images/${d.leadImage}.webp"/><img loading="lazy" decoding="async" width="${d.leadW || 900}" height="${d.leadH || 1350}" src="images/${d.leadImage}.jpg" alt="${esc(d.title)}"/></picture></div>
  <div class="post-meta">${esc(d.category)} &nbsp;·&nbsp; ${esc(d.dateLabel)}</div>
  <h2>${esc(d.title)}</h2>
  <p>${esc(d.excerpt)}</p>
  <span class="post-more">Read the post</span>
</a>`;
}

function fillTemplate(tpl, d, slug) {
  return tpl
    .split('{{ARTICLE}}').join(buildArticle(d, slug))
    .split('{{TITLE_JSON}}').join(jsonEsc(d.title))
    .split('{{DESCRIPTION_JSON}}').join(jsonEsc(d.description))
    .split('{{TITLE}}').join(esc(d.title))
    .split('{{DESCRIPTION}}').join(esc(d.description))
    .split('{{SLUG}}').join(slug)
    .split('{{ISO_DATE}}').join(d.isoDate)
    .split('{{LEAD_IMAGE}}').join(d.leadImage);
}

function insertCard(blogHtml, cardHtml) {
  const start = blogHtml.indexOf('<!--POSTS:START-->');
  if (start === -1) throw new Error('blog.html is missing its POSTS:START marker');
  const at = start + '<!--POSTS:START-->'.length;
  return blogHtml.slice(0, at) + '\n' + cardHtml + '\n' + blogHtml.slice(at);
}

function addToSitemap(xml, slug, isoDate) {
  if (xml.includes(`/${slug}.html<`)) return xml;
  const entry = `  <url>\n    <loc>${SITE}/${slug}.html</loc>\n    <lastmod>${isoDate}</lastmod>\n` +
                `    <changefreq>monthly</changefreq>\n    <priority>0.7</priority>\n  </url>\n`;
  return xml.replace('</urlset>', entry + '</urlset>');
}

// ---------------------------------------------------------------- handler
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }
  if (!verifySession(req)) return res.status(401).json({ ok: false, error: 'Please log in again.' });

  for (const v of ['GITHUB_TOKEN', 'GITHUB_REPO', 'ADMIN_SECRET']) {
    if (!process.env[v]) return res.status(500).json({ ok: false, error: `Server is missing ${v}.` });
  }

  let d = req.body;
  if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { d = {}; } }
  d = d || {};

  const missing = ['title', 'deck', 'description', 'category', 'excerpt', 'leadImage']
    .filter(k => !String(d[k] || '').trim());
  if (missing.length) return res.status(400).json({ ok: false, error: 'Missing: ' + missing.join(', ') });

  const slug = String(d.slug || '').trim() ? slugify(d.slug) : slugify(d.title);
  if (!slug) return res.status(400).json({ ok: false, error: 'Could not build a web address from that title.' });

  const now = new Date();
  d.isoDate = d.isoDate || now.toISOString().slice(0, 10);
  d.dateLabel = d.dateLabel ||
    now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  d.readTime = d.readTime || '5 minute read';

  try {
    // 1. images uploaded from the editor, already resized in the browser
    for (const img of (d.uploads || [])) {
      if (!/^[a-z0-9\-]+$/.test(img.stem)) throw new Error('Bad image name: ' + img.stem);
      for (const ext of ['jpg', 'webp']) {
        if (!img[ext]) continue;
        let sha;
        const existing = await gh(`contents/images/${img.stem}.${ext}?ref=${process.env.GITHUB_BRANCH || 'main'}`);
        if (existing.ok) sha = (await existing.json()).sha;
        await putFile(`images/${img.stem}.${ext}`, img[ext], `Add image ${img.stem}.${ext}`, sha);
      }
    }

    // 2. the post page
    const tpl = await getFile('post-template.html');
    const page = fillTemplate(tpl.text, d, slug);
    let pageSha;
    const existingPage = await gh(`contents/${slug}.html?ref=${process.env.GITHUB_BRANCH || 'main'}`);
    if (existingPage.ok) pageSha = (await existingPage.json()).sha;
    await putFile(`${slug}.html`, Buffer.from(page, 'utf8').toString('base64'),
                  `${pageSha ? 'Update' : 'Publish'} post: ${d.title}`, pageSha);

    // 3. the index card, only for a new post
    if (!pageSha) {
      const blog = await getFile('blog.html');
      const updated = insertCard(blog.text, buildCard(d, slug));
      await putFile('blog.html', Buffer.from(updated, 'utf8').toString('base64'),
                    `Add ${d.title} to the Journal`, blog.sha);

      const sm = await getFile('sitemap.xml');
      const smNew = addToSitemap(sm.text, slug, d.isoDate);
      if (smNew !== sm.text) {
        await putFile('sitemap.xml', Buffer.from(smNew, 'utf8').toString('base64'),
                      `Add ${slug} to sitemap`, sm.sha);
      }
    }

    return res.status(200).json({
      ok: true, slug, updated: !!pageSha,
      url: `${SITE}/${slug}.html`,
      note: 'Vercel is rebuilding. The post is usually live within a minute.',
    });
  } catch (err) {
    console.error('publish failed', err);
    return res.status(500).json({ ok: false, error: err.message || 'Publish failed.' });
  }
};

// exported for testing
module.exports._internals = { slugify, renderBlocks, buildArticle, buildCard, fillTemplate, insertCard, addToSitemap, esc };
