import { cloneCity } from './clone-city';
import type {EngineRules} from './eras';
import { applyAction, settle, type Action, type City } from './engine';

export type CityActionResponse = { state?: City; error?: string; serverNow?: number };
export type OptimisticCityOptions = {
  rules?: EngineRules;
  state: City;
  now?: () => number;
  onState: (state: City) => void;
  onError?: (message: string) => void;
  send: (action: Action, requestId: string) => Promise<CityActionResponse>;
  /** Reload authoritative state after an ambiguous network failure. Never replay
   * the mutation: the server may already have committed it. */
  onUncertain: () => Promise<City | void>;
};
type Pending = { action: Action; at: number; requestId: string; resolve: (ok: boolean) => void };
const clone = <T>(value: T): T => structuredClone(value);
let nextRequest = 0;
const requestId = () => globalThis.crypto?.randomUUID?.() ?? `city-${Date.now()}-${++nextRequest}`;

/** Owns the confirmed snapshot and replays pending actions over that snapshot.
 * Only one mutation is dispatched at a time, while enqueue updates the UI
 * synchronously. Capture version before a background GET, then pass it to
 * setAuthoritative so an old response cannot erase newer player actions. */
export class OptimisticCityQueue {
  private base: City;
  private visible: City;
  private pending: Pending[] = [];
  private sending = false;
  private recovering = false;
  private needsSync = false;
  private generation = 0;
  private stopped = false;
  private clock: () => number;
  constructor(private readonly options: OptimisticCityOptions) {
    this.base = cloneCity(options.state);
    this.visible = cloneCity(options.state);
    this.clock = options.now ?? Date.now;
  }
  get isPending(): boolean { return this.pending.length > 0 || this.recovering; }
  get version(): number { return this.generation; }
  get snapshot(): City { return cloneCity(this.visible); }

  /** Revoke the local controller; an in-flight response must not revive it. */
  stop() {
    this.stopped = true;
    for (const entry of this.pending) entry.resolve(false);
    this.pending = [];
  }

  /** Advance the same visible state used by subsequent optimistic actions. */
  advance(at = this.clock()) {
    if (this.stopped) return;
    if (!this.visible.battleId) settle(this.visible, Math.max(at, this.visible.last));
    this.publish();
  }

  setAuthoritative(state: City, expectedVersion = this.generation): boolean {
    if (this.stopped) return false;
    if (this.isPending || expectedVersion !== this.generation || state.last < this.base.last) return false;
    this.base = cloneCity(state);
    const displayAt = Math.max(this.visible.last, this.clock());
    this.visible = cloneCity(state);
    if (!this.visible.battleId) settle(this.visible, displayAt);
    this.needsSync = false;
    this.generation++;
    this.publish();
    return true;
  }

  enqueue(action: Action): Promise<boolean> {
    if (this.stopped) return Promise.resolve(false);
    if (this.recovering || this.needsSync) {
      this.options.onError?.('Đang đồng bộ lại làng, vui lòng thử lại sau.');
      return Promise.resolve(false);
    }
    const at = this.clock();
    const next = cloneCity(this.visible);
    const savedAction = clone(action);
    const error = applyAction(next, savedAction, at, this.options.rules);
    if (error) {
      this.options.onError?.(error);
      return Promise.resolve(false);
    }
    let resolve!: (ok: boolean) => void;
    const completed = new Promise<boolean>(done => { resolve = done; });
    this.pending.push({ action: savedAction, at, requestId: requestId(), resolve });
    this.visible = next;
    this.generation++;
    this.publish();
    void this.drain();
    return completed;
  }

  private publish() { this.options.onState(cloneCity(this.visible)); }

  private replay() {
    let state = cloneCity(this.base);
    const kept: Pending[] = [];
    for (const entry of this.pending) {
      const next = cloneCity(state);
      const error = applyAction(next, entry.action, Math.max(entry.at, state.last), this.options.rules);
      if (error) {
        entry.resolve(false);
        this.options.onError?.(error);
      } else {
        state = next;
        kept.push(entry);
      }
    }
    this.pending = kept;
    if (!state.battleId) settle(state, Math.max(this.visible.last, this.clock()));
    this.visible = state;
    this.generation++;
    this.publish();
  }

  private async uncertain(message: string) {
    if (this.stopped) return;
    this.recovering = true;
    this.needsSync = true;
    const abandoned = this.pending;
    this.pending = [];
    this.visible = cloneCity(this.base);
    this.generation++;
    this.publish();
    this.options.onError?.(message);
    for (const entry of abandoned) entry.resolve(false);
    try {
      const fresh = await this.options.onUncertain();
      if (fresh && !this.stopped) { this.base = cloneCity(fresh); this.visible = cloneCity(fresh); this.needsSync = false; }
    } catch {
      this.options.onError?.('Chưa đồng bộ được làng. Hãy tải lại trước khi tiếp tục.');
    } finally {
      this.recovering = false;
      this.generation++;
      if (!this.stopped) this.publish();
    }
  }

  private async drain() {
    if (this.sending || this.recovering) return;
    this.sending = true;
    try {
      while (this.pending.length) {
        const entry = this.pending[0];
        let response: CityActionResponse;
        try { response = await this.options.send(clone(entry.action), entry.requestId); }
        catch {
          await this.uncertain('Mất kết nối khi lưu thao tác. Đang đồng bộ lại làng.');
          return;
        }
        if (this.stopped) return;
        if (!response.state && !response.error) {
          await this.uncertain('Máy chủ chưa trả về trạng thái làng. Đang đồng bộ lại.');
          return;
        }
        this.pending.shift();
        if (response.state) this.base = cloneCity(response.state);
        if (response.error) this.options.onError?.(response.error);
        this.replay();
        entry.resolve(!response.error);
      }
    } finally { this.sending = false; }
  }
}
