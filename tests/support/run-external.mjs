// `npm run test:external` — run the suite against an external server.
//
// This is the ONLY supported way to point the suite somewhere other than the
// server it starts for itself, and it exists so that doing so is a decision
// somebody made rather than an environment variable somebody forgot. It sets
// SITE_TEST_EXTERNAL=1, which tests/support/site.mjs requires in addition to
// HOMEPAGE_URL, and it refuses to start without a URL rather than silently
// falling back to a hermetic run under an external-sounding name.
//
// A wrapper rather than an inline environment assignment in package.json: npm
// runs scripts through cmd.exe on Windows, where `VAR=value cmd` is not a
// thing, and adding a cross-platform env package would mean a new dependency.
//
// It is not itself a test file (tests/*.test.mjs is the suite's glob), so
// `npm test` never runs it.

import { spawn } from 'node:child_process';

const url = process.env.HOMEPAGE_URL;
if (!url) {
  console.error(
    'test:external needs HOMEPAGE_URL.\n' +
      '  PowerShell: $env:HOMEPAGE_URL = "https://example.test/"; npm run test:external\n' +
      '  bash:       HOMEPAGE_URL=https://example.test/ npm run test:external\n' +
      'Without it, use `npm test`, which is hermetic and starts its own server.'
  );
  process.exit(2);
}

try {
  // eslint-disable-next-line no-new
  new URL(url);
} catch {
  console.error(`test:external: HOMEPAGE_URL is not a URL: ${url}`);
  process.exit(2);
}

console.log(`test:external: running the suite against ${url} (no server will be started)`);

const child = spawn(
  process.execPath,
  ['--test', 'tests/*.test.mjs', 'tests/*.test.js'],
  {
    stdio: 'inherit',
    env: { ...process.env, SITE_TEST_EXTERNAL: '1' }
  }
);

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
