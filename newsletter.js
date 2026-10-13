/* Newsletter signup: wires every form[data-subscribe] on the page and shows the
   slide-in card once a visitor has been reading for a while.

   When the card appears:  after 30 seconds on the site (counted across pages, at least
                           6 seconds on the current page), or after 60% of a blog post,
                           whichever comes first.
   How often:              once; closed = hidden for 30 days, ignored = 7 days,
                           subscribed = never again.
   Never on:               contact, thank-you and admin pages. */
(function () {
  'use strict';

  var KEY = 'sc_nl';            // remembered across visits
  var START = 'sc_nl_start';    // when this browsing session began
  var DAY = 86400000;
  var SITE_SECONDS = 30;
  var PAGE_MIN_SECONDS = 6;
  var POST_SCROLL = 0.6;

  function store(kind) {
    try { return kind === 'session' ? window.sessionStorage : window.localStorage; } catch (e) { return null; }
  }
  function readState() {
    var s = store('local');
    try { return s ? JSON.parse(s.getItem(KEY) || 'null') : null; } catch (e) { return null; }
  }
  function writeState(state) {
    var s = store('local');
    try { if (s) s.setItem(KEY, JSON.stringify({ s: state, t: Date.now() })); } catch (e) {}
  }

  /* ---------------------------------------------------------------- forms */
  function wire(form) {
    if (form.__wired) return;
    form.__wired = true;
    var status = form.querySelector('.nl-status');
    var button = form.querySelector('button[type=submit]');

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = form.querySelector('input[type=email]');
      var trap = form.querySelector('input[name=website]');
      if (!email.value.trim()) { email.focus(); return; }

      form.classList.add('is-sending');
      button.disabled = true;
      if (status) status.textContent = 'Adding you…';

      fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.value,
          source: form.getAttribute('data-subscribe') || 'website',
          website: trap ? trap.value : ''
        })
      }).then(function (r) {
        return r.json().catch(function () { return { ok: false }; });
      }).then(function (data) {
        if (data && data.ok) {
          writeState('subscribed');
          form.classList.add('is-done');
          form.innerHTML = '<div class="nl-done" role="status">' +
            (data.already ? 'You’re already on the list. Thank you!'
                          : 'You’re on the list. Check your inbox for a welcome note.') + '</p>';
          if (form.closest('.nl-card')) setTimeout(hideCard, 3200);
        } else {
          throw new Error((data && data.error) || 'error');
        }
      }).catch(function (err) {
        form.classList.remove('is-sending');
        button.disabled = false;
        if (status) {
          status.textContent = (err && err.message && err.message !== 'error' && err.message.indexOf('Failed') !== 0)
            ? err.message : 'Something went wrong. Please try again.';
        }
      });
    });
  }

  function formHTML(source, idSuffix) {
    var id = 'nl-email-' + idSuffix;
    return '<form class="nl-form" data-subscribe="' + source + '" novalidate>' +
      '<label class="nl-label" for="' + id + '">Email address</label>' +
      '<div class="nl-row">' +
      '<input id="' + id + '" type="email" name="email" autocomplete="email" required placeholder="you@example.com">' +
      '<button type="submit">' + (source === 'popup' ? 'I\u2019m in' : 'Subscribe') + '</button></div>' +
      '<input class="nl-trap" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">' +
      '<div class="nl-status" aria-live="polite"></div></form>';
  }

  /* ---------------------------------------------------------------- card */
  var CARD_CSS = ".nl-card{position:fixed;right:24px;bottom:24px;z-index:120;width:470px;max-width:calc(100vw - 24px);display:grid;grid-template-columns:150px 1fr;background:#F5F0E8;border:1px solid rgba(155,135,108,.4);box-shadow:0 18px 50px rgba(30,26,22,.18);transform:translateY(24px);opacity:0;transition:transform .45s cubic-bezier(.22,.61,.36,1),opacity .45s ease}.nl-card.is-in{transform:none;opacity:1}.nl-photo{position:relative;overflow:hidden;background:#E8DFD2}.nl-photo img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:50% 28%;display:block}.nl-body{padding:24px 24px 16px 22px;min-width:0}.nl-card .nl-eyebrow{font-family:'Jost','Jost Fallback',sans-serif;font-size:.62rem;letter-spacing:.22em;text-transform:uppercase;color:#6D6154}.nl-card .nl-title{font-family:'Cormorant','Cormorant Fallback',serif;font-size:1.5rem;font-weight:300;line-height:1.18;color:#1E1A16;margin:.1rem 1.6rem .6rem 0;text-wrap:balance}.nl-card .nl-text{font-family:'Jost','Jost Fallback',sans-serif;font-size:.88rem;font-weight:300;line-height:1.6;color:#3E352D}.nl-list{list-style:none;margin:.45rem 0 0;padding:0}.nl-list li{font-family:'Jost','Jost Fallback',sans-serif;font-size:.86rem;font-weight:300;line-height:1.5;color:#3E352D;padding-left:1.1rem;position:relative;margin:.2rem 0}.nl-list li::before{content:'';position:absolute;left:0;top:.72em;width:.6rem;height:1px;background:#B08D57}.nl-card .nl-form{margin-top:.9rem;max-width:none}.nl-short{display:none}.nl-fine{font-family:'Jost','Jost Fallback',sans-serif;font-size:.72rem;color:#6D6154;margin-top:.15rem}.nl-close{position:absolute;top:4px;right:4px;z-index:2;width:40px;height:40px;border:0;background:transparent;font-size:1.6rem;line-height:1;color:#6D6154;cursor:pointer}.nl-close:hover{color:#1E1A16}.nl-close:focus-visible,.nl-row button:focus-visible{outline:2px solid #1E1A16;outline-offset:2px}@media (max-width:600px){.nl-card{display:block;left:12px;right:12px;bottom:12px;width:auto;max-width:none}.nl-photo{position:absolute;top:14px;left:16px;width:48px;height:48px;border-radius:50%}.nl-body{padding:14px 16px 10px}.nl-card .nl-eyebrow{display:none}.nl-card .nl-title{font-size:1.18rem;line-height:1.2;margin:0 2.2rem 0 60px;min-height:48px;display:flex;align-items:center}.nl-card .nl-text{font-size:.82rem;margin-top:.5rem}.nl-list{display:none}.nl-card .nl-form{margin-top:.55rem}.nl-card .nl-label{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}.nl-fine{display:none}.nl-wide{display:none}.nl-short{display:inline}}@media (prefers-reduced-motion:reduce){.nl-card{transition:none}}";
  function addCardStyles() {
    if (document.getElementById('nl-card-css')) return;
    var st = document.createElement('style');
    st.id = 'nl-card-css';
    st.textContent = CARD_CSS;
    document.head.appendChild(st);
  }

  var card = null;

  function hideCard() {
    if (!card) return;
    var c = card;
    card = null;
    c.classList.remove('is-in');
    setTimeout(function () { if (c.parentNode) c.parentNode.removeChild(c); }, 450);
    document.removeEventListener('keydown', onKey);
  }

  function onKey(e) {
    if (e.key === 'Escape' && card) { writeState('dismissed'); hideCard(); }
  }

  function showCard() {
    if (card || shown) return;
    shown = true;
    writeState('shown');
    addCardStyles();
    card = document.createElement('div');
    card.className = 'nl-card';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'false');
    card.setAttribute('aria-labelledby', 'nl-card-title');
    card.innerHTML =
      '<button type="button" class="nl-close" aria-label="Close">\u00d7</button>' +
      '<div class="nl-photo"><img src="images/sabra-newsletter.jpg" ' +
      'srcset="images/sabra-newsletter-150.webp 150w, images/sabra-newsletter-300.webp 300w, images/sabra-newsletter-600.webp 600w" ' +
      'sizes="(max-width:600px) 48px, 190px" width="600" height="1304" ' +
      'alt="Sabra, founder of Sabra &amp; Co., smiling at her desk"></div>' +
      '<div class="nl-body">' +
      '<div class="nl-title" id="nl-card-title">The best thing I ever did was ignore everyone\u2019s advice.</div>' +
      '<div class="nl-text"><span class="nl-wide">Every other week I\u2019ll tell you what else I\u2019m ignoring, and what I\u2019m buying instead.</span>' +
      '<span class="nl-short">Every other week: what else I\u2019m ignoring, what I\u2019m buying instead, and a peek at what I\u2019m working on.</span></div>' +
      '<ul class="nl-list"><li>Design tips you can actually use</li>' +
      '<li>My newest favorite finds</li><li>A peek at what I\u2019m working on</li></ul>' +
      formHTML('popup', 'card') +
      '<div class="nl-fine">Unsubscribe anytime. No hard feelings.</div></div>';
    document.body.appendChild(card);
    card.querySelector('.nl-close').addEventListener('click', function () {
      writeState('dismissed');
      hideCard();
    });
    document.addEventListener('keydown', onKey);
    wire(card.querySelector('form'));
    // next frame, so the slide-in transition runs
    requestAnimationFrame(function () { requestAnimationFrame(function () {
      if (card) card.classList.add('is-in');
    }); });
  }

  var shown = false;

  function cardAllowed() {
    if (/(contact|thank-you|admin)(\.html)?\/?$/.test(location.pathname)) return false;
    var st = readState();
    if (!st) return true;
    var age = Date.now() - (st.t || 0);
    if (st.s === 'subscribed') return false;
    if (st.s === 'dismissed') return age > 30 * DAY;
    if (st.s === 'shown') return age > 7 * DAY;
    return true;
  }

  function scheduleCard() {
    if (!cardAllowed()) return;

    var ss = store('session');
    var start = Date.now();
    try {
      var saved = ss && parseInt(ss.getItem(START), 10);
      if (saved) start = saved; else if (ss) ss.setItem(START, String(start));
    } catch (e) {}
    var wait = Math.max(SITE_SECONDS * 1000 - (Date.now() - start), PAGE_MIN_SECONDS * 1000);
    var timer = setTimeout(showCard, wait);

    if (document.querySelector('.post-body')) {
      var pageStart = Date.now();
      var onScroll = function () {
        var max = document.documentElement.scrollHeight - window.innerHeight;
        if (max > 0 && window.scrollY / max >= POST_SCROLL &&
            Date.now() - pageStart > PAGE_MIN_SECONDS * 1000) {
          window.removeEventListener('scroll', onScroll);
          clearTimeout(timer);
          showCard();
        }
      };
      window.addEventListener('scroll', onScroll, { passive: true });
    }
  }

  function init() {
    var forms = document.querySelectorAll('form[data-subscribe]');
    for (var i = 0; i < forms.length; i++) wire(forms[i]);
    // someone already on the list sees a thank-you instead of the inline forms
    var st = readState();
    if (st && st.s === 'subscribed') {
      for (var j = 0; j < forms.length; j++) {
        forms[j].innerHTML = '<div class="nl-done">You’re on the list. Thank you!</div>';
      }
    }
    scheduleCard();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
