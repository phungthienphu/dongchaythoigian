import { spawn } from 'node:child_process';

// Wrangler events include full request URLs, including OAuth callback codes.
// Filter in memory, never print/persist whole events or console arguments.
const child = spawn('worker/node_modules/.bin/wrangler', ['tail', '--config', 'cloudflare/wrangler.staging.jsonc', '--format', 'json'], {
  stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, WRANGLER_LOG: 'none', WRANGLER_LOG_PATH: '/dev/null' },
});
let json = '', depth = 0, inString = false, escape = false;
const allowed = new Set(['success', 'state', 'token', 'profile', 'session', 'account', 'invalid_grant', 'invalid_client', 'redirect_uri_mismatch', 'invalid_request', 'unsupported_grant_type', 'unknown', 'Error', 'TypeError', 'MongoServerError', 'MongoServerSelectionError']);
function event(value) {
  if (!Array.isArray(value.logs)) return;
  for (const row of value.logs) {
    const parts = row.message;
    if (!Array.isArray(parts) || !['cloudflare_oauth_result', 'cloudflare_oauth_diagnostic'].includes(parts[0])) continue;
    console.log(JSON.stringify({ event: parts[0], values: parts.slice(1).map(part => allowed.has(part) ? part : 'other') }));
  }
}
child.stdout.on('data', chunk => {
  for (const char of chunk.toString()) {
    if (!depth && char !== '{') continue;
    json += char;
    if (inString) { if (escape) escape = false; else if (char === '\\') escape = true; else if (char === '"') inString = false; }
    else if (char === '"') inString = true;
    else if (char === '{') depth++;
    else if (char === '}' && --depth === 0) {
      try { event(JSON.parse(json)); } catch { /* Ignore non-event CLI text. */ }
      json = '';
    }
    if (json.length > 1_000_000) { json = ''; depth = 0; inString = false; escape = false; }
  }
});
child.stderr.on('data', () => {});
child.on('exit', code => { console.log(`Filtered auth tail ended (${code}).`); });
process.on('SIGINT', () => child.kill('SIGTERM'));
setTimeout(() => child.kill('SIGTERM'), 180_000);
console.log('Listening for allowlisted OAuth phase/result only (3 minute limit).');
