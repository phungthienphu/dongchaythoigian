import { BoundedCache } from './bounded-cache';
import { MAX_SETTLE_MS, settle, type City } from './engine';
import { villageView } from './world-discovery';

type Source = { _id: string; ver: number; state: City };
type Entry = { revision: number; sourceLast: number; engine: number; at: number; state: City; weight: number };
/** Internal simulation checkpoints only. Callers must authorize each visit and
 * load the current database revision before using this process-local cache. */
export class VillageSnapshots {
  private readonly entries: BoundedCache<string, Entry>;
  constructor(maxEntries = 8, maxWeight = 2_000_000, private readonly ttlMs = 5 * 60_000,
    private readonly advance: typeof settle = settle) {
    // Weight is serialized UTF-16 bytes, a retention budget, not a heap guarantee.
    this.entries = new BoundedCache(maxEntries, maxWeight, e => e.weight);
  }
  get size() { return this.entries.size; }
  get weight() { return this.entries.weight; }
  view(doc: Source, now: number): City {
    const source = doc.state;
    const old = this.entries.get(doc._id);
    const reusable = old && old.revision === doc.ver && old.sourceLast === source.last
      && old.engine === source.ver && now >= old.at && now - old.at < this.ttlMs;
    // Legacy activation timestamps and the moving offline cap depend on the
    // original request time; replay those snapshots directly to preserve policy.
    const cacheable = source.upkeepStartsAt !== undefined && source.wheelFuelStartsAt !== undefined
      && source.gatherFoodStartsAt !== undefined && now - (source.haulAt ?? source.last) <= MAX_SETTLE_MS;
    const state = reusable && cacheable ? structuredClone(old.state) : structuredClone(source);
    if (!state.battleId) this.advance(state, now);
    if (cacheable) this.entries.set(doc._id, {
      revision: doc.ver, sourceLast: source.last, engine: source.ver,
      at: reusable ? old.at : now, state, weight: JSON.stringify(state).length * 2,
    });
    return villageView(state);
  }
}
export const villageSnapshots = new VillageSnapshots();
