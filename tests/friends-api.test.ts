// Isolated mocked MongoDB: never reads configured credentials or live accounts.
// @ts-expect-error Bun runtime API
import { mock, test, expect } from 'bun:test';
const accounts = [
  { _id: 'me', name: 'Me', friends: [] as string[], cityId: 'home', friendCode: 'ABCDEF', email: 'private-me' },
  { _id: 'other', name: 'Lan', friends: [] as string[], cityId: 'secret-city', friendCode: 'XYZABC', email: 'private-other' },
];
const cityDocs = [{ _id: 'secret-city', name: 'Hoa Lu', era: 2, owner: 'other', world: { x: 91, y: 87 }, state: { discoveries: ['hidden'] } }];
let authenticated = true, writes = 0;
function matches(doc: any, query: any): boolean {
  return Object.entries(query).every(([key, value]: [string, any]) => {
    if (key === '$or') return value.some((part: any) => matches(doc, part));
    if (value && typeof value === 'object') {
      if ('$ne' in value) return doc[key] !== value.$ne;
      if ('$in' in value) return value.$in.includes(doc[key]);
      if ('$exists' in value) return (doc[key] !== undefined) === value.$exists;
      if ('$regex' in value) return new RegExp(value.$regex, value.$options).test(doc[key]);
    }
    return doc[key] === value;
  });
}
function collection(docs: any[]) {
  return {
    find(query: any) { let limit = Infinity; const cursor = { sort: () => cursor, limit: (n: number) => { limit = n; return cursor; }, toArray: async () => docs.filter(d => matches(d, query)).slice(0, limit) }; return cursor; },
    findOne: async (query: any) => docs.find(d => matches(d, query)) ?? null,
    updateOne: async (query: any, update: any) => {
      writes++; const doc = docs.find(d => matches(d, query));
      if (doc && update.$addToSet && !doc.friends.includes(update.$addToSet.friends)) doc.friends.push(update.$addToSet.friends);
      return { modifiedCount: 1 };
    },
  };
}
mock.module('../lib/db', () => ({ users: async () => collection(accounts), cities: async () => collection(cityDocs), mongoClient: async () => ({ startSession: () => ({ withTransaction: async (fn: () => Promise<void>) => fn(), endSession: async () => {} }) }) }));
mock.module('../lib/auth', () => ({ currentUser: async () => authenticated ? accounts[0] : null }));
const { GET, POST } = await import('../app/api/friends/route');
const search = (q: string) => GET(new Request(`http://localhost/api/friends?q=${encodeURIComponent(q)}`));
const add = (body: unknown) => POST(new Request('http://localhost/api/friends', { method: 'POST', body: JSON.stringify(body) }));
test('authentication and query bounds; search escapes regex metacharacters', async () => {
  authenticated = false; expect((await search('Lan')).status).toBe(401); expect((await add({ id: 'other' })).status).toBe(401); authenticated = true;
  expect((await search('a')).status).toBe(400); expect((await search('a'.repeat(61))).status).toBe(400);
  expect((await (await search('.*')).json()).players).toEqual([]);
});
test('search matches player, city and code, exposes only explicit public fields', async () => {
  for (const query of ['Lan', 'Hoa Lu', 'xyzabc']) {
    const body = await (await search(query)).json();
    expect(body.players).toEqual([{ id: 'other', name: 'Lan', friend: false, city: { name: 'Hoa Lu', era: 2 } }]);
    expect(JSON.stringify(body)).not.toContain('private'); expect(JSON.stringify(body)).not.toContain('world'); expect(JSON.stringify(body)).not.toContain('secret-city');
  }
});
test('search and map targets establish mutual friendship idempotently', async () => {
  expect((await add({ cityId: 'secret-city' })).status).toBe(200);
  expect(accounts[0].friends).toEqual(['other']); expect(accounts[1].friends).toEqual(['me']);
  const prior = writes; expect((await add({ id: 'other' })).status).toBe(200); expect(writes).toBe(prior);
  expect((await (await search('Lan')).json()).players[0].friend).toBe(true);
});
test('reject self, unknown, malformed and either full friend list before writing', async () => {
  expect((await add({ id: 'me' })).status).toBe(400); expect((await add(null)).status).toBe(400); expect((await add({ id: 'missing' })).status).toBe(404);
  accounts[0].friends = []; accounts[1].friends = Array.from({ length: 100 }, (_, i) => `u${i}`);
  const prior = writes; expect((await add({ id: 'other' })).status).toBe(409); expect(writes).toBe(prior); expect(accounts[0].friends).toEqual([]);
  accounts[1].friends = []; accounts[0].friends = Array.from({ length: 100 }, (_, i) => `u${i}`);
  expect((await add({ code: 'XYZABC' })).status).toBe(409); expect(writes).toBe(prior);
});
