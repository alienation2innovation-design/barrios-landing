import assert from 'node:assert/strict';
import { before, test } from 'node:test';

const homepageUrl = process.env.HOMEPAGE_URL ?? 'http://127.0.0.1:4173/';

let html;
let footer;
let stylesheetResponse;
let stylesheet;

function getAttribute(tag, name) {
  const match = tag.match(new RegExp(`\\s${name}=(?:"([^"]*)"|'([^']*)')`, 'i'));
  return match?.[1] ?? match?.[2] ?? null;
}

before(async () => {
  const response = await fetch(homepageUrl, { redirect: 'manual' });
  assert.equal(response.status, 200);
  html = await response.text();
  footer = html.match(/<footer\b[^>]*id="foot"[^>]*>[\s\S]*?<\/footer>/i)?.[0] ?? '';
  stylesheetResponse = await fetch(new URL('/aura-footer.css', homepageUrl));
  stylesheet = await stylesheetResponse.text();
});

test('the Aura closing experience replaces the old social strip, CTA, and oversized footer', () => {
  assert.equal((html.match(/<footer\b[^>]*id="foot"/gi) ?? []).length, 1);
  assert.ok(html.indexOf('id="faq"') < html.indexOf('id="foot"'));
  assert.match(footer, /id="cta"/i, 'existing #cta links must land on the new footer CTA');
  assert.match(footer.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '), /Ready to automate the work slowing your business down\?/i);
  assert.match(footer, /Tell us what should happen\. Barrios A2I will map the workflow/i);
  assert.doesNotMatch(html, /class="social-signal/i);
  assert.doesNotMatch(html, /class="foot__(?:giant|top|col|brand|bar)/i);
  assert.doesNotMatch(html, /txt\('\.foot__|querySelector\('\.foot__/i);
});

test('Book with NEXUS remains the single footer booking control', () => {
  const button = footer.match(/<button\b[^>]*data-nexus-book[^>]*>/i)?.[0] ?? '';
  assert.equal(getAttribute(button, 'type'), 'button');
  assert.equal(getAttribute(button, 'aria-controls'), 'nexus-panel');
  assert.equal(getAttribute(button, 'aria-expanded'), 'false');
  assert.notEqual(getAttribute(button, 'data-nexus-open'), null);
  assert.equal((html.match(/data-nexus-book=/g) ?? []).length, 1);
  assert.match(footer, />\s*Book with NEXUS\s*</i);
});

test('the footer contains only approved contact, navigation, and social destinations', () => {
  const approvedSocials = [
    'https://www.linkedin.com/in/gary-barrios-3953b2390/',
    'https://github.com/alienation2innovation-design',
    'https://x.com/BarriosA2I',
    'https://www.instagram.com/barriosa2i/',
    'https://www.tiktok.com/@garyjbarrios',
    'https://www.reddit.com/user/BarriosA2I/'
  ];
  const anchors = [...footer.matchAll(/<a\b[^>]*>/gi)].map((match) => match[0]);

  for (const url of approvedSocials) {
    const matches = anchors.filter((tag) => getAttribute(tag, 'href') === url);
    assert.equal(matches.length, 1, `${url} must appear once in the new footer`);
    assert.equal(getAttribute(matches[0], 'target'), '_blank');
    assert.equal(getAttribute(matches[0], 'rel'), 'noopener noreferrer');
    assert.ok(getAttribute(matches[0], 'aria-label'));
  }

  for (const href of ['#kit', '#how', '#gallery', '#meet-gary', '#faq', '/privacy-directive.html', '/terms-of-service.html']) {
    assert.ok(anchors.some((tag) => getAttribute(tag, 'href') === href), `${href} must be in footer navigation`);
  }

  assert.match(footer, /href="mailto:alienation2innovation@gmail\.com"/i);
  assert.doesNotMatch(footer, /href="tel:|facebook|NeuralFlow|555\)/i);
  assert.match(footer, /© 2026 Barrios A2I\. Custom marketing automation built around your business\./i);
});

test('the footer uses the approved local brand asset and responsive lightweight CSS', () => {
  assert.match(footer, /<img\b[^>]*src="\/brand\/barrios-a2i-logo\.png"[^>]*alt="Barrios A2I"/i);
  assert.match(html, /<link\b[^>]*href="\/aura-footer\.css"/i);
  assert.equal(stylesheetResponse.status, 200);
  assert.match(stylesheetResponse.headers.get('content-type') ?? '', /text\/css/i);
  assert.ok(Buffer.byteLength(stylesheet, 'utf8') < 20 * 1024);
  assert.match(stylesheet, /@media\s*\(max-width:\s*699px\)/i);
  const mobileRules = stylesheet.match(/@media\s*\(max-width:\s*699px\)\s*\{([\s\S]*?)\n\}/i)?.[1] ?? '';
  assert.match(mobileRules, /\.aura-footer__title\s*\{[^}]*width:\s*100%[^}]*text-align:\s*center/i);
  assert.match(stylesheet, /@media\s*\(prefers-reduced-motion:\s*reduce\)/i);
  assert.doesNotMatch(stylesheet, /min-height\s*:\s*100(?:vh|svh|dvh)/i);
});
