/** Least-recently-used cache with limits on entry count and retained value weight.
 * Oversized values are returned by callers normally, but never retained. */
export class BoundedCache<K, V> {
  private entries = new Map<K, { value: V; weight: number }>();
  private retained = 0;
  private readonly maxEntries: number;
  private readonly maxWeight: number;
  private readonly weigh: (value: V) => number;
  constructor(maxEntries: number, maxWeight: number, weigh: (value: V) => number = () => 1) {
    this.maxEntries=maxEntries;this.maxWeight=maxWeight;this.weigh=weigh;
  }
  get size() { return this.entries.size; }
  get weight() { return this.retained; }
  *values() { for (const entry of this.entries.values()) yield entry.value; }
  has(key: K) { return this.entries.has(key); }
  /** Read without updating recency, for hot rendering caches where FIFO is sufficient. */
  peek(key: K): V | undefined { return this.entries.get(key)?.value; }
  get(key: K): V | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    this.entries.delete(key); this.entries.set(key, entry);
    return entry.value;
  }
  set(key: K, value: V) {
    const previous = this.entries.get(key);
    if (previous) { this.retained -= previous.weight; this.entries.delete(key); }
    const weight = Math.max(1, Math.ceil(this.weigh(value)));
    if (!Number.isFinite(weight) || weight > this.maxWeight || this.maxEntries < 1) return;
    while (this.entries.size >= this.maxEntries || this.retained + weight > this.maxWeight) {
      const oldest = this.entries.keys().next();
      if (oldest.done) break;
      const entry = this.entries.get(oldest.value)!;
      this.retained -= entry.weight; this.entries.delete(oldest.value);
    }
    this.entries.set(key, { value, weight }); this.retained += weight;
  }
  clear() { this.entries.clear(); this.retained = 0; }
}
