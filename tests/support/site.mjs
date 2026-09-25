// The single entry point a test file uses to get a URL for the homepage.
//
// The default run is UNCONDITIONALLY hermetic. It starts its own static server
// over public/ on an operating-system-assigned port and stops it again in an
// `after` hook, which node:test runs whether the tests passed or failed.
//
// HOMEPAGE_URL alone no longer changes that, and the reason is the whole point
// of this module. An inherited environment variable - left over in a shell, set
// by a CI job, exported by a wrapper script, remembered by a terminal from an
// hour ago - could silently redirect the ENTIRE suite at an external server.
// The run would then report on whatever that server was serving: a stale
// deployment, another commit, a production site, or nothing at all. Every
// assertion in the suite would be about someone else's bytes while reading
// exactly like a pass or a fail about this working tree. That is the "false
// green" class of failure, and an environment variable is not consent.
//
// So testing against an external site is now an explicit act. It requires
// SITE_TEST_EXTERNAL=1 *in addition to* HOMEPAGE_URL, and the supported way to
// set both is `npm run test:external` (see tests/support/run-external.mjs),
// which refuses to run without a URL and says what it is pointing at. Nothing
// is started in that mode.

import { after } from 'node:test';

import { startStaticServer } from './static-server.mjs';
import { PUBLIC_ROOT, headersForPath } from './next-headers.mjs';

export { PUBLIC_ROOT };

/** The opt-in flag. Set only by `npm run test:external` (or by hand, knowingly). */
export const EXTERNAL_OPT_IN = 'SITE_TEST_EXTERNAL';

/**
 * Decide, for a given environment, whether this run targets an external site.
 *
 * Pure and exported so the hermetic guarantee can be tested directly against
 * arbitrary environments, including one that carries an ambient HOMEPAGE_URL,
 * rather than inferred from a run that happens not to have one.
 *
 * @param {Record<string, string|undefined>} env
 * @returns {string|null} the external URL, or null for a hermetic run
 */
export function resolveExternalUrl(env = {}) {
  if (env[EXTERNAL_OPT_IN] !== '1') return null;
  const url = env.HOMEPAGE_URL;
  return url ? url : null;
}

/**
 * What an ambient HOMEPAGE_URL was, when one was present and ignored. Null on a
 * run that had none, and null when the external mode was opted into (there it
 * is not ambient - it is the target). Diagnostic only; nothing reads it to make
 * a decision.
 */
export const IGNORED_AMBIENT_HOMEPAGE_URL =
  process.env[EXTERNAL_OPT_IN] === '1' ? null : process.env.HOMEPAGE_URL || null;

export const EXTERNAL_HOMEPAGE_URL = resolveExternalUrl(process.env);

// Belt and braces: on a hermetic run the ambient value is not merely ignored
// here, it is cleared from the environment, so no other module, helper or
// child process started by the suite can pick it up either. The value stays
// available above for the test that asserts it was ignored.
if (!EXTERNAL_HOMEPAGE_URL && IGNORED_AMBIENT_HOMEPAGE_URL) {
  delete process.env.HOMEPAGE_URL;
}

/**
 * Register the hermetic server's lifecycle with the calling test file.
 *
 * The returned object carries `ready()`, which the file's own `before` hook must
 * await before reading `url`. Startup is deliberately *not* hung on a second
 * root-level `before`: node:test does not guarantee that an async hook
 * registered first finishes before a later one starts, so ordering two hooks
 * against each other silently yields a null URL. `ready()` is idempotent, so
 * every hook and test that awaits it sees the same server.
 *
 * @returns {{url: string|null, origin: string|null, external: boolean,
 *            ready: () => Promise<void>}}
 */
export function useStaticSite() {
  let handle = null;
  let starting = null;

  const site = {
    url: null,
    origin: null,
    external: false,
    ready() {
      starting ??= (async () => {
        if (EXTERNAL_HOMEPAGE_URL) {
          site.url = EXTERNAL_HOMEPAGE_URL;
          site.origin = new URL(EXTERNAL_HOMEPAGE_URL).origin;
          site.external = true;
          return;
        }
        handle = await startStaticServer({ root: PUBLIC_ROOT, headersFor: headersForPath });
        site.url = handle.url;
        site.origin = handle.origin;
      })();
      return starting;
    }
  };

  // node:test runs `after` whether the tests passed or failed, so the listener
  // is always released. startStaticServer also unrefs it, so even a hard exit
  // that skips this hook cannot leave a port held.
  after(async () => {
    if (!handle) return;
    const closing = handle;
    handle = null;
    await closing.stop();
  });

  return site;
}
