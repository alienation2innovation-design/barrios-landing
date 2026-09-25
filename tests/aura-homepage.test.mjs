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

test('the widget scopes its conversation token to the tab and never exposes it', () => {
  const script = html.match(/<script>\s*\(\(\)=>\{\s*const root=document\.getElementById\('nexus'\)[\s\S]*?<\/script>/i)?.[0] ?? '';
  assert.ok(script, 'the NEXUS widget script must exist');
  assert.match(script, /sessionStorage/, 'the token lives in sessionStorage, which is per-tab by construction');
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

test('a fresh document load unconditionally forgets the stored token before any turn can be sent (RVP I1)', () => {
  const script = html.match(/<script>\s*\(\(\)=>\{\s*const root=document\.getElementById\('nexus'\)[\s\S]*?<\/script>/i)?.[0] ?? '';
  assert.ok(script, 'the NEXUS widget script must exist');

  // The reload-only guard reproduced the reported symptom (empty transcript,
  // inherited context) on any other fresh document load - an in-tab navigation
  // to /privacy-directive.html or /contact.html and back, or a back/forward
  // that misses the bfcache. It must be gone entirely, not merely widened.
  assert.doesNotMatch(script, /===\s*'reload'/, 'no comparison may gate the delete on the reload navigation type');
  assert.doesNotMatch(script, /getEntriesByType\(['"]navigation['"]\)/, 'the navigation-timing check that only covered reload must be removed');

  // Every storage access, including this one, stays wrapped in try/catch -
  // private mode and blocked storage must degrade to "no token", never throw.
  const code = normalizeCode(script);
  assert.match(
    code,
    /const forgetConv=\(\)=>\{try\{sessionStorage\.removeItem\(CONV_KEY\)\}catch\(err\)\{\}\};/,
    'forgetConv itself must remain a guarded sessionStorage access'
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
  assert.doesNotMatch(newConversationBody, /await|\.then\(|fetch\(/, 'clearing must never be deferred to a network response, so a failed or dropped revocation cannot leave stale state visible');

  // And the revocation is fired only once every one of those synchronous steps
  // has run: it is the last statement in the handler, so the UI is already
  // correct before a single byte goes near the network.
  const clearAt = newConversationBody.indexOf('clearTranscript()');
  const forgetAt = newConversationBody.indexOf('forgetConv()');
  const fireAt = newConversationBody.indexOf('sendReset(old,resetEpoch,0)');
  assert.ok(fireAt > clearAt && fireAt > forgetAt, 'the reset request is fired after the synchronous clearing, not before or instead of it');
  assert.match(newConversationBody, /sendReset\(old,resetEpoch,0\)\};\s*$/, 'firing the reset is the final statement of the handler');
});

test('the NEXUS widget carries only the concise chat notice and links to the Privacy page', () => {
  const disclosure = markup.match(/<p\b[^>]*class="nexus__disclosure"[^>]*>([\s\S]*?)<\/p>/i)?.[1] ?? '';
  assert.ok(disclosure, 'the nexus__disclosure paragraph must exist');
  const text = disclosure.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

  // Item 4. Two earlier versions of this line were both wrong. The first
  // promised that contact details are requested with consent, which no build
  // with the lead backend off can honour. The second - "This chat does not
  // collect contact details" - was true about contact details but read as a
  // claim about the chat as a whole, while every word a visitor types is in
  // fact sent to a third-party model to answer them.
  //
  // So the line now says exactly the two things that are true and actionable:
  // NEXUS does not ask for or save contact details, and the visitor should not
  // type personal information here. It deliberately does NOT claim that what
  // they type is unprocessed, and the Privacy link carries the provider detail
  // the panel may not name.
  assert.equal(
    text,
    'AI-powered chat. NEXUS does not ask for or save contact details. Please do not type personal information here. Privacy'
  );
  assert.match(text, /does not ask for or save contact details/, 'the capability limit is stated');
  assert.match(text, /do not type personal information/i, 'and the visitor is warned');
  assert.doesNotMatch(
    html,
    /Contact details are requested only with your consent/i,
    'the retired consent promise must be gone from the served page'
  );
  assert.doesNotMatch(
    html,
    /This chat does not collect contact details/i,
    'the superseded wording, which read as a claim about all typed text, must be gone'
  );
  // The warning must not be undercut by a claim that nothing is processed.
  assert.doesNotMatch(
    text,
    /(?:never|not|no)\s+(?:\w+\s+){0,3}(?:processed|read|analysed|analyzed|stored anywhere)/i,
    'the disclosure must not imply that visitor text is never processed'
  );

  assert.match(disclosure, /<a\b[^>]*href="\/privacy-directive\.html"[^>]*>Privacy<\/a>/i);
  assert.doesNotMatch(disclosure, /anthropic|microsoft|openai|claude|vercel|n8n|zapier|make\.com|hosting|api/i);
  assert.doesNotMatch(disclosure, /does not book|schedule|send email|issue quotes|30 days/i);
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

  // What does NOT happen, stated plainly, because the lead backend is off.
  assert.match(privacy, /Lead capture is switched off in the current release\./);
  assert.match(privacy, /NEXUS does not ask you for contact details/);
  assert.match(privacy, /does not save anything you type in the chat/);

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

  const capture = code.match(/const old=readConv\(\); resetEpoch\+\+;/)?.[0];
  assert.ok(capture, 'newConversation() must read the retired token and open a new generation');

  const fire = code.match(/sendReset\(old,resetEpoch,0\)/)?.[0];
  assert.ok(fire, 'newConversation() must fire the reset for the token it retired');

  const body = `
    let resetEpoch = 0, stored = '';
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

    // The two shipped statements from newConversation() that constitute the
    // reset contract, in their shipped order. The rest of that handler (the
    // transcript, the abort, the focus) is asserted separately, by source.
    const newConversation = () => { ${capture} forgetConv(); ${fire}; };

    const settle = async () => { for (let i = 0; i < 12; i += 1) await Promise.resolve(); };
    const drain = async () => {
      await settle();
      while (timers.length) { timers.shift().run(); await settle(); }
    };

    return {
      requests, timers, newConversation, storeConv, drain, settle,
      storedToken: () => stored,
      generation: () => resetEpoch,
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
