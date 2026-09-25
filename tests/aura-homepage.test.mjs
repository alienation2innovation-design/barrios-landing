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

test('a pending revoke rides the visitor\'s very next turn as the OLD token plus the reset header, and is never sent otherwise (H1b)', () => {
  const script = html.match(/<script>\s*\(\(\)=>\{\s*const root=document\.getElementById\('nexus'\)[\s\S]*?<\/script>/i)?.[0] ?? '';
  assert.ok(script, 'the NEXUS widget script must exist');
  const code = normalizeCode(script);

  // newConversation() must capture whatever token is currently stored, BEFORE
  // forgetConv() clears it, into a closure variable ask() consumes later. It
  // must never itself call fetch - that would spend a provider turn on a
  // click that may never be followed by a message.
  const newConversationStart = code.indexOf('const newConversation=');
  const openersWiring = code.indexOf("if(fresh)fresh.addEventListener");
  assert.ok(newConversationStart >= 0 && openersWiring > newConversationStart);
  const newConversationBody = code.slice(newConversationStart, openersWiring);
  assert.match(
    newConversationBody,
    /const old=readConv\(\);if\(old\)revokeToken=old; forgetConv\(\);lastMessage=''/,
    'the abandoned token must be captured before forgetConv() clears storage, without disturbing the existing forget/reset sequence'
  );
  assert.doesNotMatch(newConversationBody, /fetch\(/, 'clicking "New conversation" must never itself call fetch');

  // ask() reads revokeToken but must NOT clear it before the fetch: a turn that
  // never reached the server, or that the server refused, has not delivered the
  // revocation, and clearing it there lost it forever (I4). The clear moved to
  // revokeSent(), called only on a served turn - asserted in its own tests
  // below. What must remain true here is that the read does not consume it.
  const askStart = code.indexOf('async function ask');
  const formWiring = code.indexOf("form.addEventListener('submit'", askStart);
  assert.ok(askStart >= 0 && formWiring > askStart);
  const askBody = code.slice(askStart, formWiring);
  assert.match(
    askBody,
    /const revoke=revokeToken; const revokeSent=\(\)=>\{if\(revoke&&revokeToken===revoke\)revokeToken=''\};/,
    'the pending revoke must be read without being consumed, and cleared only by revokeSent()'
  );
  assert.doesNotMatch(
    askBody,
    /const revoke=revokeToken;revokeToken='';/,
    'the pre-fetch read-then-clear is the I4 defect and must be gone'
  );
  assert.match(
    askBody,
    /\.\.\.\(revoke\?\{'x-nexus-conversation':revoke,'x-nexus-conversation-reset':'1'\}:conv\?\{'x-nexus-conversation':conv\}:\{\}\)/,
    'the reset header must only ever accompany the revoked token; an ordinary turn sends the plain stored token instead, never both'
  );

  // The reset header is wired in exactly this one place.
  assert.equal((script.match(/x-nexus-conversation-reset/g) ?? []).length, 1, 'the reset header must appear in exactly one place in the widget');
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
  assert.doesNotMatch(newConversationBody, /await|\.then\(|fetch\(/, 'clearing must never be deferred to a network response, so a failed or never-sent revocation cannot leave stale state visible');
});

test('the NEXUS widget carries only the concise chat notice and links to the Privacy page', () => {
  const disclosure = markup.match(/<p\b[^>]*class="nexus__disclosure"[^>]*>([\s\S]*?)<\/p>/i)?.[1] ?? '';
  assert.ok(disclosure, 'the nexus__disclosure paragraph must exist');
  const text = disclosure.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

  // Finding 9 (S8): the retired sentence promised that contact details are
  // requested with consent. With no active lead backend they are never
  // requested at all, so the promise was untrue on a live site. The disclosure
  // now states what the build actually does, and says nothing about a
  // capability being enabled.
  assert.equal(text, 'AI-powered chat. This chat does not collect contact details. Privacy');
  assert.doesNotMatch(
    html,
    /Contact details are requested only with your consent/i,
    'the retired consent promise must be gone from the served page'
  );

  assert.match(disclosure, /<a\b[^>]*href="\/privacy-directive\.html"[^>]*>Privacy<\/a>/i);
  assert.doesNotMatch(disclosure, /anthropic|microsoft|openai|claude|vercel|n8n|zapier|make\.com|hosting|api/i);
  assert.doesNotMatch(disclosure, /does not book|schedule|send email|issue quotes|30 days/i);
});

test('the Privacy page keeps the full AI assistant provider disclosure and the new consent/OneDrive/notification terms', async () => {
  const privacyResponse = await fetch(new URL('/privacy-directive.html', homepageUrl));
  assert.equal(privacyResponse.status, 200);
  const privacy = stripExecutableContent(await privacyResponse.text());
  assert.match(privacy, /AI Assistant \(NEXUS\)/);
  assert.match(privacy, /as written to Anthropic’s API to generate replies/);
  assert.match(privacy, /deletes API inputs and outputs within 30 days/);
  assert.match(privacy, /does not use commercial API data to train its models by default/);
  assert.match(privacy, /do not share sensitive, personal or confidential information/i);
  assert.match(privacy, /consent/i);
  assert.match(privacy, /OneDrive/i);
  assert.match(privacy, /email notification/i);
  // RE: the prospect confirmation is disclosed too - one truthful sentence,
  // and still no retention duration asserted for Barrios A2I.
  assert.match(privacy, /If you provide an email address, a confirmation of your request is also sent to that address\./);
  const nexusSection = privacy.match(/AI Assistant \(NEXUS\)[\s\S]*?<\/p>/)?.[0] ?? '';
  assert.ok(nexusSection, 'the NEXUS section paragraph must exist');
  assert.doesNotMatch(nexusSection, /we (?:retain|keep|store)[^.]*\b(?:days|months|years)\b/i, 'no Barrios A2I retention duration');
  assert.match(privacy, /Last updated: September 2026/);
});

// ---------------------------------------------------------------------------
// I4: a revocation that was never delivered must not be silently dropped.
//
// The old code ran `const revoke=revokeToken;revokeToken='';` BEFORE the fetch.
// Any refusal of that turn - an abort, a network error, a 409 turn_in_progress
// (very reachable: clicking "New conversation" mid-stream aborts the client
// while the server turn is still unwinding and holding the session lock), a 429
// hold - therefore destroyed the pending revocation while the UI had already
// told the visitor the conversation was new. The server-side record then lived
// on to the idle sweep.
//
// The fix keeps the pending revoke until a response head proves the turn was
// actually served, which is the only answer that proves the core resolved this
// conversation and therefore evaluated the reset.
//
// These are behavioural tests, not string matches: they lift the shipped source
// text for the capture, the read, revokeSent() and the header expression out of
// the served page and execute it against scripted turn outcomes. A copy of the
// logic would drift; this cannot.

function widgetScript() {
  const script = html.match(/<script>\s*\(\(\)=>\{\s*const root=document\.getElementById\('nexus'\)[\s\S]*?<\/script>/i)?.[0] ?? '';
  assert.ok(script, 'the NEXUS widget script must exist');
  return script;
}

function revokeMachine() {
  const code = normalizeCode(widgetScript());

  const capture = code.match(/const old=readConv\(\);if\(old\)revokeToken=old;/)?.[0];
  assert.ok(capture, 'newConversation() must capture the abandoned token');

  const stateMachine = code.match(
    /const revoke=revokeToken; const revokeSent=\(\)=>\{if\(revoke&&revokeToken===revoke\)revokeToken=''\};/
  )?.[0];
  assert.ok(stateMachine, 'ask() must read the pending revoke without consuming it, and define revokeSent()');

  const spread = code.match(/\.\.\.\(revoke\?\{[^{}]*\}:conv\?\{[^{}]*\}:\{\}\)/)?.[0];
  assert.ok(spread, 'the conditional conversation/reset header expression must exist');

  // A turn harness built from the shipped fragments. `outcome` is what the turn
  // came back as: 'network' (the fetch threw - an abort or a transport error, so
  // no response head at all), 'refused' (a response head arrived but the turn
  // was not served: 409, 429, 403, 503...), or 'served' (a 200 text/event-stream
  // head, which is where the widget calls revokeSent()).
  const body = `
    let revokeToken = '', stored = '';
    const readConv = () => stored;
    const forgetConv = () => { stored = ''; };
    const storeConv = (value) => { stored = value; };
    const requests = [];

    const newConversation = () => { ${capture} forgetConv(); };

    const turn = (outcome, issued, midFlight) => {
      const conv = readConv();
      ${stateMachine}
      const headers = { 'content-type': 'application/json', ${spread} };
      requests.push(headers);
      if (typeof midFlight === 'function') midFlight();
      if (outcome === 'network') return;
      if (issued) storeConv(issued);
      if (outcome !== 'served') return;
      revokeSent();
    };

    return {
      requests,
      newConversation,
      turn,
      storeConv,
      pending: () => revokeToken,
      storedToken: () => stored
    };
  `;
  return new Function(body)();
}

const TOKEN = 'x-nexus-conversation';
const RESET = 'x-nexus-conversation-reset';

test('a pending revoke survives a turn that never reached the server and rides the next one (I4)', () => {
  const widget = revokeMachine();
  widget.storeConv('T1');
  widget.newConversation();
  assert.equal(widget.pending(), 'T1', 'the abandoned token is captured on the click');
  assert.equal(widget.storedToken(), '', 'and is gone from storage immediately');

  // The fetch threw: an abort (the visitor clicked "New conversation" mid-stream)
  // or a transport error. Nothing was delivered.
  widget.turn('network');
  assert.equal(widget.requests[0][TOKEN], 'T1');
  assert.equal(widget.requests[0][RESET], '1');
  assert.equal(widget.pending(), 'T1', 'a turn that never reached the server must not consume the revoke');

  // A response head arrived, but the turn was refused - 409 turn_in_progress,
  // 429 rate limited, 403, 503. The core never resolved this conversation, so
  // the reset was never evaluated.
  widget.turn('refused');
  assert.equal(widget.requests[1][TOKEN], 'T1');
  assert.equal(widget.requests[1][RESET], '1');
  assert.equal(widget.pending(), 'T1', 'a refused turn must not consume the revoke either');

  // 429 with a fresh token issued alongside the refusal: the revoke still stands.
  widget.turn('refused', 'T2');
  assert.equal(widget.requests[2][TOKEN], 'T1');
  assert.equal(widget.pending(), 'T1');

  // Served at last. Now, and only now, is it spent.
  widget.turn('served', 'T9');
  assert.equal(widget.requests[3][TOKEN], 'T1');
  assert.equal(widget.requests[3][RESET], '1');
  assert.equal(widget.pending(), '', 'a served turn delivered the revocation, so it is spent');
});

test('a delivered revoke is never sent a second time for the same conversation (I4)', () => {
  const widget = revokeMachine();
  widget.storeConv('T1');
  widget.newConversation();
  widget.turn('served', 'T9');
  assert.equal(widget.requests[0][RESET], '1');

  // Every later turn is an ordinary turn: the stored token, no reset header.
  widget.turn('served', 'T10');
  widget.turn('refused');
  widget.turn('served', 'T11');
  for (const request of widget.requests.slice(1)) {
    assert.equal(RESET in request, false, 'an ordinary turn must never carry the reset header');
  }
  assert.equal(widget.requests[1][TOKEN], 'T9', 'an ordinary turn carries the stored token');
  assert.equal(widget.requests[3][TOKEN], 'T10');
  assert.equal(
    widget.requests.filter((request) => RESET in request).length,
    1,
    'exactly one request in the whole session asked for the revocation'
  );
});

test('the reset header is never sent without a token, and never on an ordinary turn (I4)', () => {
  const widget = revokeMachine();

  // A brand new tab: nothing stored, nothing abandoned. No conversation header
  // at all, and certainly no reset.
  widget.turn('served', 'T1');
  assert.equal(TOKEN in widget.requests[0], false);
  assert.equal(RESET in widget.requests[0], false);

  // An ordinary second turn: the stored token alone.
  widget.turn('served', 'T2');
  assert.equal(widget.requests[1][TOKEN], 'T1');
  assert.equal(RESET in widget.requests[1], false);

  // A click with nothing stored yet cannot invent a revocation.
  const empty = revokeMachine();
  empty.newConversation();
  assert.equal(empty.pending(), '', 'there is nothing to revoke when no token was ever issued');
  empty.turn('served', 'A');
  assert.equal(RESET in empty.requests[0], false);

  // Invariant over every request produced by all three widgets: a reset always
  // travels with a non-empty token.
  for (const request of [...widget.requests, ...empty.requests]) {
    if (!(RESET in request)) continue;
    assert.equal(typeof request[TOKEN], 'string');
    assert.ok(request[TOKEN].length > 0, 'the reset header must only ever accompany a token');
  }
});

test('a "New conversation" clicked while a turn is in flight is not wiped by that turn succeeding (I4)', () => {
  const widget = revokeMachine();
  widget.storeConv('T1');
  widget.newConversation();

  // The turn carrying T1's revocation is in flight. Mid-flight the visitor sends
  // a second reset: a later answer has since stored T2, so the click captures T2
  // into the same single slot. The in-flight turn then succeeds - and must clear
  // only what it was carrying, which is no longer what is pending.
  widget.turn('served', 'T9', () => {
    widget.storeConv('T2');
    widget.newConversation();
  });
  assert.equal(widget.pending(), 'T2', 'the newer pending revoke must survive the older turn completing');

  widget.turn('served', 'T10');
  assert.equal(widget.requests[1][TOKEN], 'T2');
  assert.equal(widget.requests[1][RESET], '1');
  assert.equal(widget.pending(), '');
});

test('two "New conversation" clicks queue nothing: the slot holds the most recently abandoned token (I4)', () => {
  // DECISION, recorded here because it is a deliberate limit and not an
  // oversight. The wire carries exactly one conversation token per request, so a
  // queue could only drain one revocation per turn - and because a revoking turn
  // is served on a brand new conversation, draining a queue would reset the
  // visitor's context on every turn until it emptied. That is worse for the
  // visitor than letting the older abandoned record fall to the deadline sweep,
  // where it is already unreachable. So: a single slot, holding the most recent
  // abandonment. Only the most recent is attempted.
  const twice = revokeMachine();
  twice.storeConv('A');
  twice.newConversation();
  twice.storeConv('B');
  twice.newConversation();
  assert.equal(twice.pending(), 'B', 'the most recently abandoned conversation is the one attempted');

  // And the case with no turn between the two clicks is not a loss at all: no
  // second conversation was ever minted, so the first click's capture stands.
  const noTurnBetween = revokeMachine();
  noTurnBetween.storeConv('A');
  noTurnBetween.newConversation();
  noTurnBetween.newConversation();
  assert.equal(noTurnBetween.pending(), 'A', 'a second click with nothing stored must not erase the pending revoke');
  noTurnBetween.turn('served', 'Z');
  assert.equal(noTurnBetween.requests[0][TOKEN], 'A');
  assert.equal(noTurnBetween.requests[0][RESET], '1');
});

test('revokeSent() is called in exactly one place, after the turn is known to be served (I4)', () => {
  const code = normalizeCode(widgetScript());
  const askStart = code.indexOf('async function ask');
  const formWiring = code.indexOf("form.addEventListener('submit'", askStart);
  const askBody = code.slice(askStart, formWiring);

  assert.equal(
    (askBody.match(/revokeSent\(\);/g) ?? []).length,
    1,
    'revokeSent() must be called from exactly one place'
  );

  const definedAt = askBody.indexOf('const revokeSent=');
  const fetchAt = askBody.indexOf("res=await fetch('/api/nexus/chat'");
  const issuedAt = askBody.indexOf("const issued=res.headers.get('x-nexus-conversation')");
  const statusGuardAt = askBody.indexOf('if(res.status!==200');
  const calledAt = askBody.indexOf('revokeSent();');

  assert.ok(definedAt >= 0 && fetchAt > definedAt, 'the pending revoke is read before the fetch that carries it');
  assert.ok(statusGuardAt > issuedAt && issuedAt > fetchAt, 'the status guard follows the response head');
  assert.ok(
    calledAt > statusGuardAt,
    'the revoke may only be discarded after the 200 text/event-stream guard has been passed'
  );

  // Nothing else may clear it. If any other statement assigned revokeToken='',
  // a refused turn could still lose the revocation.
  const script = widgetScript();
  const clears = (script.match(/revokeToken=''/g) ?? []).length;
  assert.equal(clears, 2, 'revokeToken is initialised once and cleared once, inside revokeSent()');
  assert.match(script, /pendingReset=false,revokeToken=''/, 'one of the two is the declaration');

  // And the failure is silent: nothing in the revoke path surfaces a status line.
  const machine = askBody.slice(definedAt, fetchAt);
  assert.doesNotMatch(machine, /status\(|offlineNotice\(|retryPill\(/, 'a failed revocation is never shown to the visitor');
});
