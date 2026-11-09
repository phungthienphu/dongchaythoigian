import { ENGINE_VER, HOUR, MAX_SETTLE_MS, newCity, settle, applyAction, type City } from '../../lib/engine';
import { ANCHOR_WINDOW_MS, BATCH_BYTES, QUEUE_AGE_MS, validBatch, type BatchRequest, type SyncLedger, type SyncResult } from '../../lib/city-sync';
import { digest, readAnchor, signAnchor } from './sync-crypto';
import { boundedJSON, InputError, json, QA_EPOCH, type VillageContext, type VillageEnv, type VillageRegistration } from './runtime';

// A request advances at most one long slice. M04 must reduce the CPU cost of
// offline simulation; HTTP retries may resume this work without publishing it.
const SLICE = 6 * HOUR;
type Work = { state: City; now: number; batch?: BatchRequest; hash?: string; hashes: string[]; offset: number; results: SyncResult[] };
type RecordState = {
  cityId: string; owner: string; epoch: string; session: number; revision: number;
  registration?: VillageRegistration; state?: City; ledger: SyncLedger; work?: Work;
};

/** Staging Village authority. No synthetic clocks, seed, debug or import routes. */
export class Village {
  constructor(private ctx: VillageContext, private env: VillageEnv) {
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS village (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL)');
  }
  private read(): RecordState | undefined {
    const row = this.ctx.storage.sql.exec<{ value: string }>('SELECT value FROM village WHERE id=1').toArray()[0];
    return row ? JSON.parse(row.value) : undefined;
  }
  private write(value: RecordState) {
    // State, receipt, session and working checkpoint share one durable commit.
    this.ctx.storage.transactionSync(() => this.ctx.storage.sql.exec(
      'INSERT INTO village(id,value) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value', JSON.stringify(value)));
  }
  fetch(request: Request): Promise<Response> {
    return this.ctx.blockConcurrencyWhile(async () => {
      try { return await this.handle(request); }
      catch (error) {
        if (error instanceof InputError) return json({ error: error.message, code: error.code }, error.status);
        // No SQL errors, state, identities or credentials in logs/responses.
        return json({ error: 'Chưa lưu được làng. Hàng đợi được giữ để thử lại.', code: 'VILLAGE_STORAGE_UNAVAILABLE' }, 503);
      }
    });
  }
  private async handle(request: Request): Promise<Response> {
    if (this.env.VILLAGE_ENABLED !== 'true' || this.env.VILLAGE_EPOCH !== QA_EPOCH || (this.env.AUTH_SECRET?.length ?? 0) < 32)
      throw new InputError('Backend làng chưa sẵn sàng.', 503);
    const op = new URL(request.url).pathname.slice(1);
    if (request.method !== 'POST' || !['fence', 'create', 'read', 'checkpoint', 'batch'].includes(op)) throw new InputError('Không tìm thấy đường dẫn.', 404);
    const cityId = request.headers.get('x-village-id') ?? '', owner = request.headers.get('x-village-owner') ?? '';
    const epoch = request.headers.get('x-village-epoch'), session = Number(request.headers.get('x-village-session'));
    if (!/^qa-[a-f0-9-]{36}$/.test(cityId) || !owner || owner.length > 256 || epoch !== this.env.VILLAGE_EPOCH || !Number.isSafeInteger(session) || session < 1)
      throw new InputError('Quyền điều khiển làng không hợp lệ.', 403);
    let c = this.read();
    if (c && (c.cityId !== cityId || c.owner !== owner || c.epoch !== epoch)) throw new InputError('Quyền sở hữu làng không khớp.', 403);
    if (c && session < c.session) throw new InputError('Phiên chơi này đã được thay thế.', 401);
    // Only the authenticated gateway publishes fences. A pending private work
    // snapshot is discarded on replacement: none of its commands were ACKed.
    if (!c || session > c.session) {
      c ??= { cityId, owner, epoch, session, revision: 0, ledger: { session, ack: 0, lastAt: 0, results: [] } };
      c.session = session; c.ledger = { session, ack: 0, lastAt: c.state?.last ?? 0, results: [] };
      delete c.work; c.revision++; this.write(c);
    }
    if (op === 'fence') return json({ ok: true });
    const now = Date.now();
    if (op === 'create') {
      const r = await boundedJSON(request, 2048) as VillageRegistration;
      if (!r || r.id !== cityId || r.owner !== owner || r.epoch !== epoch || typeof r.name !== 'string'
        || r.name.trim().length < 2 || r.name.length > 24 || !Number.isSafeInteger(r.createdAt) || r.createdAt < 0 || r.createdAt > now)
        throw new InputError('Thông tin tạo làng không hợp lệ.', 400);
      if (c.registration && JSON.stringify(c.registration) !== JSON.stringify(r)) throw new InputError('Làng đã được khởi tạo với thông tin khác.');
      if (!c.state) {
        c.registration = r; c.state = newCity(r.createdAt); c.ledger.lastAt = r.createdAt; c.revision++; this.write(c);
      }
      c.work ??= { state: structuredClone(c.state!), now, hashes: [], offset: 0, results: [] };
      return this.advance(c);
    }
    if (!c.state) return json({ needsName: true }, 404);
    if (c.state.ver !== ENGINE_VER) throw new InputError('Làng cần được nâng phiên bản dữ liệu trước khi chơi.', 409, 'ENGINE_MIGRATION_REQUIRED');
    let range: [number, number] | undefined;
    if (op === 'batch') {
      const batch = await boundedJSON(request, BATCH_BYTES);
      if (!validBatch(batch)) throw new InputError('Lệnh đồng bộ không hợp lệ.', 400);
      if (batch.session !== session) throw new InputError('Phiên chơi này đã được thay thế.', 401);
      range = [batch.commands[0].seq, batch.commands.at(-1)!.seq];
      const hash = await digest(batch);
      if (c.work) {
        // Temporary catch-up is retryable. A 409 would permanently block the
        // existing client queue before it can reload and discover a lost ACK.
        if (c.work.hash !== hash) throw new InputError('Làng đang phục hồi lượt lưu trước. Hãy đối chiếu lại checkpoint.', 503, 'CHECKPOINT_PENDING');
      } else {
        const hashes = await Promise.all(batch.commands.map(command => digest(command)));
        for (const [n, command] of batch.commands.entries()) {
          const anchor = await readAnchor(command.anchor, this.env.AUTH_SECRET!);
          if (!anchor || anchor.cityId !== cityId || anchor.session !== session || anchor.revision > c.revision
            || command.at < anchor.at || command.at > anchor.until || command.at > now + 1000)
            throw new InputError('Mốc đồng bộ không hợp lệ. Hãy tải lại làng.');
          if (command.seq <= c.ledger.ack) {
            const receipt = c.ledger.results.find(r => r.seq === command.seq);
            if (!receipt) throw new InputError('Biên nhận cũ đã hết thời gian lưu. Hãy đối chiếu checkpoint.', 409, 'RECEIPT_EXPIRED');
            if (receipt.id !== command.id || receipt.digest !== hashes[n]) throw new InputError('Sequence đã được dùng cho thao tác khác.');
          }
        }
        const fresh = batch.commands.filter(command => command.seq > c!.ledger.ack);
        if (!fresh.length) return this.response(c, now, range); // No engine run or storage write on replay.
        if (fresh[0].seq !== c.ledger.ack + 1) throw new InputError('Thiếu thao tác trước đó. Hãy đối chiếu hàng đợi.');
        let lastAt = c.ledger.lastAt;
        const ids = new Set(c.ledger.results.map(r => r.id));
        for (const command of fresh) {
          if (command.at < lastAt || ids.has(command.id)) throw new InputError('Thứ tự hoặc mã thao tác không hợp lệ.');
          lastAt = command.at; ids.add(command.id);
        }
        c.work = { state: structuredClone(c.state), now, batch: { ...batch, commands: fresh }, hash,
          hashes: hashes.slice(-fresh.length), offset: 0, results: [] };
      }
    } else if (!c.work) {
      c.work = { state: structuredClone(c.state), now, hashes: [], offset: 0, results: [] };
    }
    return this.advance(c, range);
  }
  private async advance(c: RecordState, range?: [number, number]): Promise<Response> {
    const w = c.work!, state = w.state;
    // Do not approximate the engine's >14-day cap by rewriting clocks. QA has
    // no imported villages; that boundary remains a migration/M04 launch gate.
    if (w.now - (state.haulAt ?? state.last) > MAX_SETTLE_MS)
      throw new InputError('Làng cần phục hồi cửa sổ offline dài trước khi mở chơi.', 503, 'OFFLINE_MIGRATION_REQUIRED');
    const pending = () => {
      this.write(c);
      return json({ error: 'Đang khôi phục tiến trình làng. Vui lòng chờ rồi thử lại.', code: 'CHECKPOINT_PENDING',
        catchup: { at: state.last, target: w.now } }, 503, { 'retry-after': '1' });
    };
    if (!state.battleId) { state.farmAutoStartsAt ??= w.now; state.hungerStartsAt ??= w.now; state.economyBalanceStartsAt ??= w.now; }
    while (w.batch && w.offset < w.batch.commands.length) {
      const command = w.batch.commands[w.offset], at = Math.max(state.last, Math.min(w.now, command.at));
      const expired = w.now - command.at > QUEUE_AGE_MS;
      if (!expired && !state.battleId && at - state.last > SLICE) { settle(state, state.last + SLICE); return pending(); }
      const error = expired ? 'Thao tác đã chờ quá 30 phút. Hãy kiểm tra làng và giao lại việc.'
        : state.battleId ? 'Làng đang trong trận đánh. Thao tác chưa thực hiện; hãy dùng bảng chỉ huy trận.'
        : applyAction(state, command.action, at);
      w.results.push({ seq: command.seq, id: command.id, error, at, digest: w.hashes[w.offset], ...(at > command.at ? { rescheduled: true } : {}) });
      w.offset++;
    }
    if (!state.battleId && w.now - state.last > SLICE) { settle(state, state.last + SLICE); return pending(); }
    if (!state.battleId) settle(state, w.now);
    c.state = state;
    if (w.batch) c.ledger = { session: c.session, ack: w.batch.commands.at(-1)!.seq, lastAt: w.batch.commands.at(-1)!.at,
      results: [...c.ledger.results, ...w.results].slice(-256) };
    delete c.work; c.revision++; this.write(c);
    return this.response(c, Date.now(), range);
  }
  private async response(c: RecordState, now: number, range?: [number, number]) {
    const anchor = { cityId: c.cityId, session: c.session, engine: ENGINE_VER, revision: c.revision, at: now, until: now + ANCHOR_WINDOW_MS };
    return json({ name: c.registration!.name, state: c.state!, serverNow: now, batchEnabled: true,
      sync: { ...anchor, checkpointAt: c.state!.last, ack: c.ledger.ack, anchor: await signAnchor(anchor, this.env.AUTH_SECRET!),
        results: c.ledger.results.filter(r => !range || r.seq >= range[0] && r.seq <= range[1]).map(({ digest: _digest, ...r }) => r) } });
  }
}
