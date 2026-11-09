import { ENGINE_VER } from '../../lib/engine';
import { ANCHOR_WINDOW_MS } from '../../lib/city-sync';

export type Anchor = { cityId: string; session: number; engine: number; revision: number; at: number; until: number };
const encode = (bytes: Uint8Array) => btoa(Array.from(bytes, n => String.fromCharCode(n)).join('')).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
const decode = (raw: string) => Uint8Array.from(atob(raw.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const key = (secret: string) => crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
export async function signAnchor(anchor: Anchor, secret: string) {
  const raw = encode(new TextEncoder().encode(JSON.stringify(anchor)));
  const sig = await crypto.subtle.sign('HMAC', await key(secret), new TextEncoder().encode('city-sync-v1:' + raw));
  return `${raw}.${encode(new Uint8Array(sig))}`;
}
export async function readAnchor(token: string, secret: string): Promise<Anchor | null> {
  try {
    if (token.length > 2048) return null;
    const [raw, sig, extra] = token.split('.'); if (!raw || !sig || extra !== undefined) return null;
    if (!await crypto.subtle.verify('HMAC', await key(secret), decode(sig), new TextEncoder().encode('city-sync-v1:' + raw))) return null;
    const a = JSON.parse(new TextDecoder().decode(decode(raw))) as Anchor;
    return typeof a.cityId === 'string' && Number.isSafeInteger(a.session) && a.session > 0 && a.engine === ENGINE_VER
      && Number.isSafeInteger(a.revision) && a.revision >= 0 && Number.isSafeInteger(a.at) && a.at >= 0
      && a.until === a.at + ANCHOR_WINDOW_MS ? a : null;
  } catch { return null; }
}
export async function digest(value: unknown) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)));
  return Array.from(new Uint8Array(hash), n => n.toString(16).padStart(2, '0')).join('');
}
