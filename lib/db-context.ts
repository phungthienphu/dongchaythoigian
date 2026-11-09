import { AsyncLocalStorage } from 'node:async_hooks';
import type { MongoClient } from 'mongodb';

// Workers sockets belong to one request. Never cache a client across requests.
// Next's Node runtime continues to use its existing connection pool.
const scope = new AsyncLocalStorage<{ client: MongoClient; database: string }>();
export const requestDatabase = () => scope.getStore();
export function withRequestDatabase<T>(client: MongoClient, database: string, run: () => Promise<T>) {
  return scope.run({ client, database }, run);
}
