// Reads the real header rules out of next.config.js.
//
// The suite asserts against the shipped configuration rather than a copy of it,
// and the hermetic static server replays those headers, so a page is served
// locally with exactly the Content-Security-Policy production sends. A copy
// would drift; this cannot.

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

export const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const PUBLIC_ROOT = fileURLToPath(new URL('../../public/', import.meta.url));

export function nextConfig() {
  return require('../../next.config.js');
}

/**
 * Compile a Next.js `source` pattern into a matcher.
 *
 * Only the shapes this repository actually uses are supported: literal paths and
 * a single trailing `:name(regex)` segment (the existing CORS carve-out uses
 * `/api/:path((?!nexus/).*)`). Anything else throws rather than matching by
 * accident, so an unrecognised pattern fails loudly in a test instead of
 * silently reporting "no headers".
 */
function compileSource(source) {
  const named = source.match(/^(.*?)\/:([A-Za-z_][A-Za-z0-9_]*)\((.*)\)$/s);
  if (named) {
    const [, prefix, , pattern] = named;
    return new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/(?:${pattern})$`);
  }
  if (/[:(*?+\[\]]/.test(source)) {
    throw new Error(`unsupported Next.js header source pattern: ${source}`);
  }
  return new RegExp(`^${source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
}

/**
 * Every header rule from next.config.js that matches `pathname`, in order.
 * @returns {Promise<Array<{source: string, headers: Array<{key: string, value: string}>}>>}
 */
export async function matchingHeaderRules(pathname) {
  const config = nextConfig();
  const rules = await config.headers();
  return rules.filter((rule) => compileSource(rule.source).test(pathname));
}

/**
 * The effective response headers for `pathname` as a plain object.
 *
 * Next.js applies every matching rule, so a later rule's value for the same key
 * wins. The CSP rules in next.config.js are written with mutually exclusive
 * sources precisely so this never has to arbitrate between two policies.
 */
export async function headersForPath(pathname) {
  const out = {};
  for (const rule of await matchingHeaderRules(pathname)) {
    for (const { key, value } of rule.headers) out[key.toLowerCase()] = value;
  }
  return out;
}
