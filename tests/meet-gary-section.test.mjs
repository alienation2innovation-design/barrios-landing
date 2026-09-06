import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { before, test } from 'node:test';

const homepageUrl = process.env.HOMEPAGE_URL ?? 'http://127.0.0.1:4173/';
const originalHomepageHash = '5DA7234C3E40556FC08EC2459408EB32E4DA4D006FAB817D52852797F5DE46F1';
const originalHeaderHash = '36FF16482263F806E93AAA09D5D0252CC4DDBBFD3310D6AE4AF697949DFB7137';
const originalFooterHash = '1C887B176B07257E984FE37D17FEBA38A6DD34D4CDB395E75E61CA78ED023AE4';
const oldInstagramUrl = 'https://www.instagram.com/barrios.ai.gary/';
const newInstagramUrl = 'https://www.instagram.com/barriosa2i/';

let response;
let html;
let section;
let stylesheetResponse;
let stylesheet;
let scriptResponse;
let script;

function sha256(value) {
  return createHash('sha256').update(value.replace(/\r\n/g, '\n')).digest('hex').toUpperCase();
}

function getAttribute(tag, name) {
  const match = tag.match(new RegExp(`\\s${name}=(?:"([^"]*)"|'([^']*)')`, 'i'));
  return match?.[1] ?? match?.[2] ?? null;
}

function normalizeApprovedAdditions(documentText) {
  return documentText
    .replace(/\n    <!-- meet-gary:styles:start -->[\s\S]*?<!-- meet-gary:styles:end -->\n/, '\n')
    .replace(/\n      <!-- meet-gary:section:start -->[\s\S]*?<!-- meet-gary:section:end -->\n/, '')
    .replace(/\n    <!-- meet-gary:script:start -->[\s\S]*?<!-- meet-gary:script:end -->\n/, '\n')
    .replaceAll(newInstagramUrl, oldInstagramUrl);
}

before(async () => {
  response = await fetch(homepageUrl, { redirect: 'manual' });
  html = await response.text();
  section = html.match(/<!-- meet-gary:section:start -->([\s\S]*?)<!-- meet-gary:section:end -->/)?.[1] ?? '';

  [stylesheetResponse, scriptResponse] = await Promise.all([
    fetch(new URL('/meet-gary.css', homepageUrl)),
    fetch(new URL('/js/meet-gary.js', homepageUrl))
  ]);
  [stylesheet, script] = await Promise.all([
    stylesheetResponse.text(),
    scriptResponse.text()
  ]);
});

test('Meet Gary is a static section placed before the existing FAQ', () => {
  assert.equal(response.status, 200);
  const voicesPosition = html.indexOf('id="voices"');
  const meetPosition = html.indexOf('id="meet-gary"');
  const faqPosition = html.indexOf('id="faq"');
  const socialPosition = html.indexOf('class="social-signal"');

  assert.ok(voicesPosition >= 0 && voicesPosition < meetPosition, 'Meet Gary must follow the existing proof section');
  assert.ok(meetPosition < faqPosition, 'Meet Gary must precede the existing FAQ');
  assert.ok(faqPosition < socialPosition, 'FAQ and social signal order must stay intact');
  assert.equal((html.match(/id="meet-gary"/g) ?? []).length, 1);
  assert.match(section, /<section\b[^>]*id="meet-gary"[^>]*aria-labelledby="meet-gary-title"/i);
  assert.match(section, /<h2\b[^>]*id="meet-gary-title"[^>]*>\s*I build what doesn’t exist yet\./i);
  assert.match(section, /id="about"/i, 'existing /#about links must resolve to the new section');
});

test('the approved portrait, identity, builds, and brand language are present without fake metrics', () => {
  const portrait = section.match(/<img\b[^>]*class="meet-gary__portrait-image"[^>]*>/i)?.[0] ?? '';
  const animatedLogo = section.match(/<a\b[^>]*class="brand-signal-link meet-gary__logo-link"[^>]*>[\s\S]*?<span\b[^>]*class="brand-signal-art meet-gary__logo-art"/i)?.[0] ?? '';
  assert.equal(getAttribute(portrait, 'src'), '/assets/images/gary-barrios-founder.jpg');
  assert.equal(getAttribute(portrait, 'alt'), 'Gary Barrios, founder of Barrios A2I');
  assert.equal(getAttribute(portrait, 'width'), '736');
  assert.equal(getAttribute(portrait, 'height'), '739');
  assert.equal(getAttribute(portrait, 'loading'), 'lazy');
  assert.equal(getAttribute(portrait, 'decoding'), 'async');
  assert.ok(animatedLogo, 'the section logo must reuse the landing page hover/focus animation classes');

  assert.match(section, /Gary J\. Barrios · Founder, Barrios A2I/i);
  assert.match(section, /Realm Architect/i);
  assert.match(section, /Nexus Engine/i);
  assert.match(section, /Chromadon/i);
  assert.match(section, /Industrial experience · Applied software · Human-centered automation/i);
  assert.doesNotMatch(section, /clients served|projects completed|followers|revenue/i);
});

test('the Meet Gary presentation is local, lightweight, responsive, and motion-safe', async () => {
  assert.equal(stylesheetResponse.status, 200);
  assert.match(stylesheetResponse.headers.get('content-type') ?? '', /text\/css/i);
  assert.equal(scriptResponse.status, 200);
  assert.match(scriptResponse.headers.get('content-type') ?? '', /(?:java|ecma)script/i);
  assert.ok(Buffer.byteLength(stylesheet, 'utf8') < 24 * 1024, 'the scoped section stylesheet must stay compact');
  assert.match(stylesheet, /@media\s*\(max-width:\s*980px\)/i);
  assert.match(stylesheet, /@media\s*\(prefers-reduced-motion:\s*reduce\)/i);
  assert.match(stylesheet, /scroll-margin-top/i);
  assert.doesNotMatch(`${section}\n${stylesheet}\n${script}`, /unsplash|supabase|cdn\.tailwindcss\.com|<video|webgl/i);

  const portraitResponse = await fetch(new URL('/assets/images/gary-barrios-founder.jpg', homepageUrl));
  assert.equal(portraitResponse.status, 200);
  assert.match(portraitResponse.headers.get('content-type') ?? '', /image\/jpeg/i);
});

test('Book with Nexus opens the shared assistant in scheduling mode without stealing footer booking', () => {
  const button = section.match(/<button\b[^>]*data-nexus-schedule[^>]*>/i)?.[0] ?? '';
  assert.equal(getAttribute(button, 'type'), 'button');
  assert.equal(getAttribute(button, 'aria-controls'), 'nexus-panel');
  assert.equal(getAttribute(button, 'aria-expanded'), 'false');
  assert.notEqual(getAttribute(button, 'data-nexus-open'), null);
  assert.equal(getAttribute(button, 'data-nexus-book'), null);
  assert.equal((html.match(/data-nexus-book=/g) ?? []).length, 1, 'the footer remains the sole data-nexus-book control');
  assert.match(script, /querySelectorAll\('\[data-nexus-schedule\]'\)/);
  assert.match(script, /SCHEDULING PREVIEW/);
  assert.doesNotMatch(script, /fetch\s*\(|XMLHttpRequest|WebSocket/i);
});

test('the Meet Gary links use the approved profiles and the new Instagram replaces the old account everywhere', () => {
  const expectedLinks = [
    'https://www.linkedin.com/in/gary-barrios-3953b2390/',
    'https://github.com/alienation2innovation-design',
    'https://www.reddit.com/user/BarriosA2I/'
  ];
  const anchors = [...section.matchAll(/<a\b[^>]*>/gi)].map((match) => match[0]);

  for (const url of expectedLinks) {
    const anchor = anchors.find((tag) => getAttribute(tag, 'href') === url) ?? '';
    assert.ok(anchor, `${url} must be available in Meet Gary`);
    assert.equal(getAttribute(anchor, 'target'), '_blank');
    assert.equal(getAttribute(anchor, 'rel'), 'noopener noreferrer');
    assert.ok(getAttribute(anchor, 'aria-label'));
  }

  assert.match(html, new RegExp(newInstagramUrl.replaceAll('.', '\\.'), 'g'));
  assert.doesNotMatch(html, new RegExp(oldInstagramUrl.replaceAll('.', '\\.')));
  assert.doesNotMatch(section, /facebook/i);
});

test('the approved addition leaves the original landing page byte-identical apart from its scoped blocks and Instagram URL', () => {
  const header = html.match(/<header id="nav">[\s\S]*?<\/header>/)?.[0] ?? '';
  const footer = html.match(/<footer id="foot">[\s\S]*?<\/footer>/)?.[0] ?? '';
  const normalizedFooter = footer.replaceAll(newInstagramUrl, oldInstagramUrl);

  assert.equal(sha256(header), originalHeaderHash, 'the existing header must remain byte-identical');
  assert.equal(sha256(normalizedFooter), originalFooterHash, 'the footer may change only its approved Instagram URL');
  assert.equal(sha256(normalizeApprovedAdditions(html)), originalHomepageHash, 'no unrelated landing-page source may change');
});
