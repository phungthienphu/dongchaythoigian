/** Coalesce concurrent reads only. Responses are not cached after completion;
 * actions and uncertain-action recovery must retain their own ordering. */
export class ReadFlights {
  private pending = new Map<string, Promise<unknown>>();
  invalidate(key: string) { this.pending.delete(key); }
  run<T>(key: string, read: () => Promise<T>): Promise<T> {
    const current = this.pending.get(key);
    if (current) return current as Promise<T>;
    const request = Promise.resolve().then(read).finally(() => {
      if (this.pending.get(key) === request) this.pending.delete(key);
    });
    this.pending.set(key, request);
    return request;
  }
}
