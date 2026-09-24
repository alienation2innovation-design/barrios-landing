import assert from 'node:assert/strict';
import { before, test } from 'node:test';

const homepageUrl = process.env.HOMEPAGE_URL ?? 'http://127.0.0.1:4173/';
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
  assert.match(markup, /Start a consultation request/i);
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

test('the NEXUS panel is honestly labeled as the NEXUS AI beta with a real consultation CTA and no booking claims', () => {
  assert.match(html, /NEXUS AI BETA/);
  assert.doesNotMatch(html, /PUBLIC PILOT/i, 'the retired public-pilot label must be gone from the served page');
  assert.match(html, /Start a consultation request/);
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

test('the NEXUS widget carries only the concise chat notice and links to the Privacy page', () => {
  const disclosure = markup.match(/<p\b[^>]*class="nexus__disclosure"[^>]*>([\s\S]*?)<\/p>/i)?.[1] ?? '';
  assert.ok(disclosure, 'the nexus__disclosure paragraph must exist');
  const text = disclosure.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  assert.equal(text, 'AI-powered chat. Contact details are requested only with your consent. Privacy');
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
