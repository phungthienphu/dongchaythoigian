import { MongoClient, type Collection } from "mongodb";
import type { City } from "./engine";
import type { OnlineCommandBucket } from "./command-metrics";
import { requestDatabase } from './db-context';

export type CityDoc = {
  _id: string; // player id from the `pid` cookie
  name: string;
  owner?: string; // Google user id once the player has signed in
  world?: { x: number; y: number }; // position on the world map
  envoyOutbox?: { key: string; trip: Pick<import("./engine").EnvoyTrip, "id" | "depart" | "target" | "targetName" | "arrive"> }[];
  actionReceipts?: { id: string; result: unknown }[];
  citySync?: import('./city-sync').SyncLedger;
  incomingBattleId?: string;
  outboundBattleId?: string;
  state: City;
  score: number;
  era: number;
  pop: number;
  templeAt: number | null;
  ver: number;
  createdAt: Date;
  updatedAt: Date;
};

export type UserDoc = {
  _id: string; // Google account id ("sub")
  email: string;
  name: string;
  picture?: string;
  cityId: string | null;
  friendCode: string;
  friends: string[]; // user ids
  createdAt: Date;
  lastSeen: Date;
  sessionVersion?: number; // Incremented on sign-in/logout; only the latest session may play.
  sessionRevokedFrom?: number; // Allows retrying a failed Worker logout without revoking a newer login.
};

const g = globalThis as unknown as { _mongo?: Promise<MongoClient> };
const dbName = () => requestDatabase()?.database ?? (process.env.MONGODB_DB || "dong_song_thoi_dai");

export async function mongoClient() {
  const scoped = requestDatabase();
  if (scoped) return scoped.client;
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("Thiếu MONGODB_URI trong .env.local");
  g._mongo ??= new MongoClient(uri).connect().then(async (client) => {
    const d = client.db(dbName());
    await d.collection("market_orders").createIndex({status:1,createdAt:-1});
    await d.collection("market_orders").createIndex({seller:1,status:1});
    await d.collection("caravans").createIndex({status:1,arrive:1});
    await d.collection("caravans").createIndex({status:1,reconciledAt:1,createdAt:1});
    await d.collection("caravans").createIndex({seller:1,createdAt:-1});
    await d.collection("caravans").createIndex({buyer:1,createdAt:-1});
    await d.collection("caravans").createIndex({"raid.by":1,createdAt:-1});
    await d.collection("caravans").createIndex({status:1,nextCheckAt:1});
    await d.collection("battles").createIndex({ attackerId: 1, createdAt: -1 });
    await d.collection("battles").createIndex({ defenderId: 1, createdAt: -1 });
    await d.collection("battles").createIndex({ status: 1, updatedRecoveryAt: 1, createdAt: 1 });
    await d.collection("cities").createIndex({ score: -1 });
    await d.collection("envoy_visits").createIndex({ to: 1, arrive: -1 });
    await d.collection("envoy_visits").createIndex({ from: 1, eventAt: -1 });
    await d.collection("envoy_visits").createIndex({ to: 1, eventAt: -1 });
    await d.collection("envoy_visits").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    await d.collection("users").createIndex({ friendCode: 1 }, { unique: true });
    // Optional analytics must not prevent loading a village if index setup fails.
    await Promise.all([
      d.collection("online_command_stats").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      d.collection("online_command_stats").createIndex({ bucket: -1, cityId: 1 }),
    ]).catch(() => console.warn('online_command_metrics_index_failed'));
    return client;
  });
  return await g._mongo;
}

async function db() { return (await mongoClient()).db(dbName()); }

export async function cities(): Promise<Collection<CityDoc>> {
  return (await db()).collection<CityDoc>("cities");
}

export async function users(): Promise<Collection<UserDoc>> {
  return (await db()).collection<UserDoc>("users");
}

export async function battles() {
  return (await db()).collection<import("./war").BattleDoc>("battles");
}

export async function envoyVisits() {
  return (await db()).collection<import("./diplomacy-types").EnvoyVisit>("envoy_visits");
}

export async function marketOrders(){return (await db()).collection<import('./market-types').MarketOrder>('market_orders');}
export async function caravans(){return (await db()).collection<import('./market-types').Caravan>('caravans');}
export async function onlineCommandStats(){return (await db()).collection<OnlineCommandBucket>('online_command_stats');}
