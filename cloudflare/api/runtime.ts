/** Small platform contracts, independent of the combat/prototype namespaces. */
export interface VillageContext {
  blockConcurrencyWhile<T>(run: () => Promise<T>): Promise<T>;
  storage: {
    sql: { exec<T = Record<string, unknown>>(query: string, ...args: (string | number | null)[]): { toArray(): T[] } };
    transactionSync<T>(run: () => T): T;
  };
}
export interface VillageNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(request: Request): Promise<Response> };
}
export interface VillageEnv {
  VILLAGES: VillageNamespace;
  VILLAGE_ENABLED?: string;
  VILLAGE_EPOCH?: string;
  AUTH_SECRET?: string;
}
export type VillageRegistration = { id: string; owner: string; epoch: string; name: string; createdAt: number };
export const QA_EPOCH = 'cloudflare-qa-v1';
export const json = (body: unknown, status = 200, extra: Record<string, string> = {}) => Response.json(body, {
  status, headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...extra },
});
export class InputError extends Error {
  constructor(message: string, readonly status = 409, readonly code?: string) { super(message); }
}
export async function boundedJSON(request: Request, max: number): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new InputError('Thiếu nội dung yêu cầu.', 400);
  const chunks: Uint8Array[] = []; let length = 0;
  while (true) {
    const { value, done } = await reader.read(); if (done) break;
    length += value.byteLength;
    if (length > max) { await reader.cancel(); throw new InputError('Yêu cầu quá lớn.', 413); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new InputError('Nội dung JSON không hợp lệ.', 400); }
}

/** Construct a new internal request: public headers never become authority. */
export function villageRequest(env: VillageEnv, registration: VillageRegistration, session: number, op: string, body?: unknown) {
  if (env.VILLAGE_ENABLED !== 'true' || env.VILLAGE_EPOCH !== QA_EPOCH || registration.epoch !== env.VILLAGE_EPOCH)
    throw new InputError('Backend làng chưa được kích hoạt.', 503);
  return env.VILLAGES.get(env.VILLAGES.idFromName(registration.id)).fetch(new Request(`https://village.internal/${op}`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-village-id': registration.id,
      'x-village-owner': registration.owner, 'x-village-epoch': registration.epoch, 'x-village-session': String(session) },
    body: JSON.stringify(body ?? {}),
  }));
}
