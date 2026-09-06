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
  assert.match(markup, /Tell me what you want to automate\./i);
});

test('the served document keeps the Barrios message readable without JavaScript', () => {
  const fallback = markup.match(/<noscript>[\s\S]*?<\/noscript>/i)?.[0] ?? '';
  assert.match(fallback, /Barrios A2I/i);
  assert.match(fallback, /connected marketing automation built around your business/i);
  assert.match(fallback, /href="#no-js-automate"/i);
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

test('Book with NEXUS stays inside the compact footer and every opener controls the shared dialog', () => {
  const footerPosition = markup.indexOf('class="aura-footer"');
  const finalCtaPosition = markup.indexOf('class="aura-footer__cta');
  const bookingPosition = markup.indexOf('class="aura-footer__book"');
  assert.ok(footerPosition >= 0 && footerPosition < finalCtaPosition, 'the closing CTA must be inside the footer');
  assert.ok(finalCtaPosition < bookingPosition, 'Book with NEXUS must follow the footer CTA copy');
  assert.doesNotMatch(markup, /class="footer-booking|class="foot__top/i);

  const openers = openingTagsWith('data-nexus-open');
  assert.ok(openers.length >= 4, 'hero, launcher, Meet Gary, and footer controls must all open NEXUS');
  for (const opener of openers) {
    assert.equal(getAttribute(opener, 'aria-controls'), 'nexus-panel');
    assert.equal(getAttribute(opener, 'aria-expanded'), 'false');
  }
});
