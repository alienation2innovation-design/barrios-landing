import assert from 'node:assert/strict';
import { before, test } from 'node:test';

import { useStaticSite } from './support/site.mjs';

// Hermetic by default: this starts its own static server over public/ on an
// operating-system-assigned port and stops it in an `after` hook. Set
// HOMEPAGE_URL to run against an external server instead. Nothing here requires
// a listener to already exist.
const site = useStaticSite();
let homepageUrl;

const requiredSocialCounts = new Map([
  ['https://www.linkedin.com/in/gary-barrios-3953b2390/', 2],
  ['https://x.com/BarriosA2I', 1],
  ['https://www.instagram.com/barriosa2i/', 1],
  ['https://www.tiktok.com/@garyjbarrios', 1],
  ['https://www.reddit.com/user/BarriosA2I/', 2],
  ['https://github.com/alienation2innovation-design', 2]
]);

let response;
let html;
let markup;
let stylesheetResponse;
let stylesheet;

function stripExecutableContent(documentText) {
  return documentText
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
}

function getAttribute(tag, name) {
  const match = tag.match(new RegExp(`\\s${name}=(?:"([^"]*)"|'([^']*)')`, 'i'));
  return match?.[1] ?? match?.[2] ?? null;
}

function openingTagsWith(attribute) {
  return [...markup.matchAll(/<(?:a|button)\b[^>]*>/gi)]
    .map((match) => match[0])
    .filter((tag) => getAttribute(tag, attribute) !== null);
}

function stripComments(scriptText) {
  return scriptText.replace(/\/\*[\s\S]*?\*\//g, '');
}

// The widget script mixes tightly-minified single-line statements with
// multi-line block comments; once a comment is stripped, the indentation and
// newlines that surrounded it remain. Collapsing every run of whitespace to
// a single space makes structural regexes robust to that without touching
// any string literal's visible content in a way these tests rely on.
function normalizeCode(scriptText) {
  return stripComments(scriptText).replace(/\s+/g, ' ');
}

before(async () => {
  await site.ready();
  homepageUrl = site.url;
  response = await fetch(homepageUrl, { redirect: 'manual' });
  html = await response.text();
  markup = stripExecutableContent(html);
  stylesheetResponse = await fetch(new URL('/aura-landing.css', homepageUrl));
  stylesheet = await stylesheetResponse.text();
});

test('the served root is the approved Barrios A2I Aura experience', () => {
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /text\/html/i);
  assert.match(markup, /Barrios A2I — connected marketing automation built around your business/i);
  assert.match(markup, /id="nexus-panel"[^>]*role="dialog"/i);
  assert.match(markup, /Explore your automation with NEXUS\./i);
});

test('the first viewport has a visible marketing headline without depending on WebGL', () => {
  const hero = markup.match(/<section\b[^>]*id="hero"[^>]*>[\s\S]*?<\/section>/i)?.[0] ?? '';
  const heading = hero.match(/<h1\b[^>]*>[\s\S]*?<\/h1>/i)?.[0] ?? '';

  assert.match(heading, /class="hero__title"/i);
  assert.doesNotMatch(heading, /\bsr-only\b/i);
  assert.match(heading.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '), /Marketing automation built around your business\./i);
  assert.match(hero, /class="hero__eyebrow"[^>]*>\s*Barrios A2I/i);
  assert.match(hero, /From lead capture to customer follow-up/i);
  assert.match(html, /\.hero__title\s*\{[^}]*color:\s*var\(--paper\)/i);
});

test('the served document keeps the Barrios message readable without JavaScript', () => {
  const fallback = markup.match(/<noscript>[\s\S]*?<\/noscript>/i)?.[0] ?? '';
  assert.match(fallback, /Barrios A2I/i);
  assert.match(fallback, /connected marketing automation built around your business/i);
  assert.match(fallback, /href="#no-js-automate"/i);
  assert.doesNotMatch(fallback, /preview|prototype/i, 'the no-JS copy must describe the NEXUS AI beta honestly');
});

test('the Meet Gary panel and compact footer expose the approved profiles without Facebook', () => {
  const anchors = [...markup.matchAll(/<a\b[^>]*>/gi)].map((match) => match[0]);

  for (const [socialUrl, expectedCount] of requiredSocialCounts) {
    const matching = anchors.filter((tag) => getAttribute(tag, 'href') === socialUrl);
    assert.equal(matching.length, expectedCount, `${socialUrl} must appear in every approved location`);
    for (const tag of matching) {
      assert.equal(getAttribute(tag, 'target'), '_blank');
      assert.equal(getAttribute(tag, 'rel'), 'noopener noreferrer');
      assert.ok(getAttribute(tag, 'aria-label'), `${socialUrl} must have an accessible name`);
    }
  }

  assert.doesNotMatch(markup, /https:\/\/www\.instagram\.com\/barrios\.ai\.gary\//i);
  assert.doesNotMatch(markup, /(?:href|aria-label)=["'][^"']*facebook/i);
});

test('the homepage uses local production assets instead of Aura or Tailwind CDNs', () => {
  assert.doesNotMatch(html, /cdn\.tailwindcss\.com/i);
  assert.doesNotMatch(html, /hoirqrkdgbmvpwutwuwj\.supabase\.co/i);
  assert.doesNotMatch(html, /assets\/portraits\/voice-/i);
  assert.match(markup, /<link\b[^>]*href="\/aura-landing\.css"/i);

  const logos = [...markup.matchAll(/<img\b[^>]*>/gi)]
    .map((match) => match[0])
    .filter((tag) => getAttribute(tag, 'src') === '/brand/barrios-a2i-logo.png');
  assert.ok(logos.length >= 3, 'header, NEXUS, and footer must use the local Barrios A2I logo');
});

test('the local production stylesheet stays below the duplicate-CSS budget', () => {
  assert.equal(stylesheetResponse.status, 200);
  assert.match(stylesheetResponse.headers.get('content-type') ?? '', /text\/css/i);
  assert.ok(Buffer.byteLength(stylesheet, 'utf8') < 8 * 1024, 'Aura already carries its utility layer; deployment CSS must stay under 8 KiB');
});

test('every nonempty internal fragment link resolves to an element on the page', () => {
  const ids = new Set(
    [...markup.matchAll(/\sid=(?:"([^"]+)"|'([^']+)')/gi)]
      .map((match) => match[1] ?? match[2])
  );
  const fragments = [...markup.matchAll(/<a\b[^>]*\shref=(?:"(#[^"]*)"|'(#[^']*)')[^>]*>/gi)]
    .map((match) => match[1] ?? match[2])
    .filter((href) => href.length > 1)
    .map((href) => decodeURIComponent(href.slice(1)));

  for (const fragment of fragments) {
    assert.ok(ids.has(fragment), `#${fragment} must resolve to an element id`);
  }
});

test('the visible legal links point to the existing site pages', () => {
  assert.match(markup, /<a\b[^>]*href="\/privacy-directive\.html"[^>]*>Privacy<\/a>/i);
  assert.match(markup, /<a\b[^>]*href="\/terms-of-service\.html"[^>]*>Terms<\/a>/i);
});

test('the consultation CTA stays inside the compact footer and every NEXUS opener controls the shared dialog', () => {
  const footerPosition = markup.indexOf('class="aura-footer"');
  const finalCtaPosition = markup.indexOf('class="aura-footer__cta');
  const consultationPosition = markup.indexOf('class="aura-footer__book"');
  assert.ok(footerPosition >= 0 && footerPosition < finalCtaPosition, 'the closing CTA must be inside the footer');
  assert.ok(finalCtaPosition < consultationPosition, 'the consultation CTA must follow the footer CTA copy');
  assert.doesNotMatch(markup, /class="footer-booking|class="foot__top/i);
  assert.doesNotMatch(markup, /data-nexus-book|data-nexus-schedule|Book with NEXUS/i, 'no opener may claim booking or scheduling');

  const openers = openingTagsWith('data-nexus-open');
  assert.ok(openers.length >= 4, 'hero, launcher, Meet Gary, and footer controls must all open NEXUS');
  for (const opener of openers) {
    assert.equal(getAttribute(opener, 'aria-controls'), 'nexus-panel');
    assert.equal(getAttribute(opener, 'aria-expanded'), 'false');
  }
});

function nexusPanelMarkup() {
  const panelStart = markup.search(/<section\b[^>]*id="nexus-panel"/i);
  assert.ok(panelStart >= 0, 'the NEXUS panel section must exist');
  const panelEnd = markup.indexOf('</section>', panelStart);
  assert.ok(panelEnd > panelStart, 'the NEXUS panel section must close');
  return markup.slice(panelStart, panelEnd);
}

test('the NEXUS panel is honestly labeled as the NEXUS AI beta with a capability-honest CTA and no booking claims', () => {
  assert.match(html, /NEXUS AI BETA/);
  assert.doesNotMatch(html, /PUBLIC PILOT/i, 'the retired public-pilot label must be gone from the served page');

  // Finding 9 (S8): production has no active lead backend, so the assistant
  // genuinely cannot submit a consultation request. The primary CTA must name
  // the thing it can actually do - open a conversation - and the wording that
  // promised a submission must be gone everywhere, not merely softened in one
  // of the four places it appeared.
  assert.match(html, /Explore your automation with NEXUS\./);
  assert.doesNotMatch(html, /Start a consultation request/i, 'the retired submission CTA must be gone from the served page');
  assert.equal(
    (html.match(/Explore your automation with NEXUS\./g) ?? []).length,
    5,
    'the panel headline plus the aria-label and visible text of the Meet Gary and footer openers'
  );

  assert.doesNotMatch(html, /ASSISTANT PREVIEW|Book Now|BOOKING NOT LIVE|data-nexus-book|Meeting preference/);
  assert.match(html, /Contact Gary/);

  // RD-I1: the accessible names inside the panel must say what the visible
  // badge says. A screen reader announces the dialog's aria-label the moment
  // focus enters it, and "preview"/"prototype" contradicts NEXUS AI BETA.
  const panel = nexusPanelMarkup();
  const panelTags = [...panel.matchAll(/<[a-z][^>]*>/gi)].map((m) => m[0]);
  const labels = panelTags.map((tag) => getAttribute(tag, 'aria-label')).filter((label) => label !== null);
  assert.ok(labels.length >= 3, 'the dialog, the close button and the send button carry accessible names');
  for (const label of labels) {
    assert.doesNotMatch(label, /preview|prototype/i, `aria-label "${label}" must not diminish the NEXUS AI beta`);
  }
  const dialogTag = panelTags[0];
  assert.match(getAttribute(dialogTag, 'aria-label') ?? '', /beta/i, 'the dialog is named as the beta');
  const sendTag = panelTags.find((tag) => /class="nexus__send"/i.test(tag));
  assert.ok(sendTag, 'the send button must exist');
  assert.equal(getAttribute(sendTag, 'aria-label'), 'Send message');
});

test('the NEXUS AI beta badge carries exactly one supporting line and names no vendor, model or host', () => {
  const panel = nexusPanelMarkup();
  assert.match(panel, /<span\b[^>]*class="nexus__status"[^>]*>\s*NEXUS AI BETA\s*<\/span>/i, 'the visible badge reads NEXUS AI BETA');

  // One short, unobtrusive status line. It states what is happening to the
  // product; it must never read as a claim that a visitor's request succeeded.
  const supporting = panel.match(/Daily improvements are being added\./g) ?? [];
  assert.equal(supporting.length, 1, 'exactly one supporting line, inside the panel');
  assert.doesNotMatch(panel, /\b(?:saved|sent|submitted|booked|scheduled|delivered)\b/i, 'no copy may imply an unfinished action succeeded');

  // The supporting line is ordinary text in a real element: visible on desktop
  // and at 375px (no width-gated class, no hidden/sr-only wrapper) and
  // therefore announced by a screen reader like any other panel copy.
  const line = panel.match(/<([a-z][a-z0-9]*)\b[^>]*>\s*Daily improvements are being added\.\s*<\/\1>/i);
  assert.ok(line, 'the supporting line must be its own text element');
  assert.doesNotMatch(line[0], /\bsr-only\b|aria-hidden|display:\s*none|visibility:\s*hidden/i, 'the supporting line must be visible and announced');

  // Visitor-visible panel text names no vendor, model or host.
  const visible = panel.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  assert.doesNotMatch(visible, /anthropic|openai|claude|gpt|gemini|llama|vercel|railway|azure|microsoft|n8n|zapier/i);
});

test('the NEXUS AI beta badge and supporting line meet the corrected contrast and legibility floor', () => {
  // Both strings still ship, and the retired label is still gone.
  assert.match(html, /NEXUS AI BETA/);
  assert.match(html, /Daily improvements are being added\./);
  assert.doesNotMatch(html, /PUBLIC PILOT/i);

  // The badge was 9px on desktop and 8px on mobile, below any reasonable
  // legibility floor. Both now resolve to the --t-xs type-scale token
  // (11px), reusing the existing scale rather than inventing a new size.
  const badgeBaseRule = html.match(/\.nexus__status\{margin-left:auto;[^}]*\}/);
  assert.ok(badgeBaseRule, 'the base .nexus__status rule must exist');
  assert.match(badgeBaseRule[0], /font-size:var\(--t-xs\)/, 'the badge must use the --t-xs type-scale token, not a bare 9px');
  assert.doesNotMatch(badgeBaseRule[0], /font-size:9px/, 'the old 9px badge size must be gone');

  const mobileBlock = html.match(/@media\(max-width:699px\)\{[\s\S]*?\}\}@media\(prefers-reduced-motion:reduce\)/);
  assert.ok(mobileBlock, 'the mobile breakpoint block must exist');
  assert.match(mobileBlock[0], /\.nexus__status\{font-size:var\(--t-xs\)\}/, 'the mobile badge override must also use --t-xs, not a bare 8px');
  assert.doesNotMatch(mobileBlock[0], /\.nexus__status\{font-size:8px\}/, 'the old 8px mobile badge size must be gone');

  // The supporting line measured 3.94:1 against the panel at 11px, below the
  // WCAG AA threshold of 4.5:1 for normal text. rgba(255,255,255,.58) against
  // the panel's real rendered backdrop (rgb(28,29,33), sampled from a live
  // screenshot) computes to 6.45:1; see priv-WB-report.md for the derivation.
  assert.match(
    html,
    /<p class="nexus__support" style="margin-top:\.4rem;font-size:var\(--t-xs\);color:rgba\(255,255,255,\.58\)">\s*Daily improvements are being added\./,
    'the supporting line must carry the corrected, AA-passing colour'
  );
  assert.doesNotMatch(
    html,
    /<p class="nexus__support" style="margin-top:\.4rem;font-size:var\(--t-xs\)">\s*Daily improvements are being added\./,
    'the old sub-AA-contrast declaration (no colour override, inheriting --mute at .42) must be gone'
  );
});

test('the panel offers a keyboard-reachable "New conversation" control that is not a NEXUS opener', () => {
  const panel = nexusPanelMarkup();
  const control = panel.match(/<button\b[^>]*data-nexus-new[^>]*>[\s\S]*?<\/button>/i)?.[0] ?? '';
  assert.ok(control, 'a [data-nexus-new] control must exist inside the panel');

  // A native button with no tabindex override is in the tab order, and its
  // visible text is its accessible name.
  assert.match(control, /^<button\b/i, 'the control must be a native button');
  assert.equal(getAttribute(control, 'type'), 'button');
  assert.equal(getAttribute(control, 'tabindex'), null, 'no tabindex may remove it from the tab order');
  assert.equal(getAttribute(control, 'disabled'), null);
  // ADDED (item 2): the control ships available. It becomes unavailable only while
  // a turn is awaiting its response head, and that state is applied at runtime -
  // so neither attribute may be baked into the served markup.
  assert.equal(getAttribute(control, 'aria-disabled'), null, 'the control must ship available, with no stale aria-disabled');
  assert.equal(getAttribute(control, 'aria-hidden'), null);
  const name = (getAttribute(control, 'aria-label') ?? control.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
  assert.equal(name, 'New conversation', 'the control must have an accessible name');

  // It resets the conversation; it must never be counted as a panel opener.
  assert.equal(getAttribute(control, 'data-nexus-open'), null, 'the reset control is not an opener');
  assert.equal(getAttribute(control, 'aria-controls'), null);
  assert.match(control, /class="nexus__prompt"/i, 'it reuses the existing pill styling, adding no new design language');

  // The opener contract is unchanged: still exactly the four approved openers.
  const openers = openingTagsWith('data-nexus-open');
  assert.equal(openers.length, 4, 'hero, launcher, Meet Gary and footer remain the only openers');
  assert.equal((markup.match(/data-nexus-new/g) ?? []).length, 1, 'exactly one reset control');
});

test('the widget scopes its conversation credential to this document and never exposes it (item 1)', () => {
  const script = html.match(/<script>\s*\(\(\)=>\{\s*const root=document\.getElementById\('nexus'\)[\s\S]*?<\/script>/i)?.[0] ?? '';
  assert.ok(script, 'the NEXUS widget script must exist');
  // UPDATED DELIBERATELY (item 1). This used to require `sessionStorage` and to
  // call it "per-tab by construction". sessionStorage is scoped to the ORIGIN
  // and the tab, not to a page: it survives a same-tab navigation, so a script
  // on any other page of this origin - Terms, Founder, anything - could read a
  // previous NEXUS credential after the visitor navigated. The credential is
  // now a single variable in this document's closure and nothing else.
  assert.match(normalizeCode(script), /let conversation='';/, 'the credential is one closure variable');
  assert.doesNotMatch(script, /sessionStorage/, 'it is no longer in per-tab web storage either');
  assert.doesNotMatch(
    script,
    /localStorage|document\.cookie|window\.name|BroadcastChannel|SharedWorker/,
    'never a shared store'
  );
  assert.match(script, /x-nexus-conversation/, 'the token is sent and read back as the contract header');
  // The token is opaque: it is never written into the DOM, a URL or the log.
  assert.doesNotMatch(script, /console\.(?:log|warn|error|info)/);
  assert.doesNotMatch(script, /textContent\s*=\s*(?:conv|token)|location\.search|history\.replaceState/i);
});

test('a fresh document load unconditionally retires any credential before any turn can be sent (RVP I1, item 1)', () => {
  const script = html.match(/<script>\s*\(\(\)=>\{\s*const root=document\.getElementById\('nexus'\)[\s\S]*?<\/script>/i)?.[0] ?? '';
  assert.ok(script, 'the NEXUS widget script must exist');

  // The reload-only guard reproduced the reported symptom (empty transcript,
  // inherited context) on any other fresh document load - an in-tab navigation
  // to /privacy-directive.html or /contact.html and back, or a back/forward
  // that misses the bfcache. It must be gone entirely, not merely widened.
  assert.doesNotMatch(script, /===\s*'reload'/, 'no comparison may gate the delete on the reload navigation type');
  assert.doesNotMatch(script, /getEntriesByType\(['"]navigation['"]\)/, 'the navigation-timing check that only covered reload must be removed');

  // UPDATED DELIBERATELY (item 1). This used to pin forgetConv as a guarded
  // `sessionStorage.removeItem(CONV_KEY)`, because a blocked or private store
  // had to degrade to "no token" instead of throwing. There is no storage call
  // left to guard: the credential is one closure variable reached through three
  // accessors, none of which can throw, and a fresh document therefore starts
  // fresh because the declaration says so - not because a delete succeeded.
  const code = normalizeCode(script);
  assert.match(
    code,
    /let conversation=''; const readConv=\(\)=>conversation; const storeConv=value=>\{conversation=value\}; const forgetConv=\(\)=>\{conversation=''\};/,
    'the credential and its three accessors are the whole mechanism, declared together inside the widget closure'
  );

  // The load-time delete must be unconditional (a bare statement, not inside
  // an if) and must run before the widget wires up anything that could send a
  // turn: right after forgetConv is defined and strictly before the rest of
  // the widget (openers, the form handler, and the async ask() that fetches).
  assert.match(
    code,
    /\};\s*forgetConv\(\);\s*const syncExpanded=/,
    'on load, forgetConv() must run unconditionally, immediately, with nothing gating it'
  );
  const loadTimeForget = code.search(/\};\s*forgetConv\(\);\s*const syncExpanded=/);
  const formSubmitWiring = code.indexOf("form.addEventListener('submit'");
  const askDefinition = code.indexOf('async function ask');
  assert.ok(loadTimeForget >= 0, 'the unconditional load-time delete must exist');
  assert.ok(askDefinition > loadTimeForget, 'the delete must happen before ask() (which sends turns) is even defined');
  assert.ok(formSubmitWiring > loadTimeForget, 'the delete must happen before the form can submit a turn');
});

test('a rate-limit hold cancels its pendingReset so it cannot later wipe a legitimate transcript (RVP M2)', () => {
  const script = html.match(/<script>\s*\(\(\)=>\{\s*const root=document\.getElementById\('nexus'\)[\s\S]*?<\/script>/i)?.[0] ?? '';
  const code = normalizeCode(script);

  // limited() runs on every rate-limit/budget hold and never reaches finish(),
  // so a pendingReset scheduled for the turn now on hold must be cancelled
  // here - otherwise it would fire on some later, unrelated turn's finish()
  // and delete the answer that turn just received.
  const limitedStart = code.indexOf('const limited=seconds=>');
  const newConversationStart = code.indexOf('const newConversation=');
  assert.ok(limitedStart >= 0 && newConversationStart > limitedStart, 'limited() must be defined before newConversation()');
  const limitedBody = code.slice(limitedStart, newConversationStart);
  assert.match(limitedBody, /pendingReset=false/, 'entering a hold must cancel any pending reset');

  // newConversation() must assign pendingReset on both branches: true when it
  // aborts an in-flight turn (so that turn's own closing line is swept away),
  // and false when there is no in-flight turn to abort (nothing to sweep).
  const openersWiring = code.indexOf("if(fresh)fresh.addEventListener");
  const newConversationBody = code.slice(newConversationStart, openersWiring);
  assert.match(
    newConversationBody,
    /if\(controller\)\{pendingReset=true;cancel\(\)\}else\{pendingReset=false;busy\(false\)\}/,
    'both branches of newConversation() must assign pendingReset explicitly'
  );

  // The user-visible behaviour is unchanged: it still clears the transcript
  // and in-closure state, aborts an in-flight stream, and rotates the token.
  assert.match(newConversationBody, /forgetConv\(\);lastMessage=''/, 'New conversation still rotates the identifier');
  assert.match(newConversationBody, /clearTranscript\(\)/, 'New conversation still clears the transcript');
  assert.match(newConversationBody, /cancel\(\)/, 'New conversation still aborts an in-flight stream');
});

test('revocation no longer rides a chat turn: the reset header and its machinery are gone from the widget (item 2)', () => {
  const script = html.match(/<script>\s*\(\(\)=>\{\s*const root=document\.getElementById\('nexus'\)[\s\S]*?<\/script>/i)?.[0] ?? '';
  assert.ok(script, 'the NEXUS widget script must exist');
  const code = normalizeCode(script);

  // The old mechanism captured the abandoned token and attached it, with
  // x-nexus-conversation-reset, to the visitor's NEXT ordinary chat turn. That
  // coupled a delete to a message that might never be sent and to a turn that
  // could be refused. It is replaced by a dedicated request to
  // /api/nexus/reset, so every trace of the ride-along must be gone - not
  // merely bypassed, or a future edit could resurrect it.
  assert.doesNotMatch(script, /x-nexus-conversation-reset/, 'the reset header must no longer exist in the widget');
  assert.doesNotMatch(script, /revokeToken|revokeSent/, 'the pending-revoke slot and its consume function are replaced');

  // An ordinary turn now carries nothing but the stored token, if there is one.
  const askStart = code.indexOf('async function ask');
  const formWiring = code.indexOf("form.addEventListener('submit'", askStart);
  assert.ok(askStart >= 0 && formWiring > askStart);
  const askBody = code.slice(askStart, formWiring);
  assert.match(
    askBody,
    /\.\.\.\(conv\?\{'x-nexus-conversation':conv\}:\{\}\)/,
    'a chat turn sends the plain stored conversation token and nothing else'
  );

  // Exactly one fetch inside ask(), to the chat proxy. A reset is not one of
  // its concerns any more.
  const fetches = askBody.match(/fetch\('([^']+)'/g) ?? [];
  assert.deepEqual(fetches, ["fetch('/api/nexus/chat'"], 'ask() talks to the chat proxy only');
});

test('the widget replaces its stored token from every response, and keeps the existing one when a response carries none (H1c)', () => {
  const script = html.match(/<script>\s*\(\(\)=>\{\s*const root=document\.getElementById\('nexus'\)[\s\S]*?<\/script>/i)?.[0] ?? '';
  const code = normalizeCode(script);
  assert.match(
    code,
    /const issued=res\.headers\.get\('x-nexus-conversation'\);if\(issued\)storeConv\(issued\);/,
    'every response, success or refusal, must overwrite the stored token when one is present, and must never clear it when one is absent'
  );
  // This must run before the status/content-type branch, so a refused turn
  // (409, 429, 403, 503...) still rotates the credential the core issued.
  const askStart = code.indexOf('async function ask');
  const issuedAt = code.indexOf("const issued=res.headers.get('x-nexus-conversation')", askStart);
  const statusCheckAt = code.indexOf('if(res.status!==200', askStart);
  assert.ok(issuedAt > askStart, 'the token-rotation line must exist inside ask()');
  assert.ok(statusCheckAt > issuedAt, 'the token must be captured before the status/content-type branch, so refusals still rotate it');
});

test('"New conversation" clears the transcript and forgets the token synchronously, never waiting on a network round trip (H1b)', () => {
  const script = html.match(/<script>\s*\(\(\)=>\{\s*const root=document\.getElementById\('nexus'\)[\s\S]*?<\/script>/i)?.[0] ?? '';
  const code = normalizeCode(script);
  const newConversationStart = code.indexOf('const newConversation=');
  const openersWiring = code.indexOf("if(fresh)fresh.addEventListener");
  const newConversationBody = code.slice(newConversationStart, openersWiring);
  assert.match(newConversationBody, /forgetConv\(\);lastMessage=''/, 'the token is dropped from storage synchronously');
  assert.match(newConversationBody, /clearTranscript\(\)/, 'the transcript is emptied synchronously');
  // TIGHTENED, NOT WEAKENED (item 2): this read `/await|\.then\(|fetch\(/`, which
  // matched the substring "await" inside the handler's new `if(awaitingHead)return;`
  // guard. `\bawait[\s(]` is the actual syntax - a real await is always followed by
  // whitespace or an open paren - so the guarantee is unchanged and an added
  // `await something` still fails here.
  assert.doesNotMatch(newConversationBody, /\bawait[\s(]|\.then\(|fetch\(/, 'clearing must never be deferred to a network response, so a failed or dropped revocation cannot leave stale state visible');
  assert.match('await fetch(x)', /\bawait[\s(]|\.then\(|fetch\(/, 'the tightened pattern still catches a real await');
  assert.match('p.then(run)', /\bawait[\s(]|\.then\(|fetch\(/, 'and a real continuation');
  assert.doesNotMatch('if(awaitingHead)return;', /\bawait[\s(]|\.then\(|fetch\(/, 'while the guard is not a deferral');

  // And the revocation is fired only once every one of those synchronous steps
  // has run: it is the last statement in the handler, so the UI is already
  // correct before a single byte goes near the network.
  const clearAt = newConversationBody.indexOf('clearTranscript()');
  const forgetAt = newConversationBody.indexOf('forgetConv()');
  const fireAt = newConversationBody.indexOf('sendReset(old,resetEpoch,0)');
  assert.ok(fireAt > clearAt && fireAt > forgetAt, 'the reset request is fired after the synchronous clearing, not before or instead of it');
  assert.match(newConversationBody, /sendReset\(old,resetEpoch,0\)\};\s*$/, 'firing the reset is the final statement of the handler');
});

test('the NEXUS widget states truthfully that contact details are taken only with permission, and links to the Privacy page', () => {
  const disclosure = markup.match(/<p\b[^>]*class="nexus__disclosure"[^>]*>([\s\S]*?)<\/p>/i)?.[1] ?? '';
  assert.ok(disclosure, 'the nexus__disclosure paragraph must exist');
  const text = disclosure.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

  // THREE earlier versions of this line were wrong, each in a different
  // direction, and the history is the reason this test now pins MEANING and not
  // only a string:
  //
  //   1. "Contact details are requested only with your consent" - retired when
  //      the lead backend was off, because nothing then asked for them at all.
  //   2. "This chat does not collect contact details" - true about contact
  //      details, but read as a claim about the chat as a whole.
  //   3. "NEXUS does not ask for or save contact details. Please do not type
  //      personal information here." - the line this change removes. It is
  //      FALSE against the shipped runtime: after the visitor agrees, NEXUS
  //      asks for and stores a name, a business name, an email address, an
  //      optional phone number, a summary of the project and a preferred time
  //      for Gary to reach out (`src/core/acquisition/state.ts`,
  //      `src/core/leads/capture.ts` in the NEXUS core; approved capability,
  //      launch spec section 2). A panel that denies collecting them while the
  //      runtime collects them is the release blocker.
  //
  // A fourth wording was floated and is also false - "Barrios A2I does not save
  // anything you type in the chat" - because every turn IS held on our own
  // server, masked, for the life of the conversation.
  //
  // So the line states the one fact the visitor needs before typing (details
  // are taken only with permission, and only to ask for a consultation), asks
  // them to keep anything ELSE sensitive out, and leaves the provider and the
  // retention terms to the Privacy link, which the panel may not name.
  assert.equal(
    text,
    'AI-powered chat. NEXUS asks for and saves contact details only with your permission, for a consultation request. Please keep anything else sensitive out of the chat. Privacy'
  );
  assert.match(text, /only with your permission/i, 'permission is the condition, stated');
  assert.match(text, /for a consultation request/i, 'and the purpose is named');

  // --- PINNED BY MEANING -------------------------------------------------
  // Neither pin is a copy of the sentence it forbids: each is asserted against
  // the historical false wordings as fixtures below, so a pin that had stopped
  // catching them would fail here rather than pass vacuously.
  const DENIES_CONTACT_CAPTURE =
    /\b(?:does not|doesn't|do not|never|will not|won't|no)\b[^.]{0,80}\b(?:ask|asks|asked|asking|request|requests|requested|requesting|collect|collects|collected|collecting|save|saves|saved|saving|store|stores|stored|storing|keep|keeps|keeping|retain|retains|retained|retaining)\b[^.]{0,80}\b(?:contact|personal|details|information|info)\b/i;
  const DENIES_SAVING_ANYTHING =
    /\b(?:does not|doesn't|do not|never|will not|won't)\b[^.]{0,40}\b(?:save|saves|store|stores|keep|keeps|retain|retains|record|records)\b[^.]{0,40}\b(?:anything|nothing|what you type|your messages|any of)\b/i;

  // The pins are live: they catch every wording this line has falsely carried.
  assert.match(
    'AI-powered chat. NEXUS does not ask for or save contact details.',
    DENIES_CONTACT_CAPTURE,
    'the pin catches the sentence this change removes'
  );
  assert.match('This chat does not collect contact details', DENIES_CONTACT_CAPTURE, 'and wording 2');
  assert.match("NEXUS doesn't keep your contact information", DENIES_CONTACT_CAPTURE, 'and a contraction of it');
  assert.match(
    'Barrios A2I does not save anything you type in the chat.',
    DENIES_SAVING_ANYTHING,
    'and the blanket no-save over-correction'
  );
  assert.match('We never store what you type.', DENIES_SAVING_ANYTHING, 'and a paraphrase of it');

  // And the shipped disclosure carries neither meaning.
  assert.doesNotMatch(
    text,
    DENIES_CONTACT_CAPTURE,
    'the disclosure must never again deny asking for, saving or keeping contact details'
  );
  assert.doesNotMatch(
    text,
    DENIES_SAVING_ANYTHING,
    'nor claim that nothing the visitor types is saved'
  );
  // The same two denials must be absent from the whole served page, so the
  // claim cannot reappear in a heading, a prompt or the widget script.
  assert.doesNotMatch(stripExecutableContent(html), DENIES_CONTACT_CAPTURE, 'nowhere in the served markup');
  assert.doesNotMatch(
    html,
    /Contact details are requested only with your consent/i,
    'the retired consent promise must be gone from the served page'
  );
  // The line must not swing back the other way either: it may not imply that
  // what the visitor types is unprocessed or unread.
  assert.doesNotMatch(
    text,
    /(?:never|not|no)\s+(?:\w+\s+){0,3}(?:processed|read|analysed|analyzed|stored anywhere)/i,
    'the disclosure must not imply that visitor text is never processed'
  );

  assert.match(disclosure, /<a\b[^>]*href="\/privacy-directive\.html"[^>]*>Privacy<\/a>/i);
  assert.doesNotMatch(disclosure, /anthropic|microsoft|openai|claude|vercel|n8n|zapier|make\.com|hosting|api/i);
  assert.doesNotMatch(disclosure, /does not book|schedule|send email|issue quotes|30 days/i);
});

// ---------------------------------------------------------------------------
// Blocker 8 (website half): no public surface may claim that NEXUS books.
//
// WHAT THE BETA ACTUALLY DOES. After the visitor agrees, NEXUS asks for a
// preferred day or time of day for Gary to reach out and stores that STRING
// ("Is there a day or time of day that suits you best for Gary to reach out?",
// `capture_meeting_time`). It does not read a calendar, does not check
// availability, does not create or hold a calendar event and never mints a
// meeting link: the core's own `selectLeadBackend` records that the lead
// backend "never advertises `booking`: scheduling stays off regardless of which
// environment named it", and the launch spec forbids activating the scheduling
// source that exists in the repository.
//
// WHAT THIS TEST THEREFORE PINS, and what it deliberately does NOT. It fails if
// any served byte ties NEXUS, the assistant or this chat to booking,
// scheduling, availability, a calendar event or a meeting link. It does NOT ban
// that vocabulary from the page, because the marketing copy legitimately
// describes the automations Barrios A2I BUILDS FOR A CLIENT'S BUSINESS
// ("Appointment booking & reminders", "Qualified prospects book the right
// appointment"), in the same register as its siblings "Instant email and SMS
// responses" and "CRM records stay current" - none of which is a NEXUS
// capability either. Banning the words outright would fail on copy that is not
// a claim about this assistant, so the pin is on the ASSOCIATION. Every regex
// below is asserted against both kinds of sentence, so it cannot pass vacuously
// and cannot be quietly widened into a copy ban.
const BOOKING_CLAIM =
  'book|books|booked|booking|bookings|schedule|schedules|scheduled|scheduling|reschedule|availability|available times|open slots|calendar event|calendar invite|calendar invitation|meeting link|join link|join url|zoom link|video link';
const ASSISTANT_SUBJECT = 'NEXUS|the assistant|this chat|the chat|our chat|the widget';
/** "NEXUS ... books" - the assistant named first. */
const ASSISTANT_BOOKS = new RegExp(
  `\\b(?:${ASSISTANT_SUBJECT})\\b[^.!?<>]{0,100}?\\b(?:${BOOKING_CLAIM})\\b`,
  'i'
);
/** "book ... with NEXUS" - the booking named first. */
const BOOKED_VIA_ASSISTANT = new RegExp(
  `\\b(?:${BOOKING_CLAIM})\\b[^.!?<>]{0,100}?\\b(?:with NEXUS|by NEXUS|via NEXUS|through NEXUS|with the assistant)\\b`,
  'i'
);
/** Forms that are a live-calendar claim on their own, wherever they appear. */
const CALENDAR_CAPABILITY =
  /Book with NEXUS|Book Now|data-nexus-book\b|data-nexus-schedule\b|BOOKING NOT LIVE|SCHEDULING PREVIEW|check(?:s|ing)? (?:Gary'?s )?(?:calendar|availability)|calendar invite|meeting link|join url|zoom link/i;

const bookingClaim = (text) =>
  ASSISTANT_BOOKS.test(text) || BOOKED_VIA_ASSISTANT.test(text) || CALENDAR_CAPABILITY.test(text);

test('no public surface claims that NEXUS books, schedules, checks availability, creates a calendar event or issues a meeting link (blocker 8)', async () => {
  // The pins are live. Each of these is the kind of sentence the beta cannot
  // honour, and each must be caught.
  for (const claim of [
    'Book with NEXUS',
    'NEXUS will book the right time for you.',
    'NEXUS can schedule a call with Gary.',
    'The assistant checks Gary’s availability and books a slot.',
    'Book a meeting with NEXUS',
    'Ask NEXUS and it sends you a calendar invite.',
    'NEXUS creates a calendar event once you confirm.',
    'This chat will schedule your consultation.',
    'NEXUS shares a meeting link after you confirm.',
    'NEXUS checks availability and confirms the slot.'
  ]) {
    assert.ok(bookingClaim(claim), `the pin must catch a false booking claim: ${claim}`);
  }

  // And they are not a copy ban: the services catalogue, which describes what we
  // build for a client's business, must keep passing. If a future change makes
  // one of these fail, the pin was widened past what blocker 8 is about.
  for (const allowed of [
    'Appointment booking & reminders',
    'Help the right people book the right time, then send clear reminders and follow-up.',
    'Qualified prospects book the right appointment',
    'Campaign content, approvals & scheduling',
    'CRM, calendar, and team stay aligned',
    'We map the handoffs between your leads, messages, calendar, CRM, team, and follow-up.',
    'Explore your automation with NEXUS.',
    'Current availability Open to serious projects, technical roles, and useful collaborations.'
  ]) {
    assert.ok(!bookingClaim(allowed), `services copy must not be treated as a NEXUS claim: ${allowed}`);
  }

  // The served homepage, scripts included - the marketing copy is written by an
  // inline script, so stripping scripts here would test almost none of it.
  assert.doesNotMatch(html, ASSISTANT_BOOKS, 'nothing on the homepage says the assistant books or schedules');
  assert.doesNotMatch(html, BOOKED_VIA_ASSISTANT, 'and nothing offers a booking made through it');
  assert.doesNotMatch(html, CALENDAR_CAPABILITY, 'and no live-calendar capability is claimed');

  // Inside the panel the vocabulary is absent altogether: there is no register
  // there in which "book" could be about a client's business.
  const panel = markup.match(/<section\b[^>]*class="nexus__panel"[^>]*>[\s\S]*?<\/section>/i)?.[0] ?? '';
  assert.ok(panel, 'the NEXUS panel must exist');
  assert.doesNotMatch(
    panel.replace(/<[^>]+>/g, ' '),
    /\b(?:book|booking|schedule|scheduling|appointment|calendar|availability|meeting|invite|zoom)\b/i,
    'the panel itself carries no booking vocabulary at all'
  );

  // Every element that opens the panel: visible label and accessible name.
  const openers = [...markup.matchAll(/<button\b[^>]*data-nexus-open[^>]*>[\s\S]*?<\/button>/gi)].map((m) => m[0]);
  assert.ok(openers.length >= 4, `every opener must be checked, found ${openers.length}`);
  for (const opener of openers) {
    const label = `${getAttribute(opener, 'aria-label') ?? ''} ${opener.replace(/<[^>]+>/g, ' ')}`;
    assert.doesNotMatch(
      label,
      /\b(?:book|booking|schedule|scheduling|appointment|calendar|availability)\b/i,
      `an opener must not promise a booking: ${label.replace(/\s+/g, ' ').trim().slice(0, 120)}`
    );
  }

  // The Privacy page, which the disclosure links to, must not claim it either.
  const privacyResponse = await fetch(new URL('/privacy-directive.html', homepageUrl));
  assert.equal(privacyResponse.status, 200);
  const privacy = await privacyResponse.text();
  assert.doesNotMatch(privacy, ASSISTANT_BOOKS, 'the Privacy page must not say the assistant books');
  assert.doesNotMatch(privacy, BOOKED_VIA_ASSISTANT);
  assert.doesNotMatch(privacy, CALENDAR_CAPABILITY);
});

test('the Privacy page keeps the provider disclosure and states the OneDrive/email terms as conditional on lead capture, not as fact (item 4)', async () => {
  const privacyResponse = await fetch(new URL('/privacy-directive.html', homepageUrl));
  assert.equal(privacyResponse.status, 200);
  const privacy = stripExecutableContent(await privacyResponse.text());
  assert.match(privacy, /AI Assistant \(NEXUS\)/);

  // What DOES happen, unchanged and still named: typed chat goes to a
  // third-party model provider.
  assert.match(privacy, /as written to Anthropic’s API to generate replies/);
  assert.match(privacy, /deletes API inputs and outputs within 30 days/);
  assert.match(privacy, /does not use commercial API data to train its models by default/);
  assert.match(privacy, /do not share sensitive, personal or confidential information/i);

  // What does NOT happen, stated plainly, because the lead backend is off —
  // and what DOES happen to the conversation while it is off. The page must
  // not claim nothing is saved: every turn is stored server-side, masked,
  // until the conversation's idle/absolute deadline or a new conversation.
  assert.match(privacy, /Lead capture is switched off in the current release\./);
  assert.match(privacy, /NEXUS does not ask you for, or save, contact details while lead capture is off/);
  assert.match(privacy, /sent to our third-party model provider/);
  assert.match(privacy, /held on our own server for the length of that conversation/);
  assert.match(privacy, /contact-shaped details masked in what is stored/);
  assert.match(privacy, /deleted when the conversation reaches its idle or absolute time limit/);
  assert.match(privacy, /immediately if you start a new conversation/);
  assert.doesNotMatch(
    privacy,
    /does not save anything you type in the chat/,
    'the false "nothing is saved" claim must be gone'
  );
  assert.doesNotMatch(
    privacy,
    /Barrios A2I does not save anything/,
    'the false blanket no-save claim must be gone'
  );

  // The OneDrive and email-notification terms survive, but only inside the
  // conditional paragraph. Item 4: while the capability is off, the page must
  // not state as present fact that consented details ARE stored and emailed.
  assert.match(privacy, /consent/i);
  assert.match(privacy, /OneDrive/i);
  assert.match(privacy, /email notification/i);
  assert.match(privacy, /If we enable lead capture in a future release/);
  assert.match(privacy, /None of that happens while lead capture is off\./);

  // The retired present-tense claims are gone.
  assert.doesNotMatch(
    privacy,
    /we store that information only with your consent, in the Barrios A2I OneDrive application folder/,
    'the unconditional storage claim must be gone'
  );
  assert.doesNotMatch(
    privacy,
    /and Gary receives an email notification/,
    'the unconditional notification claim must be gone'
  );
  assert.doesNotMatch(
    privacy,
    /If you provide an email address, a confirmation of your request is also sent to that address\./,
    'the unconditional confirmation claim must be gone'
  );

  // Structural, not merely textual: every mention of OneDrive and of the email
  // notification must sit in a paragraph that also carries the condition, so a
  // future edit cannot lift one of them back out into a bare statement of fact.
  const paragraphs = [...privacy.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map((match) =>
    match[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
  );
  const conditional = /if we enable lead capture|would|only then/i;
  for (const paragraph of paragraphs) {
    if (!/OneDrive|email notification|confirmation of your request/i.test(paragraph)) continue;
    assert.match(
      paragraph,
      conditional,
      `a paragraph mentioning storage or notification must carry the condition: ${paragraph.slice(0, 120)}`
    );
  }
  const conditionalParagraphs = paragraphs.filter((paragraph) => /OneDrive/i.test(paragraph));
  assert.equal(conditionalParagraphs.length, 1, 'exactly one paragraph describes the future capability');

  const nexusSection = privacy.match(/AI Assistant \(NEXUS\)[\s\S]*?<\/p>/)?.[0] ?? '';
  assert.ok(nexusSection, 'the NEXUS section paragraph must exist');
  assert.doesNotMatch(nexusSection, /we (?:retain|keep|store)[^.]*\b(?:days|months|years)\b/i, 'no Barrios A2I retention duration');
  assert.match(privacy, /Last updated: September 2026/);
});

// ---------------------------------------------------------------------------
// Item 2 (website half): "New conversation" is an immediate, dedicated
// revocation, not a passenger on the next chat turn.
//
// The previous mechanism captured the abandoned token and attached it, with
// x-nexus-conversation-reset, to whatever chat turn the visitor sent next. Two
// consequences: a visitor who clicked and left revoked nothing at all, and a
// turn that was aborted, refused (409/429/403) or lost to the network delayed
// the revocation indefinitely. Both are gone. The click now POSTs to
// /api/nexus/reset with the token it just retired, and the core deletes and
// tombstones the record with no provider call and no model turn.
//
// These are behavioural tests, not string matches: they lift the shipped retry
// budget, the shipped sendReset() and the shipped capture/fire statements out of
// the served page and execute them against scripted network outcomes and a
// scripted clock. A reimplementation of the logic would drift; this cannot.

function widgetScript() {
  const script = html.match(/<script>\s*\(\(\)=>\{\s*const root=document\.getElementById\('nexus'\)[\s\S]*?<\/script>/i)?.[0] ?? '';
  assert.ok(script, 'the NEXUS widget script must exist');
  return script;
}

/**
 * A harness built from the widget's own reset code.
 *
 * `setResponder(fn)` decides what each request comes back as: an Error (the
 * fetch rejected - a transport failure, or the page going away) or `{status}`.
 * `drain()` runs the scheduled retries the way a timer would, oldest first, so
 * a retry that the shipped guard refuses to send simply produces no request.
 */
function resetMachine() {
  const code = normalizeCode(widgetScript());

  const budget = code.match(/const RESET_RETRIES=\d+,RESET_BACKOFF_MS=\d+;/)?.[0];
  assert.ok(budget, 'the retry budget and backoff must be declared in the shipped widget');

  const sender = code.match(/const sendReset=\(token,epoch,attempt\)=>\{[\s\S]*?catch\(err\)\{again\(\)\}\};/)?.[0];
  assert.ok(sender, 'sendReset() must be defined in the shipped widget');
  assert.match(sender, /if\(!token\|\|epoch!==resetEpoch\)return;/, 'sendReset must refuse a missing token and a superseded generation');

  // ADDED for item 2: the guard that makes the first-turn race unreachable even
  // if a click somehow races the disabled attribute. It is the FIRST statement of
  // the handler, so nothing - not the generation counter, not the capture - runs
  // while a turn is still awaiting its response head.
  const guard = code.match(/const newConversation=\(\)=>\{ (if\(awaitingHead\)return;)/)?.[1];
  assert.ok(guard, 'newConversation() must refuse outright while a turn is awaiting its response head');

  const capture = code.match(/const old=readConv\(\); resetEpoch\+\+;/)?.[0];
  assert.ok(capture, 'newConversation() must read the retired token and open a new generation');

  const fire = code.match(/sendReset\(old,resetEpoch,0\)/)?.[0];
  assert.ok(fire, 'newConversation() must fire the reset for the token it retired');

  const body = `
    let resetEpoch = 0, stored = '', awaitingHead = false;
    const readConv = () => stored;
    const forgetConv = () => { stored = ''; };
    const storeConv = (value) => { stored = value; };

    const requests = [];
    const timers = [];
    // Shadows the global inside this harness: a scheduled retry is captured
    // rather than run, so drain() controls the clock.
    const setTimeout = (run, ms) => { timers.push({ run, ms }); return timers.length; };

    let respond = () => ({ status: 204 });
    const fetch = (url, init) => {
      requests.push({ url, init });
      const outcome = respond(requests.length, init);
      if (outcome instanceof Error) return Promise.reject(outcome);
      return Promise.resolve(outcome);
    };

    ${budget}
    ${sender}

    // The shipped statements from newConversation() that constitute the reset
    // contract, in their shipped order: the awaiting-head guard first, then the
    // capture, then the retire, then the fire. The rest of that handler (the
    // transcript, the abort, the focus) is asserted separately, by source.
    const newConversation = () => { ${guard} ${capture} forgetConv(); ${fire}; };

    const settle = async () => { for (let i = 0; i < 12; i += 1) await Promise.resolve(); };
    const drain = async () => {
      await settle();
      while (timers.length) { timers.shift().run(); await settle(); }
    };

    return {
      requests, timers, newConversation, storeConv, drain, settle,
      storedToken: () => stored,
      generation: () => resetEpoch,
      // The widget's awaitHead(): true the instant a turn's request goes out,
      // false the instant its head is read or the turn settles.
      awaitHead: (pending) => { awaitingHead = pending; },
      setResponder: (fn) => { respond = fn; }
    };
  `;
  return new Function(body)();
}

const TOKEN = 'x-nexus-conversation';
const RESET_PATH = '/api/nexus/reset';

const tokensOf = (machine) => machine.requests.map((request) => request.init.headers[TOKEN]);

test('"New conversation" immediately POSTs the retired token to the reset proxy (item 2)', async () => {
  const widget = resetMachine();
  widget.storeConv('T1');
  widget.newConversation();

  // Synchronous: the token is already gone from storage and the request is
  // already out, on the click, with no turn in between.
  assert.equal(widget.storedToken(), '', 'the stored token is retired synchronously');
  assert.equal(widget.requests.length, 1, 'the revocation is fired on the click itself');
  await widget.drain();

  const [request] = widget.requests;
  assert.equal(request.url, RESET_PATH, 'the revocation goes to the dedicated reset proxy, not the chat route');
  assert.equal(request.init.method, 'POST');
  assert.equal(request.init.credentials, 'same-origin', 'the HttpOnly session cookie must ride along or the core cannot check ownership');
  assert.equal(request.init.keepalive, true, 'clicking "New conversation" and leaving must still revoke');
  assert.equal(request.init.cache, 'no-store');
  assert.equal(request.init.headers[TOKEN], 'T1', 'it carries exactly the token that was just retired');
  assert.equal(request.init.headers['content-type'], 'application/json');
  assert.equal('x-nexus-conversation-reset' in request.init.headers, false, 'the old ride-along header is gone');
  assert.equal(widget.requests.length, 1, 'a successful revocation is sent exactly once');
});

test('a reset is never sent without a token (item 2)', async () => {
  // A brand new tab, or a second click with nothing stored: there is nothing to
  // revoke, and inventing a request would tell the core about a conversation
  // that never existed.
  const widget = resetMachine();
  widget.newConversation();
  await widget.drain();
  assert.deepEqual(widget.requests, [], 'no stored token means no reset request');

  widget.storeConv('T1');
  widget.newConversation();
  widget.newConversation();
  await widget.drain();
  assert.deepEqual(tokensOf(widget), ['T1'], 'the second click had nothing left to retire');
  for (const request of widget.requests) {
    assert.equal(typeof request.init.headers[TOKEN], 'string');
    assert.ok(request.init.headers[TOKEN].length > 0, 'every reset request carries a non-empty token');
  }
});

test('a reset lost to the network is retried with the same retired token, within a bounded budget (item 2)', async () => {
  const widget = resetMachine();
  widget.setResponder(() => new Error('network'));
  widget.storeConv('T1');
  widget.newConversation();
  await widget.drain();

  // The shipped budget is 1 attempt + RESET_RETRIES, and every attempt carries
  // the same retired credential - never a fresh one.
  const budget = Number(normalizeCode(widgetScript()).match(/const RESET_RETRIES=(\d+)/)[1]);
  assert.ok(budget >= 1, 'there must be at least one retry');
  assert.equal(widget.requests.length, budget + 1, `a lost reset is attempted ${budget + 1} times and then stops`);
  assert.deepEqual(tokensOf(widget), Array(budget + 1).fill('T1'));
  assert.deepEqual(widget.timers, [], 'the retry budget is exhausted, not left pending forever');
});

test('a 5xx is retried and a 4xx is final (item 2)', async () => {
  const server = resetMachine();
  server.setResponder(() => ({ status: 503 }));
  server.storeConv('T1');
  server.newConversation();
  await server.drain();
  assert.ok(server.requests.length > 1, 'an unavailable core is retried');

  const refused = resetMachine();
  refused.setResponder(() => ({ status: 400 }));
  refused.storeConv('T1');
  refused.newConversation();
  await refused.drain();
  assert.equal(refused.requests.length, 1, 'the core has spoken; a 4xx is never retried');

  const rateLimited = resetMachine();
  rateLimited.setResponder(() => ({ status: 429 }));
  rateLimited.storeConv('T1');
  rateLimited.newConversation();
  await rateLimited.drain();
  assert.equal(rateLimited.requests.length, 1, 'a rate-limited reset is not hammered');
});

test('a successful reset (2xx) is never retried (item 2)', async () => {
  // The proxy now relays a successful upstream reset with the upstream's own
  // 2xx status instead of collapsing it to 503. sendReset()'s own guard
  // (`if(res.status>=500)again()`) already treats anything below 500 as
  // final, so once the proxy stops mislabelling success as 503 the widget
  // must stop retrying it too - exercised here against a few 2xx codes.
  for (const status of [200, 201, 204]) {
    const widget = resetMachine();
    widget.setResponder(() => ({ status }));
    widget.storeConv('T1');
    widget.newConversation();
    await widget.drain();
    assert.equal(widget.requests.length, 1, `a ${status} reset must be sent exactly once, never retried`);
    assert.deepEqual(widget.timers, [], `a ${status} reset must not schedule a retry`);
  }
});

test('a pending retry is DROPPED once a new conversation has begun (item 2)', async () => {
  // THE DECISION, recorded here because it is deliberate. A retry always
  // carries the token it was issued for, and that token names exactly one
  // conversation record and one nonce - the core refuses it for anything else,
  // so it could not revoke newer state even if it arrived late. The generation
  // guard is belt and braces over that binding: the instant a new conversation
  // begins, an older pending retry stops existing. Losing a stale revocation is
  // strictly safer than racing newer state, and the abandoned record is already
  // unreachable and bounded by the core's idle sweep.
  const widget = resetMachine();
  let allow = false;
  widget.setResponder(() => (allow ? { status: 204 } : new Error('network')));

  widget.storeConv('T1');
  widget.newConversation();
  await widget.settle();
  assert.deepEqual(tokensOf(widget), ['T1']);
  assert.equal(widget.timers.length, 1, 'the failed T1 revocation scheduled a retry');

  // A new conversation begins before that retry wakes up.
  allow = true;
  widget.storeConv('T2');
  widget.newConversation();
  await widget.drain();

  assert.deepEqual(
    tokensOf(widget),
    ['T1', 'T2'],
    'the T1 retry dropped itself when it woke in a later generation; only the current abandonment was attempted'
  );
  assert.equal(widget.generation(), 2, 'each click opens a new generation');
});

test('a retry that wakes up in the same generation still goes out (item 2)', async () => {
  // The guard must drop superseded retries without disabling retrying itself.
  const widget = resetMachine();
  let attempt = 0;
  widget.setResponder(() => (++attempt === 1 ? new Error('network') : { status: 204 }));
  widget.storeConv('T1');
  widget.newConversation();
  await widget.drain();
  assert.deepEqual(tokensOf(widget), ['T1', 'T1'], 'the retry for the current generation was sent');
  assert.deepEqual(widget.timers, [], 'and it succeeded, so nothing further is scheduled');
});

test('the reset is fire-and-forget: nothing is awaited, and no outcome reaches the visitor (item 2)', () => {
  const code = normalizeCode(widgetScript());
  const senderStart = code.indexOf('const sendReset=');
  const senderEnd = code.indexOf('const newConversation=');
  assert.ok(senderStart >= 0 && senderEnd > senderStart);
  const sender = code.slice(senderStart, senderEnd);

  // No status line, no offline notice, no retry pill, no spinner: a revocation
  // the visitor cannot act on must never be reported to them.
  assert.doesNotMatch(sender, /status\(|offlineNotice\(|retryPill\(|busy\(|line\(/, 'a failed revocation is never surfaced');
  assert.doesNotMatch(sender, /await/, 'nothing in the widget waits on the revocation');
  // The token stays out of the DOM, the URL and the console, like everywhere else.
  assert.doesNotMatch(sender, /console\.|textContent|innerHTML|location\./);

  // The handler that calls it is not async either, so the click cannot block.
  assert.doesNotMatch(code, /async const newConversation|const newConversation=async/, 'the click handler stays synchronous');
});

test('the reset request shape is minimal and same-origin (item 2)', () => {
  const code = normalizeCode(widgetScript());
  const sender = code.slice(code.indexOf('const sendReset='), code.indexOf('const newConversation='));

  assert.match(sender, /fetch\('\/api\/nexus\/reset'/, 'the proxy path is relative, so the request is same-origin by construction');
  assert.match(sender, /credentials:'same-origin'/);
  assert.match(sender, /keepalive:true/);
  assert.match(sender, /body:'\{"v":1\}'/, 'a tiny fixed body: no visitor text is ever sent with a reset');
  // Nothing about the transcript, the draft or the page goes with it.
  assert.doesNotMatch(sender, /message|lastMessage|input\.value|document\./);
});

// ---------------------------------------------------------------------------
// ITEM 1 - the conversation credential is memory-only.
//
// It used to live in sessionStorage. sessionStorage is scoped to the ORIGIN and
// the tab, not to a page, so it survives a same-tab navigation: a visitor who
// chatted and then clicked Privacy, Contact, Terms or Founder left a live
// credential that every script on the page he landed on could read - and several
// pages on this origin still execute third-party code. The credential now lives
// in one variable inside the widget IIFE's closure, for the lifetime of that
// document, and in nothing else.
//
// The guarantee these tests pin is not "the other pages behave". It is that NO
// storage key holds the credential at all, so there is nothing on this origin
// for another page to recover.
// ---------------------------------------------------------------------------

/**
 * A harness built from the widget's own credential code.
 *
 * It lifts the shipped declaration, the three shipped accessors, the shipped
 * load-time retire, the shipped per-turn read and the shipped rotation line out
 * of the SERVED page and runs them with every browser storage surface replaced
 * by a spy that records any access. One instance is one DOCUMENT: a second
 * instance is a second tab, and a reload or a navigation is simply a new
 * instance, because a closure cannot outlive its document.
 */
function credentialMachine() {
  const code = normalizeCode(widgetScript());

  const closure = code.match(
    /let conversation=''; const readConv=\(\)=>conversation; const storeConv=value=>\{conversation=value\}; const forgetConv=\(\)=>\{conversation=''\};/
  )?.[0];
  assert.ok(closure, 'the credential must be declared and reached through three accessors inside the widget closure');

  const retire = code.match(/\}; (forgetConv\(\);) const syncExpanded=/)?.[1];
  assert.ok(retire, 'a fresh document must retire any credential before the widget wires anything up');

  const read = code.match(/const conv=readConv\(\);/)?.[0];
  assert.ok(read, 'a turn must read the credential out of the closure');

  const rotate = code.match(
    /const issued=res\.headers\.get\('x-nexus-conversation'\);if\(issued\)storeConv\(issued\);/
  )?.[0];
  assert.ok(rotate, 'every response must rotate the in-memory credential');

  const body = `
    // Any touch of any of these is recorded. The shipped code must touch none.
    const touched = [];
    const trap = (label) => new Proxy({}, {
      get: (_target, key) => { touched.push(label + '.' + String(key)); return () => undefined; },
      set: (_target, key) => { touched.push(label + '.' + String(key) + '='); return true; }
    });
    const sessionStorage = trap('sessionStorage');
    const localStorage = trap('localStorage');
    const indexedDB = trap('indexedDB');
    const caches = trap('caches');
    const document = {
      get cookie() { touched.push('document.cookie'); return ''; },
      set cookie(value) { touched.push('document.cookie='); }
    };
    const window = {
      get name() { touched.push('window.name'); return ''; },
      set name(value) { touched.push('window.name='); },
      addEventListener: () => undefined
    };

    ${closure}
    ${retire}

    // One turn, exactly as the widget does it: read what this closure holds,
    // send that as the header, then rotate from the response head.
    const turn = (issuedByServer) => {
      ${read}
      const res = {
        headers: { get: (header) => (header === 'x-nexus-conversation' ? (issuedByServer ?? null) : null) }
      };
      ${rotate}
      return conv;
    };

    return { turn, touched, held: () => conversation, retire: forgetConv };
  `;
  return new Function(body)();
}

test('the conversation credential is held only in closure memory, and no storage surface is ever touched (item 1)', () => {
  const machine = credentialMachine();
  assert.equal(machine.held(), '', 'a fresh document starts with no credential at all');
  assert.equal(machine.turn('T1'), '', 'so its first turn is tokenless and the core mints a new conversation');
  assert.equal(machine.held(), 'T1', 'the credential the response issued is held in memory');
  assert.deepEqual(
    machine.touched,
    [],
    'no Web Storage, cookie, IndexedDB, cache or window-name access happened - not even a read'
  );
});

test('consecutive turns on one open page rotate the in-memory credential and continue the conversation (item 1)', () => {
  const machine = credentialMachine();
  assert.equal(machine.turn('T1'), '', 'turn 1 carries nothing');
  assert.equal(machine.turn('T2'), 'T1', 'turn 2 presents the credential turn 1 was issued: same conversation');
  assert.equal(machine.turn('T3'), 'T2', 'single-use rotation: each response replaces the one held in memory');
  assert.equal(machine.held(), 'T3');

  // A response with no credential header must leave the held one alone, or a
  // refusal that carries none would silently end the conversation.
  assert.equal(machine.turn(null), 'T3');
  assert.equal(machine.held(), 'T3', 'a response carrying no credential never clears the held one');
  assert.deepEqual(machine.touched, []);

  // And "New conversation" retires it in memory, so the next turn is tokenless.
  machine.retire();
  assert.equal(machine.held(), '');
  assert.equal(machine.turn('T4'), '', 'after a retire the next turn opens a fresh conversation');
});

test('two tabs stay isolated, and a reload or navigation leaves no reusable client credential (item 1)', () => {
  const tabA = credentialMachine();
  const tabB = credentialMachine();

  tabA.turn('A1');
  assert.equal(tabA.held(), 'A1');
  assert.equal(tabB.held(), '', "a second document has its own closure and cannot see the first one's credential");
  assert.equal(tabB.turn('B1'), '', 'so the second tab opens its own conversation');
  assert.equal(tabA.held(), 'A1', 'and neither tab disturbs the other');

  // A reload or an in-tab navigation destroys the document, and with it the
  // closure. The next document is indistinguishable from a brand new tab, so
  // there is no reusable client credential and no key for a later page to read.
  const afterReload = credentialMachine();
  assert.equal(afterReload.held(), '', 'nothing survived the document');
  assert.equal(afterReload.turn('C1'), '', 'the first turn after a reload is tokenless: a fresh conversation');
  for (const machine of [tabA, tabB, afterReload]) {
    assert.deepEqual(machine.touched, [], 'and none of it was ever written anywhere a later document could read');
  }
});

test('no storage key can hold the credential: the shipped widget contains no storage access at all (item 1)', () => {
  const script = widgetScript();
  const code = normalizeCode(script);

  // A surface named in a block comment is documentation; a surface named in code
  // is an access site - the same distinction tests/static-harness.test.mjs draws
  // for a hard-coded port. Only an access site can put the credential somewhere
  // a script on another page of this origin could read it.
  const surfaces = [
    /Storage/i, /indexedDB/i, /IDBFactory/, /openDatabase/, /\.cookie\b/,
    /window\.name/, /self\.name/, /BroadcastChannel/, /SharedWorker/,
    /ServiceWorker/, /\bcaches\b/, /postMessage/, /CONV_KEY/
  ];
  for (const surface of surfaces) {
    assert.doesNotMatch(code, surface, `the credential must not reach ${surface}`);
  }

  // Never hung off a global, never put in a URL, the DOM or the log.
  assert.doesNotMatch(
    code,
    /(?:window|self|globalThis|top|parent)\.[A-Za-z_$][\w$]*\s*=\s*(?:conversation|conv|issued|old|token)\b/,
    'the credential is never attached to a global object'
  );
  assert.doesNotMatch(
    code,
    /location\s*=|location\.(?:href|search|hash)\s*=|history\.(?:replace|push)State/,
    'never in a URL'
  );
  assert.doesNotMatch(code, /console\./, 'never logged');
  assert.doesNotMatch(
    code,
    /(?:textContent|innerHTML|value|setAttribute)\s*[=(]\s*(?:conversation|conv|issued|old)\b/,
    'never written into the DOM'
  );

  // And the retired storage key exists nowhere in the served document, so there
  // is not even a name left for another page to guess at.
  assert.doesNotMatch(html, /nexus\.conversation/, 'the old storage key must be gone from the served page');
});

// ---------------------------------------------------------------------------
// ITEM 2 - the first-turn reset race.
//
// While a turn is awaiting its response head there is no credential this
// document can authenticate a revocation with: on a first turn none has been
// issued yet, and on an established conversation the turn in flight is about to
// consume and rotate the one being held. Clearing the transcript in that window
// told the visitor his conversation had been revoked when nothing on the server
// had been.
//
// The fix is that "New conversation" is genuinely unavailable for exactly that
// window - a real `disabled` attribute on a native button, mirrored by
// aria-disabled while it holds - and available again the moment a credential
// exists or the turn settles. Escape and the panel's Close control are never
// gated, so the visitor is never trapped.
// ---------------------------------------------------------------------------

test('a first turn with no credential yet cannot trigger a false successful reset (item 2)', async () => {
  const widget = resetMachine();

  // A brand new document: nothing held, the first turn's request is out, its head
  // has not come back, so no credential exists. The click must do nothing at all -
  // not open a generation, not fire a request, not imply a revocation happened.
  widget.awaitHead(true);
  widget.newConversation();
  await widget.drain();
  assert.deepEqual(widget.requests, [], 'no reset request goes out, so nothing can be reported as revoked');
  assert.equal(widget.generation(), 0, 'and no generation was opened: the guard returns before the counter');
  assert.deepEqual(widget.timers, [], 'and nothing was scheduled to try later');

  // The turn settles having issued nothing (a refusal, say). The control is
  // available again and still, correctly, has nothing to revoke.
  widget.awaitHead(false);
  widget.newConversation();
  await widget.drain();
  assert.deepEqual(widget.requests, [], 'still nothing to revoke, so still no request');
});

test('an established conversation resets immediately through the reset endpoint once a head has arrived (item 2)', async () => {
  const widget = resetMachine();

  // A turn is in flight on T1 and is about to rotate it: not a safe moment.
  widget.storeConv('T1');
  widget.awaitHead(true);
  widget.newConversation();
  assert.deepEqual(widget.requests, [], 'the window in which the in-flight turn is about to consume T1 is not a safe moment to revoke it');
  assert.equal(widget.storedToken(), 'T1', 'and the held credential is untouched, so the turn can finish normally');

  // The head arrives and rotates the credential to T2. The control is available
  // again, and a reset goes out immediately - on the click, carrying T2.
  widget.storeConv('T2');
  widget.awaitHead(false);
  widget.newConversation();
  assert.equal(widget.requests.length, 1, 'the reset is fired synchronously on the click, exactly as before');
  assert.equal(widget.storedToken(), '', 'and the credential is retired synchronously');
  await widget.drain();
  assert.equal(widget.requests[0].url, '/api/nexus/reset', 'through the provider-free reset endpoint');
  assert.equal(widget.requests[0].init.headers['x-nexus-conversation'], 'T2');
  assert.equal(widget.requests.length, 1, 'a successful reset is sent exactly once');
});

test('a reset failure stays retryable, and no reset ever reaches a provider (item 2)', async () => {
  const widget = resetMachine();
  widget.setResponder(() => ({ status: 503 }));
  widget.storeConv('T1');
  widget.newConversation();
  await widget.drain();

  assert.ok(widget.requests.length > 1, 'a reset the core could not serve is retried, not dropped');
  assert.ok(
    widget.requests.every((request) => request.url === '/api/nexus/reset'),
    'every attempt goes to the reset endpoint - never /api/nexus/chat, which is the only route that can reach a provider'
  );
  assert.ok(
    widget.requests.every((request) => request.init.headers.accept !== 'text/event-stream'),
    'and none of them asks for a model stream'
  );
  assert.deepEqual(
    widget.requests.map((request) => request.init.headers['x-nexus-conversation']),
    Array(widget.requests.length).fill('T1'),
    'every retry carries the same retired credential, never a newer one'
  );

  // A retry that wakes up after the control became unavailable again is still
  // dropped by the generation guard, not smuggled onto a newer conversation.
  const raced = resetMachine();
  let allow = false;
  raced.setResponder(() => (allow ? { status: 204 } : new Error('network')));
  raced.storeConv('T1');
  raced.newConversation();
  await raced.settle();
  assert.equal(raced.timers.length, 1, 'the failed T1 reset scheduled a retry');
  allow = true;
  raced.storeConv('T2');
  raced.newConversation();
  await raced.drain();
  assert.deepEqual(
    raced.requests.map((request) => request.init.headers['x-nexus-conversation']),
    ['T1', 'T2'],
    'the superseded T1 retry dropped itself; only the current abandonment was attempted'
  );
});

test('the "New conversation" control has a real accessible unavailable state, not merely a visual one (item 2)', () => {
  const code = normalizeCode(widgetScript());

  // A native <button> carrying `disabled`: assistive technology reports it, and
  // it can be activated neither by pointer nor by keyboard. aria-disabled mirrors
  // it only while it holds and is REMOVED rather than set to "false", so the two
  // can never contradict each other.
  assert.match(
    code,
    /const syncReset=\(\)=>\{if\(!fresh\)return;fresh\.disabled=awaitingHead;if\(awaitingHead\)fresh\.setAttribute\('aria-disabled','true'\);else fresh\.removeAttribute\('aria-disabled'\)\};/,
    'the unavailable state must be the disabled attribute, mirrored by aria-disabled only while it holds'
  );
  assert.doesNotMatch(code, /setAttribute\('aria-disabled','false'\)/, 'aria-disabled must never be set to false beside a real disabled attribute');
  assert.doesNotMatch(
    code,
    /fresh\.classList|classList\.(?:add|toggle)\('is-(?:disabled|busy|waiting)'\)/,
    'a class name is a style, not a state: assistive technology would report nothing'
  );

  // Exactly one variable drives it, and only the reset control is affected.
  const syncStart = code.indexOf('const syncReset=');
  const syncEnd = code.indexOf('const awaitHead=');
  assert.ok(syncStart >= 0 && syncEnd > syncStart, 'syncReset() and awaitHead() must both exist');
  const syncBody = code.slice(syncStart, syncEnd);
  assert.doesNotMatch(syncBody, /\binput\b|\bsend\b|\bclose\b|\blauncher\b/, 'this window disables the reset control and nothing else');
});

test('the unavailable window opens when a turn is sent and closes on the head or on settling (item 2)', () => {
  const code = normalizeCode(widgetScript());

  // Opened the instant the request goes out.
  const askStart = code.indexOf('async function ask');
  const formWiring = code.indexOf("form.addEventListener('submit'", askStart);
  assert.ok(askStart >= 0 && formWiring > askStart);
  const askBody = code.slice(askStart, formWiring);
  assert.match(askBody, /busy\(true\);awaitHead\(true\);/, 'the window opens as the turn starts, beside the existing busy state');

  // Closed the instant the head is read and any issued credential is held - so a
  // mid-stream reset on an established conversation still works, because by then
  // the credential has been rotated to one the core has not seen consumed.
  assert.match(
    askBody,
    /const issued=res\.headers\.get\('x-nexus-conversation'\);if\(issued\)storeConv\(issued\);awaitHead\(false\);/,
    'the window closes immediately after the head is read and the credential rotated'
  );
  const openedAt = askBody.indexOf('awaitHead(true)');
  const closedAt = askBody.indexOf('awaitHead(false)');
  const statusBranchAt = askBody.indexOf('if(res.status!==200');
  assert.ok(openedAt >= 0 && closedAt > openedAt, 'it is opened before it is closed');
  assert.ok(statusBranchAt > closedAt, 'and closed before the status branch, so every refusal re-enables the control too');

  // And closed again whenever a turn settles, which covers the request that never
  // came back at all (network error or abort): that path returns through finish().
  assert.match(
    code,
    /const finish=\(\)=>\{controller=null;busy\(false\);awaitHead\(false\);/,
    'settling a turn always closes the window, including a turn that never produced a head'
  );
});

test('Escape and the panel Close control still work while "New conversation" is unavailable (item 2)', () => {
  const code = normalizeCode(widgetScript());

  // Escape is a document-level listener and is not gated on anything this window
  // touches: while a turn is in flight it aborts that turn, which settles it and
  // makes the reset control available again.
  assert.match(
    code,
    /document\.addEventListener\('keydown',e=>\{if\(e\.key!=='Escape'\)return;if\(controller\)\{cancel\(\);return\}if\(root\.classList\.contains\('is-open'\)\)shut\(\)\}\);/,
    'Escape must still cancel an in-flight turn, then close the panel, with no awaiting-head condition on it'
  );

  // The Close control is wired to shut(), which cancels, and is never disabled.
  assert.match(code, /close\.addEventListener\('click',shut\);/, 'Close stays wired');
  assert.match(code, /const shut=\(\)=>\{cancel\(\);/, 'and Close cancels the in-flight turn first');
  assert.doesNotMatch(code, /close\.disabled|close\.setAttribute\('aria-disabled'/, 'the cancel affordance is never disabled');
  assert.doesNotMatch(code, /if\(awaitingHead\)return\}?\s*\);?\s*document\.addEventListener\('keydown'/, 'nothing gates the Escape handler on this window');

  // The guard is inside the handler as well as on the element, so a click that
  // races the attribute cannot get through either. It is the first statement.
  assert.match(
    code,
    /const newConversation=\(\)=>\{ if\(awaitingHead\)return;/,
    'the guard runs before anything else in the handler'
  );
});

test('the unavailable "New conversation" control reads as inactive without losing its shape (item 2)', () => {
  // The style is the visual half of a state whose accessible half is the disabled
  // attribute. It uses the panel's own muted token rather than an opacity wash: a
  // wash dims the hairline along with the label, which reads as broken rather
  // than as temporarily unavailable, and it puts the label below anything else
  // this panel ships. The pill keeps its full border and its exact footprint, so
  // nothing shifts and nothing appears to vanish.
  const rule = html.match(/\.nexus__prompt:disabled\{[^}]*\}/)?.[0] ?? '';
  assert.ok(rule, 'a .nexus__prompt:disabled rule must ship');
  assert.match(rule, /cursor:not-allowed/, 'the pointer says so before the click');
  assert.match(rule, /color:var\(--mute\)/, "the label drops to the panel's existing muted token");
  assert.match(rule, /border-color:var\(--hair\)/, 'the pill keeps its full hairline, so its footprint is unchanged');
  assert.doesNotMatch(rule, /opacity:/, 'no opacity wash: it would dim the border with the label and read as broken');
  assert.doesNotMatch(rule, /pointer-events:\s*none/, 'pointer-events:none would suppress the not-allowed cursor and hide the control from hit-testing');
  assert.doesNotMatch(rule, /display:\s*none|visibility:\s*hidden/, 'the control stays present and findable');

  // And it must not light up on hover or focus while it is unavailable.
  assert.match(html, /\.nexus__prompt:disabled:hover,\.nexus__prompt:disabled:focus-visible\{[^}]*\}/, 'the hover and focus affordance is neutralised while it is unavailable');

  // No new design language: no new class, token or colour was introduced for this.
  assert.doesNotMatch(html, /\.nexus__prompt--/, 'no new modifier class');
  assert.equal((html.match(/\.nexus__prompt:disabled/g) ?? []).length, 3, 'exactly the two rules above, and nothing else keyed on the state');
});

// ---------------------------------------------------------------------------
// Blocker 5 (website half): the visitor is always told something they can act
// on, and is never offered an action that is guaranteed to fail identically.
//
// These are BEHAVIOURAL, not string matches. They lift the shipped
// httpFailure() out of the served page and execute it against scripted
// responses with its helpers stubbed, so what is asserted is the visible output
// a visitor would actually get. A reimplementation of the logic inside the test
// would drift from the page; this cannot.
//
// One thing worth stating, because it shapes what "no retry" may mean here: the
// submit handler CLEARS the input before sending, so after a refusal the
// visitor's text survives only in the transcript. A refusal that tells someone
// to rephrase while giving them no way to recover what they typed is its own
// dead end. So the rule pinned below is not "never offer a pill" - it is that
// the affordance must not be a RETRY of bytes that cannot succeed. Where
// resending identically is hopeless the page offers an edit instead, labelled
// as one.
// ---------------------------------------------------------------------------

/** Build the shipped httpFailure with its free variables replaced by recorders. */
function shippedHttpFailure() {
  const script = html.match(/<script>\s*\(\(\)=>\{\s*const root=document\.getElementById\('nexus'\)[\s\S]*?<\/script>/i)?.[0] ?? '';
  assert.ok(script, 'the NEXUS widget script must exist');
  const code = stripComments(script);
  const textSrc = code.match(/const TEXT=\{[\s\S]*?\};/)?.[0];
  assert.ok(textSrc, 'the TEXT table must exist');
  const start = code.indexOf('const httpFailure=');
  const end = code.indexOf('async function ask(');
  assert.ok(start >= 0 && end > start, 'httpFailure must be found, ahead of ask()');
  const source = code.slice(start, end);

  const TEXT = new Function('return (' + textSrc.replace(/^const TEXT=/, '').replace(/;\s*$/, '') + ')')();
  const calls = [];
  const factory = new Function(
    'TEXT',
    'status',
    'limited',
    'offlineNotice',
    'unavailableNotice',
    'refillPill',
    source + ' return httpFailure;'
  );
  const httpFailure = factory(
    TEXT,
    (text, retry) => calls.push({ kind: 'status', text, retry: Boolean(retry) }),
    (seconds) => calls.push({ kind: 'limited', seconds }),
    () => calls.push({ kind: 'offline' }),
    () => calls.push({ kind: 'unavailable' }),
    (label) => calls.push({ kind: 'pill', label })
  );
  const response = (status, errorCode, headers = {}) => ({
    status,
    headers: { get: (name) => headers[name.toLowerCase()] ?? null },
    json: async () => (errorCode ? { code: errorCode } : {})
  });
  return { httpFailure, calls, TEXT, response, source };
}

/** Any affordance whose label invites resending the same bytes unchanged. */
const RETRY_LABEL = /^(?:retry|try again|resend|send again)$/i;

test('a message the visitor just sent is refused with an explanation, not the generic failure plus a retry that must fail again (blocker 5)', async () => {
  const { httpFailure, calls, TEXT, response } = shippedHttpFailure();

  // The repeat guard is a pre-SSE JSON 400 carrying code 'guard_blocked'
  // (the core's guards.ts: "identical message repeated too quickly", inside a
  // ~10 second window). It used to fall through every branch to the generic
  // line "The assistant could not finish that reply. You can try again." WITH a
  // pill labelled Retry that refilled the identical message - so the visitor
  // got a loop that always failed the same way and was never told why.
  const hold = await httpFailure(response(400, 'guard_blocked'));
  assert.notEqual(hold, 'hold', 'the turn finishes rather than being held open');

  const said = calls.find((c) => c.kind === 'status');
  assert.ok(said, 'something is said');
  assert.ok(!calls.some((c) => c.kind === 'offline'), 'and it is not an offline notice');
  assert.ok(!calls.some((c) => c.kind === 'limited'), 'nor dressed up as a rate limit with a countdown');
  assert.notEqual(said.text, TEXT.error, 'it is NOT the generic failure line');

  // Pinned by meaning: the line must name what happened and offer a way out.
  assert.match(
    said.text,
    /\b(?:same|identical|already|just sent)\b/i,
    'the visitor is told it was the same message they just sent'
  );
  assert.match(
    said.text,
    /\b(?:moment|wait|rephrase|reword|differently|different way|another way|change)\b/i,
    'and is given something to do about it'
  );

  // No action that is guaranteed to fail identically: nothing here may invite
  // resending the same bytes. Recovering the text to EDIT it is fine, and is
  // what makes "say it a different way" actionable at all.
  assert.equal(said.retry, false, 'status() must not add its Retry pill');
  for (const pill of calls.filter((c) => c.kind === 'pill')) {
    assert.doesNotMatch(pill.label, RETRY_LABEL, 'no pill may invite an identical resend: ' + pill.label);
  }
  const pill = calls.find((c) => c.kind === 'pill');
  assert.ok(pill, 'the typed message is still recoverable, because the input was cleared on submit');
  assert.match(pill.label, /\bedit\b/i, 'and the affordance says so: ' + pill.label);
});

test('daily budget exhaustion is not reported as the whole assistant being offline, and no branch waits on a code the core never sends (blocker 5)', async () => {
  const { httpFailure, calls, response, source } = shippedHttpFailure();

  // WHAT ACTUALLY HAPPENS on exhaustion: the provider gate refuses with
  // 'daily_provider_limit', guardFailure maps it to dailyProviderLimit, and the
  // pipeline's provider catch emits code 'provider_unavailable' with "the
  // assistant is temporarily unavailable". Exhaustion is therefore
  // indistinguishable from an outage ON THE WIRE, so the one honest line has to
  // cover both without claiming the assistant is down.
  const out = await httpFailure(response(503, 'provider_unavailable'));
  assert.ok(!calls.some((c) => c.kind === 'offline'), 'exhaustion must not be reported as "offline right now"');
  assert.ok(calls.some((c) => c.kind === 'unavailable'), 'it gets the temporary-unavailability notice instead');
  assert.notEqual(out, 'hold');

  // 'disabled' is a different fact and keeps the offline notice: the assistant
  // really is switched off, and there is nothing to come back for in a minute.
  calls.length = 0;
  await httpFailure(response(503, 'disabled'));
  assert.deepEqual(calls, [{ kind: 'offline' }], 'a disabled build is still reported as offline');

  // A bare 503 with no code the client recognises is still offline, not silence.
  calls.length = 0;
  await httpFailure(response(503, ''));
  assert.equal(calls.length, 1, 'a 503 with no code still says something');

  // No dead branch. 'budget_exhausted' is declared in the core's taxonomy and
  // CONSTRUCTED NOWHERE, so a client branch on it was unreachable code that
  // looked like coverage and hid this defect. It must not return without the
  // core actually sending it.
  assert.doesNotMatch(html, /budget_exhausted/, 'the widget must not branch on a code the core never constructs');
  assert.doesNotMatch(source, /budget_exhausted/);
});

test('every pre-stream refusal the core can raise says something specific, and offers a resend only when one could succeed (blocker 5)', async () => {
  const { httpFailure, calls, TEXT, response } = shippedHttpFailure();

  // One row per code in the core's STATUS_FOR table that can be raised BEFORE
  // the stream opens. `resendable` is whether an affordance may invite sending
  // the identical bytes again: only where that could actually succeed.
  const rows = [
    ['turn_in_progress', 409, false],
    ['bad_origin', 403, false],
    ['guard_blocked', 400, false],
    ['invalid_input', 400, false],
    ['payload_too_large', 413, false],
    ['deadline', 504, true]
  ];

  for (const [errorCode, status, resendable] of rows) {
    calls.length = 0;
    await httpFailure(response(status, errorCode));
    const said = calls.find((c) => c.kind === 'status');
    assert.ok(said, errorCode + ': something specific is said');
    assert.notEqual(said.text, TEXT.error, errorCode + ': must not fall through to the generic line');
    if (!resendable) {
      assert.equal(said.retry, false, errorCode + ': status() must not add a Retry pill');
      for (const pill of calls.filter((c) => c.kind === 'pill')) {
        assert.doesNotMatch(pill.label, RETRY_LABEL, errorCode + ': no pill may invite an identical resend');
      }
    } else {
      assert.ok(
        said.retry || calls.some((c) => c.kind === 'pill'),
        errorCode + ': a resend is worth offering here'
      );
    }
  }

  // rate_limited keeps its countdown and its hold; that retry DOES eventually work.
  calls.length = 0;
  const held = await httpFailure(response(429, 'rate_limited', { 'retry-after': '30' }));
  assert.equal(held, 'hold');
  assert.deepEqual(calls, [{ kind: 'limited', seconds: 30 }]);

  // The generic line still exists for a refusal shape nobody anticipated. It is
  // the floor, not the normal answer.
  calls.length = 0;
  await httpFailure(response(418, 'something_new'));
  assert.deepEqual(calls, [{ kind: 'status', text: TEXT.error, retry: true }]);
});
