import { MongoClient, type Collection } from "mongodb";
import type { City } from "./engine";

export type CityDoc = {
  _id: string; // player id from the `pid` cookie
  name: string;
  owner?: string; // Google user id once the player has signed in
  world?: { x: number; y: number }; // position on the world map
  actionReceipts?: { id: string; result: unknown }[];
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
};

const g = globalThis as unknown as { _mongo?: Promise<MongoClient> };
const dbName = () => process.env.MONGODB_DB || "dong_song_thoi_dai";

export async function mongoClient() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("Thiếu MONGODB_URI trong .env.local");
  g._mongo ??= new MongoClient(uri).connect().then(async (client) => {
    const d = client.db(dbName());
    await d.collection("cities").createIndex({ score: -1 });
    await d.collection("users").createIndex({ friendCode: 1 }, { unique: true });
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
  const col = (await db()).collection<import("./war").BattleDoc>("battles");
  await col.createIndex({ attackerId: 1, createdAt: -1 });
  await col.createIndex({ defenderId: 1, createdAt: -1 });
  return col;
}
