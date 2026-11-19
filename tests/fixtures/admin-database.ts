// In-memory Mongo contract for isolated admin tests. Never connects to a real database.
import type { Document, MongoClient } from "mongodb";
const date = new Date("2026-11-19T08:00:00Z");
export function adminDatabase() {
  let tables: Record<string, Document[]> = {
    users: [
      {
        _id: "admin-id",
        name: "Quản trị viên",
        email: "admin@example.test",
        cityId: null,
        sessionVersion: 1,
        createdAt: date,
        lastSeen: date,
      },
      ...Array.from({ length: 28 }, (_, i) => ({
        _id: `player-${i}`,
        name: `Người chơi ${i}`,
        email: `player${i}@example.test`,
        cityId: `city-${i}`,
        createdAt: date,
        lastSeen: date,
        sessionVersion: 7,
        friends: [],
        friendCode: "PRIVATE",
      })),
    ],
    cities: Array.from({ length: 28 }, (_, i) => ({
      _id: `city-${i}`,
      name: i === 0 ? "Làng Ven Sông" : `Làng ${i}`,
      owner: `player-${i}`,
      era: i % 5,
      pop: 30 + i,
      score: 1000 + i,
      ver: 10,
      updatedAt: date,
      state: { private: "PRIVATE_STATE" },
      citySync: { private: "PRIVATE_SYNC" },
    })),
    battles: [
      {
        _id: "battle-1",
        attackerName: "Làng Mặt Trời",
        defenderName: "Làng Ven Sông",
        status: "fighting",
        createdAt: date,
        arrive: date.getTime(),
        snapshot: "PRIVATE_BATTLE",
      },
    ],
    market_orders: [
      {
        _id: "order-1",
        sellerName: "Làng Ven Sông",
        seller: "city-0",
        resource: "wood",
        amount: 120,
        currency: "gold",
        price: 20,
        status: "open",
        createdAt: date.getTime(),
      },
    ],
    caravans: [{ _id: "caravan-1", status: "travelling" }],
    admin_audit: [],
  };
  let failAudit = false;
  const matches = (doc: Document, filter: Document): boolean =>
    Object.entries(filter).every(([key, condition]) => {
      if (key === "$or")
        return (condition as Document[]).some((f) => matches(doc, f));
      const value = doc[key];
      if (
        condition &&
        typeof condition === "object" &&
        !(condition instanceof Date)
      ) {
        const c = condition as Document;
        if ("$regex" in c)
          return (
            typeof value === "string" &&
            new RegExp(c.$regex, c.$options).test(value)
          );
        if ("$in" in c) return c.$in.includes(value);
        if ("$ne" in c) return value !== c.$ne;
        if ("$gte" in c) return value >= c.$gte;
      }
      return value === condition;
    });
  const project = (doc: Document, projection?: Document) =>
    !projection
      ? structuredClone(doc)
      : structuredClone(
          Object.fromEntries(
            Object.entries(doc).filter(([k]) => k === "_id" || projection[k]),
          ),
        );
  const collection = (name: string) => ({
    async findOne(filter: Document, options?: { projection?: Document }) {
      const row = tables[name].find((d) => matches(d, filter));
      return row ? project(row, options?.projection) : null;
    },
    async countDocuments(filter: Document) {
      return tables[name].filter((d) => matches(d, filter)).length;
    },
    find(filter: Document, options?: { projection?: Document }) {
      let rows = tables[name].filter((d) => matches(d, filter));
      const cursor = {
        sort(order: Document) {
          rows.sort((a, b) => {
            for (const [k, direction] of Object.entries(order)) {
              if (a[k] < b[k]) return -direction;
              if (a[k] > b[k]) return direction;
            }
            return 0;
          });
          return cursor;
        },
        skip(n: number) {
          rows = rows.slice(n);
          return cursor;
        },
        limit(n: number) {
          rows = rows.slice(0, n);
          return cursor;
        },
        async toArray() {
          return rows.map((d) => project(d, options?.projection));
        },
      };
      return cursor;
    },
    async updateOne(filter: Document, update: Document) {
      const row = tables[name].find((d) => matches(d, filter));
      if (!row) return { matchedCount: 0 };
      Object.assign(row, update.$set);
      return { matchedCount: 1 };
    },
    async insertOne(doc: Document) {
      if (failAudit) throw new Error("simulated audit failure");
      if (tables[name].some((d) => d._id === doc._id))
        throw new Error("duplicate key");
      tables[name].push(structuredClone(doc));
      return { insertedId: doc._id };
    },
  });
  const client = {
    db: () => ({ collection }),
    startSession: () => ({
      async withTransaction(fn: () => Promise<void>) {
        const snapshot = structuredClone(tables);
        try {
          await fn();
        } catch (e) {
          tables = snapshot;
          throw e;
        }
      },
      async endSession() {},
    }),
  } as unknown as MongoClient;
  return {
    client,
    collection,
    tables: () => tables,
    failAudit: (fail: boolean) => {
      failAudit = fail;
    },
    module: {
      mongoClient: async () => client,
      users: async () => collection("users"),
      cities: async () => collection("cities"),
      battles: async () => collection("battles"),
      marketOrders: async () => collection("market_orders"),
      caravans: async () => collection("caravans"),
    },
  };
}
