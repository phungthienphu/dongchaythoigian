import {
  cities,
  users,
  battles,
  marketOrders,
  caravans,
  mongoClient,
} from "./db";
import { requestDatabase } from "./db-context";
import { AdminError, literalSearch } from "./admin-policy";
import type {
  AdminCommand,
  AdminData,
  AdminRow,
  AdminTab,
} from "./admin-types";
import type { Document, Filter } from "mongodb";
const PAGE = 25;
async function auditCollection() {
  return (await mongoClient())
    .db(
      requestDatabase()?.database ??
        (process.env.MONGODB_DB || "dong_song_thoi_dai"),
    )
    .collection<Audit>("admin_audit");
}
type Audit = {
  _id: string;
  actor: string;
  action: string;
  target: string;
  reason: string;
  before: string | null;
  after: string;
  at: Date;
};
const iso = (v: unknown) => {
  const d = new Date(v as string | number);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
};
const text = (v: unknown) => (typeof v === "string" ? v : null);
const num = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) ? v : 0;
const search = (q: string, fields: string[]): Filter<Document> =>
  q
    ? {
        $or: fields.map((key) => ({
          [key]: { $regex: literalSearch(q), $options: "i" },
        })),
      }
    : {};
export async function readAdmin(
  actor: string,
  tab: AdminTab,
  q: string,
  page: number,
): Promise<AdminData> {
  const data: AdminData = {
    actor,
    tab,
    page,
    at: new Date().toISOString(),
    hasMore: false,
    rows: [],
  };
  const uc = await users(),
    cc = await cities(),
    bc = await battles(),
    mc = await marketOrders(),
    ac = await auditCollection();
  if (tab === "overview") {
    const day = new Date(Date.now() - 86400000);
    const values = await Promise.all([
      uc.countDocuments({}),
      uc.countDocuments({ lastSeen: { $gte: day } }),
      cc.countDocuments({}),
      bc.countDocuments({
        status: { $in: ["marching", "fighting", "returning"] },
      }),
      mc.countDocuments({ status: "open" }),
      (await caravans()).countDocuments({ status: { $ne: "completed" } }),
    ]);
    data.metrics = [
      "Người chơi",
      "Hoạt động 24 giờ",
      "Làng đã tạo",
      "Trận đang diễn ra",
      "Lệnh bán đang mở",
      "Đoàn buôn đang đi",
    ].map((label, i) => ({ label, value: values[i] }));
    const recent = await ac
      .find(
        {},
        { projection: { actor: 1, action: 1, target: 1, reason: 1, at: 1 } },
      )
      .sort({ at: -1, _id: -1 })
      .limit(8)
      .toArray();
    data.rows = recent.map((d) => ({
      id: d._id,
      actor: d.actor,
      action: d.action,
      target: d.target,
      reason: d.reason,
      at: iso(d.at),
    }));
    return data;
  }
  const config: {
    collection: unknown;
    fields: string[];
    projection: Record<string, number>;
    sort: import("mongodb").Sort;
  } = {
    players: {
      collection: uc,
      fields: ["_id", "name", "email", "cityId"],
      projection: { name: 1, email: 1, cityId: 1, createdAt: 1, lastSeen: 1 },
      sort: { createdAt: -1 as const, _id: -1 as const },
    },
    cities: {
      collection: cc,
      fields: ["_id", "name", "owner"],
      projection: {
        name: 1,
        owner: 1,
        era: 1,
        pop: 1,
        score: 1,
        updatedAt: 1,
        ver: 1,
      },
      sort: { updatedAt: -1 as const, _id: -1 as const },
    },
    battles: {
      collection: bc,
      fields: [
        "_id",
        "attackerName",
        "defenderName",
        "attackerId",
        "defenderId",
        "status",
      ],
      projection: {
        attackerName: 1,
        defenderName: 1,
        status: 1,
        createdAt: 1,
        arrive: 1,
      },
      sort: { createdAt: -1 as const, _id: -1 as const },
    },
    market: {
      collection: mc,
      fields: ["_id", "sellerName", "seller", "resource", "status"],
      projection: {
        sellerName: 1,
        resource: 1,
        amount: 1,
        currency: 1,
        price: 1,
        status: 1,
        createdAt: 1,
      },
      sort: { createdAt: -1 as const, _id: -1 as const },
    },
    audit: {
      collection: ac,
      fields: ["actor", "target", "reason", "action"],
      projection: {
        actor: 1,
        action: 1,
        target: 1,
        reason: 1,
        before: 1,
        after: 1,
        at: 1,
      },
      sort: { at: -1 as const, _id: -1 as const },
    },
  }[tab];
  // Explicit projections keep session metadata, private state and combat snapshots off the wire.
  const docs = await (
    config.collection as unknown as import("mongodb").Collection<Document>
  )
    .find(search(q, config.fields), { projection: config.projection })
    .sort(config.sort)
    .skip((page - 1) * PAGE)
    .limit(PAGE + 1)
    .toArray();
  data.hasMore = docs.length > PAGE;
  data.rows = docs.slice(0, PAGE).map((d) => {
    const base: AdminRow = { id: String(d._id) };
    if (tab === "players")
      return {
        ...base,
        name: text(d.name),
        email: text(d.email),
        cityId: text(d.cityId),
        lastSeen: iso(d.lastSeen),
        createdAt: iso(d.createdAt),
      };
    if (tab === "cities")
      return {
        ...base,
        name: text(d.name),
        owner: text(d.owner),
        era: num(d.era),
        pop: num(d.pop),
        score: num(d.score),
        updatedAt: iso(d.updatedAt),
        ver: num(d.ver),
      };
    if (tab === "battles")
      return {
        ...base,
        attackerName: text(d.attackerName),
        defenderName: text(d.defenderName),
        status: text(d.status),
        createdAt: iso(d.createdAt),
        arrive: iso(d.arrive),
      };
    if (tab === "market")
      return {
        ...base,
        sellerName: text(d.sellerName),
        resource: text(d.resource),
        amount: num(d.amount),
        currency: text(d.currency),
        price: num(d.price),
        status: text(d.status),
        createdAt: iso(d.createdAt),
      };
    return {
      ...base,
      actor: text(d.actor),
      action: text(d.action),
      target: text(d.target),
      reason: text(d.reason),
      before: text(d.before),
      after: text(d.after),
      at: iso(d.at),
    };
  });
  return data;
}
export async function writeAdmin(actor: string, command: AdminCommand) {
  const client = await mongoClient(),
    session = client.startSession();
  const audit = await auditCollection(),
    cc = await cities(),
    uc = await users();
  const id = `${actor}:${command.requestId}`;
  try {
    await session.withTransaction(async () => {
      const prior = await audit.findOne({ _id: id }, { session });
      if (prior) {
        if (
          prior.action !== command.action ||
          prior.target !== command.target ||
          prior.after !== command.value ||
          prior.reason !== command.reason ||
          (command.action === "rename-city" &&
            prior.before !== command.expected)
        )
          throw new AdminError(
            "Mã yêu cầu đã được dùng cho thao tác khác.",
            409,
          );
        return;
      }
      let before: string | null = null;
      if (command.action === "rename-city") {
        const city = await cc.findOne(
          { _id: command.target },
          { projection: { name: 1 }, session },
        );
        if (!city) throw new AdminError("Không tìm thấy làng.", 404);
        if (city.name !== command.expected)
          throw new AdminError(
            "Tên làng đã thay đổi. Tải lại trước khi sửa.",
            409,
          );
        before = city.name;
        if (before === command.value)
          throw new AdminError("Tên mới trùng tên hiện tại.");
        const result = await cc.updateOne(
          { _id: command.target, name: command.expected },
          { $set: { name: command.value } },
          { session },
        );
        if (result.matchedCount !== 1)
          throw new AdminError("Làng đã thay đổi. Tải lại trước khi sửa.", 409);
      } else if (
        !(await uc.findOne(
          { _id: command.target },
          { projection: { _id: 1 }, session },
        ))
      )
        throw new AdminError("Không tìm thấy người chơi.", 404);
      await audit.insertOne(
        {
          _id: id,
          actor,
          action: command.action,
          target: command.target,
          reason: command.reason,
          before,
          after: command.value,
          at: new Date(),
        },
        { session },
      );
    });
    return { ok: true };
  } finally {
    await session.endSession();
  }
}
