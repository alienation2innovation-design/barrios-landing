// The single entry point a test file uses to get a URL for the homepage.
//
// By default the run is hermetic: it starts its own static server over public/
// on an operating-system-assigned port and stops it again in an `after` hook,
// which node:test runs whether the tests passed or failed. Set HOMEPAGE_URL to
// point a run at an external server instead; nothing is started in that case.

import { after } from 'node:test';

import { startStaticServer } from './static-server.mjs';
import { PUBLIC_ROOT, headersForPath } from './next-headers.mjs';

export { PUBLIC_ROOT };

export const EXTERNAL_HOMEPAGE_URL = process.env.HOMEPAGE_URL || null;

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
