import { MongoClient, type Collection } from "mongodb";
import type { City } from "./engine";

export type CityDoc = {
  _id: string; // player id from the `pid` cookie
  name: string;
  state: City;
  score: number;
  era: number;
  pop: number;
  templeAt: number | null;
  ver: number;
  createdAt: Date;
  updatedAt: Date;
};

const g = globalThis as unknown as { _mongo?: Promise<MongoClient> };

export async function cities(): Promise<Collection<CityDoc>> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("Thiếu MONGODB_URI trong .env.local");
  g._mongo ??= new MongoClient(uri).connect().then(async (client) => {
    await client.db(process.env.MONGODB_DB || "dong_song_thoi_dai").collection("cities").createIndex({ score: -1 });
    return client;
  });
  const client = await g._mongo;
  return client.db(process.env.MONGODB_DB || "dong_song_thoi_dai").collection<CityDoc>("cities");
}
