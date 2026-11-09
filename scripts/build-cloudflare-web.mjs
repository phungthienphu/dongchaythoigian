import { copyFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const origin = new URL(process.argv[2] ?? 'https://dong-song-game-staging.phungthienphu.workers.dev');
if (origin.protocol !== 'https:' || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/') throw new Error('Expected an HTTPS origin');
for (const asset of ['favicon.ico', 'icon.svg', 'apple-icon.png', 'opengraph-image.png', 'opengraph-image.alt.txt']) {
  copyFileSync(new URL(`../app/${asset}`, import.meta.url), new URL(`../cloudflare/web/app/${asset}`, import.meta.url));
}
// Webpack supports importing the existing source outside the static app root.
// Only Next's public font fetches run here; no dotenv file is loaded by this app.
const result = spawnSync(process.execPath, ['node_modules/next/dist/bin/next', 'build', 'cloudflare/web', '--webpack'], {
  cwd: root, stdio: 'inherit', env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1', WEB_ORIGIN: origin.origin },
});
process.exitCode = result.status ?? 1;
