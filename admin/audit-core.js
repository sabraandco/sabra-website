// Shared SEO, AEO and GEO audit. Used by the dashboard (admin/seo.html)
// and by the weekly email report (api/weekly-report.js), so both score
// pages exactly the same way. Pass a DOMParser in env (the browser one,
// or linkedom on the server).
(function(root,factory){ if(typeof module==='object'&&module.exports) module.exports=factory(); else root.SCAudit=factory(); })(this,function(){
  var SITE='https://www.sabraandcompany.com';
  var GBP_RE=/share\.google|google\.com\/maps|g\.page|business\.google/i;
  var ORG_TYPES=['LocalBusiness','InteriorDesigner','Organization','ProfessionalService','HomeAndConstructionBusiness'];
  var POST_TYPES=['BlogPosting','Article','NewsArticle'];
  var AI_BOTS=['GPTBot','ClaudeBot','anthropic-ai','PerplexityBot','Google-Extended','CCBot','OAI-SearchBot'];

  var GROUPS={
    seo:{'Meta':['Page title','Title length 30-65 chars','Meta description','Description 70-165 chars','Social sharing tags'],
         'Structure':['One H1','2+ H2 headings','300+ words','Alt text on images'],
         'Crawl':['Canonical tag','Allowed in Google','In sitemap','Mobile PageSpeed 90+'],
         'Links':['3+ internal links']},
    aeo:{'Schema':['Breadcrumb schema','Structured data type tag'],
         'FAQ content':['FAQ with 3+ questions','FAQ data matches visible text','3+ question-phrased headings'],
         'Answers':['Short summary near top','Lists or tables']},
    geo:{'Business':['Organization schema','Google Business Profile linked','Phone number on page'],
         'Authority':['8+ specific facts','Cites an authority','Names Sabra & Co 3+ times','Shows last-updated date'],
         'AI access':['Listed in llms.txt','AI crawlers allowed','600+ words']}
  };

  // what each failed check means, and how urgent it is
  var ADVICE={
    'Allowed in Google':['high','is in your sitemap but tells Google not to index it. Remove the noindex tag, or take it out of the sitemap.'],
    'Page title':['high','has no page title. The title is the blue link people click in Google.'],
    'Meta description':['high','has no meta description, so Google writes its own snippet.'],
    'One H1':['high','should have exactly one main heading (H1).'],
    'Canonical tag':['high','is missing a canonical tag, which tells Google which address is the real one.'],
    'Organization schema':['high','is missing your business schema (name, address, phone), which local search relies on.'],
    'Google Business Profile linked':['high','does not link your Google Business Profile in its business schema (sameAs), a key local search signal.'],
    'Breadcrumb schema':['high','has no breadcrumb schema, or its breadcrumb points to a different page.'],
    'FAQ data matches visible text':['high','has FAQ questions in its schema that are not visible on the page. Google ignores or penalizes hidden FAQ answers.'],
    'Title length 30-65 chars':['medium','has a title outside 30 to 65 characters, so Google may cut it off or ignore it.'],
    'Description 70-165 chars':['medium','has a description outside 70 to 165 characters.'],
    'Social sharing tags':['medium','is missing Open Graph tags (title, description, image), so shared links show without a preview.'],
    'Alt text on images':['medium','has images with no alt text, which hurts accessibility and image search.'],
    'In sitemap':['medium','is not in your sitemap.'],
    '3+ internal links':['medium','links to fewer than 3 of your other pages. Internal links help Google and visitors find more of the site.'],
    '300+ words':['medium','has under 300 words of real content.'],
    'Mobile PageSpeed 90+':['medium','scored under 90 on the last mobile PageSpeed test.'],
    'FAQ with 3+ questions':['medium','has no FAQ section with at least 3 questions. FAQs are what AI answers and Google most often quote.'],
    '3+ question-phrased headings':['medium','has fewer than 3 headings written as questions people actually search.'],
    'Shows last-updated date':['medium','does not show a published or last-updated date. AI tools favor content that is clearly current.'],
    'Phone number on page':['medium','does not show your phone number.'],
    'Listed in llms.txt':['medium','is not listed in llms.txt, the file that tells AI tools what your site covers.'],
    '2+ H2 headings':['low','has fewer than 2 section headings (H2).'],
    'Short summary near top':['low','has no short summary paragraph before its first section. AI answers often quote the opening summary.'],
    'Lists or tables':['low','has no lists or tables. Scannable lists get quoted more often.'],
    'Structured data type tag':['low','does not say what kind of page it is in structured data (for example BlogPosting).'],
    '8+ specific facts':['low','has few specific facts (numbers, prices, measurements). Specifics make content more quotable.'],
    'Cites an authority':['low','does not link to any outside source. One credible citation builds trust. (Checked on blog posts only.)'],
    'Names Sabra & Co 3+ times':['low','mentions Sabra & Co fewer than 3 times, which weakens the link between the topic and your brand.'],
    '600+ words':['low','has under 600 words. Longer, thorough pages are cited more by AI answers.'],
    'AI crawlers allowed':['high','is blocked from AI crawlers in robots.txt, so ChatGPT and others cannot read or cite it.']
  };

  function clean(s){ return (s||'').replace(/\s+/g,' ').trim(); }
  function wordCount(s){ return s?s.split(' ').filter(function(w){ return /[A-Za-z0-9]/.test(w); }).length:0; }
  function norm(s){ return clean(s).toLowerCase().replace(/[‘’]/g,"'").replace(/[“”]/g,'"').replace(/[^a-z0-9' ]/g,' ').replace(/\s+/g,' ').trim(); }
  function slugOf(u){ try{ var p=new URL(u,SITE).pathname; return p||'/'; }catch(e){ return u; } }
  function typesOf(o){ var t=o['@type']; return Array.isArray(t)?t:[t]; }
  function hasType(o,list){ return typesOf(o).some(function(t){ return list.indexOf(t)>-1; }); }

  function readLd(doc){
    var out=[];
    doc.querySelectorAll('script[type="application/ld+json"]').forEach(function(s){
      try{
        (function walk(o){
          if(Array.isArray(o)) o.forEach(walk);
          else if(o&&typeof o==='object'){ if(o['@type']) out.push(o); if(o['@graph']) walk(o['@graph']); }
        })(JSON.parse(s.textContent));
      }catch(e){}
    });
    return out;
  }

  function mainOf(doc){
    var m=(doc.querySelector('main')||doc.body).cloneNode(true);
    m.querySelectorAll('nav,header,footer,script,style,noscript,form,.nl-post,[aria-hidden="true"]').forEach(function(n){ n.remove(); });
    return m;
  }

  function robotsBlocks(robots,path,agents){
    // true when a group for one of these agents (or *) disallows this path
    var groups=[], cur=null;
    (robots||'').split(/\r?\n/).forEach(function(line){
      line=line.replace(/#.*/,'').trim(); if(!line) return;
      var m=line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/); if(!m) return;
      var k=m[1].toLowerCase(), v=m[2].trim();
      if(k==='user-agent'){ if(!cur||cur.rules.length){ cur={agents:[],rules:[]}; groups.push(cur); } cur.agents.push(v.toLowerCase()); }
      else if(cur&&(k==='disallow'||k==='allow')) cur.rules.push([k,v]);
    });
    return agents.some(function(a){
      var g=groups.filter(function(g){ return g.agents.indexOf(a.toLowerCase())>-1; });
      if(!g.length) g=groups.filter(function(g){ return g.agents.indexOf('*')>-1; });
      var best=null;
      g.forEach(function(gr){ gr.rules.forEach(function(r){
        if(r[1]&&path.indexOf(r[1])===0&&(!best||r[1].length>best[1].length||(r[1].length===best[1].length&&r[0]==='allow'))) best=r;
      }); });
      return !!(best&&best[0]==='disallow');
    });
  }

  function auditPage(url,html,site,env){
    env=env||{};
    var doc=new env.DOMParser().parseFromString(html,'text/html');
    var path=slugOf(url), ld=readLd(doc), main=mainOf(doc);
    var bodyText=clean(doc.body?doc.body.textContent:''), mainText=clean(main.textContent), words=wordCount(mainText);
    var title=clean(doc.title), descEl=doc.querySelector('meta[name="description"]'), desc=descEl?clean(descEl.getAttribute('content')):'';
    var robotsMeta=(doc.querySelector('meta[name="robots"]')||{getAttribute:function(){return '';}}).getAttribute('content')||'';
    var isPost=ld.some(function(o){ return hasType(o,POST_TYPES); });
    var org=ld.filter(function(o){ return hasType(o,ORG_TYPES); });
    var sameAs=[]; org.forEach(function(o){ sameAs=sameAs.concat(o.sameAs||[]); });
    var faq=ld.filter(function(o){ return hasType(o,['FAQPage']); });
    var faqQs=[]; faq.forEach(function(f){ (f.mainEntity||[]).forEach(function(q){ if(q&&q.name) faqQs.push(q.name); }); });
    var crumbs=ld.filter(function(o){ return hasType(o,['BreadcrumbList']); });
    var crumbOk=crumbs.some(function(c){
      var items=c.itemListElement||[]; var last=items[items.length-1]; if(!last) return false;
      var target=last.item&&(last.item['@id']||last.item)||'';
      return slugOf(String(target))===path;
    });
    var h2=main.querySelectorAll('h2').length;
    var qHeads=Array.prototype.filter.call(main.querySelectorAll('h2,h3'),function(h){ return /\?\s*$/.test(clean(h.textContent)); }).length;
    var summary=false;   // a 15 to 90 word paragraph before the first H2
    Array.prototype.some.call(main.querySelectorAll('h2,p'),function(p){
      if(String(p.tagName).toUpperCase()==='H2') return true;   // past the first section
      var w=wordCount(clean(p.textContent)); if(w>=15&&w<=90){ summary=true; return true; } return false;
    });
    var lists=Array.prototype.some.call(main.querySelectorAll('ul,ol,table'),function(l){ return l.tagName==='TABLE'||l.querySelectorAll('li').length>=2; });
    var internal={}, external=0;
    main.querySelectorAll('a[href]').forEach(function(a){
      var h=a.getAttribute('href'); if(!h||h.charAt(0)==='#'||/^(mailto|tel|javascript):/i.test(h)) return;
      try{
        var u=new URL(h,url);
        if(/sabraandcompany\.com$/i.test(u.hostname)){ if(slugOf(u.href)!==path) internal[slugOf(u.href)]=1; }
        else if(!/instagram|pinterest|linkedin|facebook|tiktok|youtube|share\.google/i.test(u.hostname)) external++;
      }catch(e){}
    });
    var imgs=Array.prototype.filter.call(doc.querySelectorAll('img'),function(i){ return !i.closest('[aria-hidden="true"]')&&i.getAttribute('role')!=='presentation'; });
    var altOk=imgs.every(function(i){ return i.hasAttribute('alt'); });
    var facts=(mainText.match(/\$?\d[\d,.]*\s?(%|k\b|percent|sq|ft|feet|inch|in\b|hours?|days?|weeks?|years?|minutes?)?/gi)||[]).length;
    var brand=(bodyText.match(/Sabra\s*(&|&amp;|and)\s*Co/gi)||[]).length;
    var dated=!!doc.querySelector('time')||/(updated|published|posted)\W{0,3}[^.]{0,40}\b20\d\d\b/i.test(bodyText);
    var phone=!!doc.querySelector('a[href^="tel:"]')||/\(?\b\d{3}\)?[\s.\-]\d{3}[\s.\-]\d{4}\b/.test(bodyText);
    var bodyNorm=norm(bodyText);
    // a question counts as visible if it appears on the page, or a heading/line says nearly the same thing
    var lines=Array.prototype.map.call(doc.body.querySelectorAll('h2,h3,h4,h5,summary,dt,button,strong,p,li'),function(e){ return norm(e.textContent); });
    var STOP=' the and for you your are does what how who can with this that from into our its his her was will has have any not '; 
    function tokens(t){ return t.split(' ').filter(function(w){ return w.length>2&&STOP.indexOf(' '+w+' ')<0; }); }
    function visibleQ(q){
      var n=norm(q); if(bodyNorm.indexOf(n)>-1) return true;
      var qt=tokens(n); if(!qt.length) return true;
      return lines.some(function(l){ if(l.length>n.length*2.5) return false; var lt=tokens(l); return qt.filter(function(w){ return lt.indexOf(w)>-1; }).length/qt.length>=0.75; });
    }
    var faqHidden=faqQs.filter(function(q){ return !visibleQ(q); });
    var faqVisible=faqQs.length?!faqHidden.length:'na';
    var inLlms=site.llms===null?0:(site.llms.indexOf(SITE+(path==='/'?'':path))>-1||(path==='/'&&/sabraandcompany\.com\/?(\s|\)|$)/m.test(site.llms))||site.llms.indexOf('('+path+')')>-1)?1:0;
    var sc=env.speed&&env.speed[url], spd=sc==null?null:(typeof sc==='object'?sc.score:sc);
    var noindex=/noindex/i.test(robotsMeta)||robotsBlocks(site.robots,path,['Googlebot']);
    var b=function(x){ return x?1:0; };

    var p={
      url:url, slug:path, type:isPost?'Blog post':'Page', words:words,
      name:path==='/'?'Homepage':(title.split('|')[0].trim()||clean((doc.querySelector('h1')||{}).textContent)||path),
      faqHidden:faqHidden,
      published:(ld.filter(function(o){ return hasType(o,POST_TYPES); })[0]||{}).datePublished||'',
      noindex:noindex, inSitemap:site.sitemap.indexOf(url)>-1,
      hasReviews:ld.some(function(o){ return hasType(o,['Review','AggregateRating'])||o.aggregateRating||o.review; }),
      seoChecks:[['Page title',b(title)],['Title length 30-65 chars',b(title.length>=30&&title.length<=65)],
        ['Meta description',b(desc)],['Description 70-165 chars',b(desc.length>=70&&desc.length<=165)],
        ['One H1',b(doc.querySelectorAll('h1').length===1)],['Canonical tag',b(doc.querySelector('link[rel="canonical"]'))],
        ['Allowed in Google',b(!noindex)],['In sitemap',b(site.sitemap.indexOf(url)>-1)],['300+ words',b(words>=300)],
        ['Alt text on images',b(altOk)],['Social sharing tags',b(doc.querySelector('meta[property="og:title"]')&&doc.querySelector('meta[property="og:description"]')&&doc.querySelector('meta[property="og:image"]'))],
        ['2+ H2 headings',b(h2>=2)],['3+ internal links',b(Object.keys(internal).length>=3)],
        ['Mobile PageSpeed 90+',spd===null?'na':b(spd>=90)]],
      aeoChecks:[['FAQ with 3+ questions',b(faqQs.length>=3)],['FAQ data matches visible text',faqVisible==='na'?'na':b(faqVisible)],
        ['3+ question-phrased headings',b(qHeads>=3)],['Short summary near top',b(summary)],['Lists or tables',b(lists)],
        ['Breadcrumb schema',b(crumbOk)],['Structured data type tag',b(ld.some(function(o){ return !hasType(o,['BreadcrumbList'].concat(ORG_TYPES)); }))]],
      geoChecks:[['Organization schema',b(org.length)],['Google Business Profile linked',b(sameAs.some(function(s){ return GBP_RE.test(s); }))],
        ['8+ specific facts',b(facts>=8)],['Cites an authority',isPost?b(external>=1):'na'],['Names Sabra & Co 3+ times',b(brand>=3)],
        ['Shows last-updated date',b(dated)],['Listed in llms.txt',inLlms],['600+ words',b(words>=600)],
        ['Phone number on page',b(phone)],['AI crawlers allowed',b(!robotsBlocks(site.robots,path,AI_BOTS))]]
    };
    function score(list){ var s=list.filter(function(c){ return c[1]===1||c[1]===0; }); return s.length?Math.round(100*s.filter(function(c){ return c[1]===1; }).length/s.length):100; }
    p.seo=score(p.seoChecks); p.aeo=score(p.aeoChecks); p.geo=score(p.geoChecks);
    var fails=p.seoChecks.concat(p.aeoChecks,p.geoChecks).filter(function(c){ return c[1]===0; });
    var order={high:0,medium:1,low:2};
    fails.sort(function(a,c){ return order[(ADVICE[a[0]]||['low'])[0]]-order[(ADVICE[c[0]]||['low'])[0]]; });
    p.fix=fails.length?'Fix: '+fails[0][0]+(fails.length>1?' (+'+(fails.length-1)+' more)':''):'No fixes needed.';
    p.warnFix=fails.length&&(ADVICE[fails[0][0]]||['low'])[0]!=='low';
    p.indexLabel=noindex?'Hidden from Google':p.inSitemap?'In sitemap':'Not in sitemap';
    return p;
  }

  function blogLinks(html){
    var out={}; (html||'').replace(/href="\/?([a-z0-9\-]+\.html)"/gi,function(_,h){ if(!/^(index|about|services|contact|gallery|blog|thank-you)\.html$/.test(h)) out['/'+h]=1; });
    return Object.keys(out);
  }

  var REC_TITLES={
    'Allowed in Google':'Page hidden from Google','Page title':'Missing page title','Meta description':'Missing meta description',
    'One H1':'Fix the main heading (H1)','Canonical tag':'Missing canonical tag','Organization schema':'Missing business schema',
    'Google Business Profile linked':'Link your Google Business Profile','Breadcrumb schema':'Fix breadcrumb schema',
    'FAQ data matches visible text':'FAQ schema does not match the page','Title length 30-65 chars':'Adjust title length',
    'Description 70-165 chars':'Adjust description length','Social sharing tags':'Add social sharing tags','Alt text on images':'Add image alt text',
    'In sitemap':'Add to sitemap','3+ internal links':'Add internal links','300+ words':'Add more content','Mobile PageSpeed 90+':'Improve mobile speed',
    'FAQ with 3+ questions':'Add an FAQ section','3+ question-phrased headings':'Phrase headings as questions','Shows last-updated date':'Show a last-updated date',
    'Phone number on page':'Show your phone number','Listed in llms.txt':'Add pages to llms.txt','2+ H2 headings':'Add section headings',
    'Short summary near top':'Open with a short summary','Lists or tables':'Add a list or table','Structured data type tag':'Tag the page type',
    '8+ specific facts':'Add specific facts','Cites an authority':'Cite an outside source','Names Sabra & Co 3+ times':'Mention Sabra & Co more',
    '600+ words':'Go deeper on the topic','AI crawlers allowed':'Allow AI crawlers'
  };

  function buildRecs(PAGES,site,now){
    var recs=[], byLabel={}, order={high:0,medium:1,low:2}; site=site||{}; now=now||Date.now();
    PAGES.forEach(function(p){
      p.seoChecks.concat(p.aeoChecks,p.geoChecks).forEach(function(c){ if(c[1]===0) (byLabel[c[0]]=byLabel[c[0]]||[]).push(p); });
    });

    if(site.llms===false){
      recs.push({pri:'medium',title:'Add an llms.txt file',body:'Your site has no llms.txt, the short file that tells AI tools like ChatGPT and Perplexity who you are and which pages matter most. Adding it fixes the llms.txt check on every page at once.'});
      delete byLabel['Listed in llms.txt'];
    }
    // new posts that are on the blog page but not in the sitemap
    var missing=(site.blogLinks||[]).filter(function(s){ return (site.sitemap||[]).indexOf(SITE+s)<0; });
    if(missing.length) recs.push({pri:'high',title:'Add new posts to your sitemap',body:'Your blog links to '+missing.join(', ')+' but '+(missing.length>1?'they are':'it is')+' not in sitemap.xml, so Google may not find '+(missing.length>1?'them':'it')+'.'});
    // posting rhythm: every two weeks
    var dates=PAGES.filter(function(p){ return p.type==='Blog post'&&p.published; }).map(function(p){ return new Date(p.published).getTime(); }).filter(function(t){ return !isNaN(t); });
    if(dates.length){
      var days=Math.floor((now-Math.max.apply(null,dates))/86400000);
      if(days>16) recs.push({pri:'high',title:'Time for a new post',body:'Your last post went up '+days+' days ago. You publish every two weeks, so the next one is due.'});
    }
    if(PAGES.length&&!PAGES.some(function(p){ return p.hasReviews; }))
      recs.push({pri:'medium',title:'Add client testimonials with review schema',body:'No page has review or rating structured data yet. Even 3 to 5 real client testimonials marked up with Review schema can earn star ratings in search results.'});

    Object.keys(byLabel).forEach(function(label){
      var pages=byLabel[label], adv=ADVICE[label]||['low','needs attention.'];
      var names=pages.map(function(p){ return p.name; });
      var body=(pages.length===1?'“'+names[0]+'” ':'Each of these '+pages.length+' pages ')+adv[1]+(pages.length>1?' Pages: '+names.join(', ')+'.':'');
      if(label==='FAQ data matches visible text') body+=' Questions in the code but not on the page: '+pages.map(function(p){ return p.name+': \u201C'+(p.faqHidden||[]).join('\u201D, \u201C')+'\u201D'; }).join('; ')+'.';
      recs.push({pri:adv[0],title:REC_TITLES[label]||label,body:body,count:pages.length});
    });
    recs.sort(function(a,b){ return order[a.pri]-order[b.pri]||(b.count||0)-(a.count||0); });
    return recs;
  }

  // averages and per-group pass rates, exactly as the dashboard shows them
  function summarize(PAGES){
    var n=PAGES.length||1, out={pages:PAGES.length,groups:{}};
    ['seo','aeo','geo'].forEach(function(cat){
      out[cat]=Math.round(PAGES.reduce(function(s,p){ return s+p[cat]; },0)/n);
      out.groups[cat]={};
      Object.keys(GROUPS[cat]).forEach(function(g){
        var labels=GROUPS[cat][g], pass=0, tot=0;
        PAGES.forEach(function(p){ p[cat+'Checks'].forEach(function(c){ if(labels.indexOf(c[0])>-1&&(c[1]===1||c[1]===0)){ tot++; pass+=c[1]; } }); });
        out.groups[cat][g]=tot?Math.round(100*pass/tot):100;
      });
    });
    return out;
  }
  return {SITE:SITE,GROUPS:GROUPS,ADVICE:ADVICE,REC_TITLES:REC_TITLES,auditPage:auditPage,blogLinks:blogLinks,buildRecs:buildRecs,summarize:summarize,robotsBlocks:robotsBlocks,slugOf:slugOf};
});
