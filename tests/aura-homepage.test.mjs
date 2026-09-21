import assert from 'node:assert/strict';
import { before, test } from 'node:test';

const homepageUrl = process.env.HOMEPAGE_URL ?? 'http://127.0.0.1:4173/';
const requiredSocials = [
  'https://www.linkedin.com/in/gary-barrios-3953b2390/',
  'https://x.com/BarriosA2I',
  'https://www.instagram.com/barrios.ai.gary/',
  'https://www.tiktok.com/@garyjbarrios',
  'https://www.reddit.com/user/BarriosA2I/'
];

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

test('the served document keeps the Barrios message readable without JavaScript', () => {
  const fallback = markup.match(/<noscript>[\s\S]*?<\/noscript>/i)?.[0] ?? '';
  assert.match(fallback, /Barrios A2I/i);
  assert.match(fallback, /connected marketing automation built around your business/i);
  assert.match(fallback, /href="#no-js-automate"/i);
  assert.doesNotMatch(fallback, /preview|prototype/i, 'the no-JS copy must describe the public pilot honestly');
});

test('the social signal and footer expose all five approved profiles without Facebook', () => {
  const anchors = [...markup.matchAll(/<a\b[^>]*>/gi)].map((match) => match[0]);

  for (const socialUrl of requiredSocials) {
    const matching = anchors.filter((tag) => getAttribute(tag, 'href') === socialUrl);
    assert.equal(matching.length, 2, `${socialUrl} must appear once in the signal strip and once in the footer`);
    for (const tag of matching) {
      assert.equal(getAttribute(tag, 'target'), '_blank');
      assert.equal(getAttribute(tag, 'rel'), 'noopener noreferrer');
      assert.ok(getAttribute(tag, 'aria-label'), `${socialUrl} must have an accessible name`);
    }
  }

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

test('the consultation CTA is in footer flow and every NEXUS opener controls the shared dialog', () => {
  const finalCtaPosition = markup.indexOf('class="cta');
  const bookingPosition = markup.indexOf('class="footer-booking"');
  const footerColumnsPosition = markup.indexOf('class="foot__top"');
  assert.ok(finalCtaPosition >= 0 && finalCtaPosition < bookingPosition, 'the footer CTA must follow the final CTA');
  assert.ok(bookingPosition < footerColumnsPosition, 'the footer CTA must precede the footer columns');

  const openers = openingTagsWith('data-nexus-open');
  assert.ok(openers.length >= 3, 'hero, launcher, and footer controls must all open NEXUS');
  for (const opener of openers) {
    assert.equal(getAttribute(opener, 'aria-controls'), 'nexus-panel');
    assert.equal(getAttribute(opener, 'aria-expanded'), 'false');
  }
});

test('the NEXUS panel is honestly labeled as a public pilot with a real consultation CTA and no booking claims', () => {
  assert.match(html, /PUBLIC PILOT/);
  assert.match(html, /Start a consultation request/);
  assert.doesNotMatch(html, /ASSISTANT PREVIEW|Book Now|BOOKING NOT LIVE|data-nexus-book|Meeting preference/);
  assert.match(html, /Contact Gary/);

  // RD-I1: the accessible names inside the panel must say what the visible
  // badge says. A screen reader announces the dialog's aria-label the moment
  // focus enters it, and "preview"/"prototype" contradicts PUBLIC PILOT.
  const panelStart = markup.search(/<section\b[^>]*id="nexus-panel"/i);
  assert.ok(panelStart >= 0, 'the NEXUS panel section must exist');
  const panelEnd = markup.indexOf('</section>', panelStart);
  assert.ok(panelEnd > panelStart, 'the NEXUS panel section must close');
  const panel = markup.slice(panelStart, panelEnd);
  const panelTags = [...panel.matchAll(/<[a-z][^>]*>/gi)].map((m) => m[0]);
  const labels = panelTags.map((tag) => getAttribute(tag, 'aria-label')).filter((label) => label !== null);
  assert.ok(labels.length >= 3, 'the dialog, the close button and the send button carry accessible names');
  for (const label of labels) {
    assert.doesNotMatch(label, /preview|prototype/i, `aria-label "${label}" must not diminish the public pilot`);
  }
  const dialogTag = panelTags[0];
  assert.match(getAttribute(dialogTag, 'aria-label') ?? '', /public pilot/i, 'the dialog is named as the public pilot');
  const sendTag = panelTags.find((tag) => /class="nexus__send"/i.test(tag));
  assert.ok(sendTag, 'the send button must exist');
  assert.equal(getAttribute(sendTag, 'aria-label'), 'Send message');
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
