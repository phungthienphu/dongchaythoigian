import type { City } from "./engine";
import type { Collection } from "mongodb";
import type { CityDoc } from "./db";
export type ZombiePolicy = {
  enabled: boolean;
  revision: number;
  changedAt: number;
};
export type GameSettings = { _id: "zombies"; policy: ZombiePolicy };
export const defaultZombiePolicy = (): ZombiePolicy => ({
  enabled: true,
  revision: 0,
  changedAt: 0,
});
/** Server-owned rule attached to snapshots, never accepted from a player action.
 * Read it on every collection acquisition: no cross-request/stale global cache. */
export function cityPolicy(
  doc: CityDoc | null,
  policy: ZombiePolicy,
): CityDoc | null {
  if (doc?.state && typeof doc.state.last === "number")
    doc.state.zombiePolicy = { ...policy };
  return doc;
}
export function policyCities(
  collection: Collection<CityDoc>,
  policy: ZombiePolicy,
): Collection<CityDoc> {
  return new Proxy(collection, {
    get(target, key) {
      if (key === "findOne")
        return async (...args: Parameters<typeof collection.findOne>) =>
          cityPolicy(await target.findOne(...args), policy);
      if (key === "find")
        return (...args: Parameters<typeof collection.find>) =>
          target.find(...args).map((doc) => cityPolicy(doc, policy)!);
      if (key === "insertOne")
        return (
          doc: CityDoc,
          options?: Parameters<typeof collection.insertOne>[1],
        ) => target.insertOne(cityPolicy(doc, policy)!, options);
      const value = Reflect.get(target, key, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
