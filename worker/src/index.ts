import { advanceBattle, commandBattle, battleResult } from '../../lib/battle';

type Battle = Parameters<typeof advanceBattle>[0];
type Command = Parameters<typeof commandBattle>[2];
type Identity = { roomId: string; playerId: string; side: 'attacker' | 'defender'; exp: number; active?: boolean; closed?: boolean };
interface Env { BATTLES: DurableObjectNamespace; BATTLE_SERVER_SECRET: string; APP_URL: string }
const json = (value: unknown, status = 200) => Response.json(value, { status });
const authorized = (request: Request, env: Env) => !!env.BATTLE_SERVER_SECRET && request.headers.get('Authorization') === `Bearer ${env.BATTLE_SERVER_SECRET}`;
function validCommand(value: unknown): value is Command {
  if (!value || typeof value !== 'object') return false;
  const c = value as Record<string, unknown>;
  if (c.type === 'retreat') return true;
  if (c.type === 'presence') return typeof c.online === 'boolean';
  if (typeof c.groupId !== 'string' || c.groupId.length > 100) return false;
  if (c.type === 'move') return typeof c.x === 'number' && Number.isFinite(c.x) && typeof c.y === 'number' && Number.isFinite(c.y);
  return c.type === 'attack' && typeof c.targetId === 'string' && c.targetId.length <= 100;
}
function decode64(value: string): Uint8Array<ArrayBuffer> {
  const raw = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}
async function identity(ticket: string, roomId: string, secret: string): Promise<Identity | null> {
  try {
    if (!secret || ticket.length > 4096) return null;
    const [payload, signature, extra] = ticket.split('.');
    if (!payload || !signature || extra) return null;
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    if (!await crypto.subtle.verify('HMAC', key, decode64(signature), new TextEncoder().encode(payload))) return null;
    const data = JSON.parse(new TextDecoder().decode(decode64(payload))) as Identity;
    return data.roomId === roomId && typeof data.playerId === 'string' && (data.side === 'attacker' || data.side === 'defender') && Number.isFinite(data.exp) && data.exp > Date.now() / 1000 ? data : null;
  } catch { return null; }
}
export default {
  async scheduled(_controller: unknown, env: Env): Promise<void> {
    if (!env.BATTLE_SERVER_SECRET || !env.APP_URL) throw new Error('Battle reconciliation is not configured');
    const response = await fetch(`${env.APP_URL.replace(/\/$/, '')}/api/battles/reconcile`, {
      method: 'POST', headers: { Authorization: `Bearer ${env.BATTLE_SERVER_SECRET}`, 'Content-Type': 'application/json' },
      body: '{}', signal: AbortSignal.timeout(25_000),
    });
    if (!response.ok) throw new Error(`Battle reconciliation failed (${response.status})`);
  },
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const match = /^\/rooms\/([a-zA-Z0-9_-]{1,100})(?:\/(socket|command|schedule|notify))?$/.exec(url.pathname);
    if (!match) return json({ error: 'Not found' }, 404);
    if (match[2] !== 'socket' && !authorized(request, env)) return json({ error: 'Unauthorized' }, 401);
    return env.BATTLES.get(env.BATTLES.idFromName(match[1])).fetch(request);
  },
};

export class BattleRoom {
  private battle: Battle | null = null;
  private roomId = '';
  private scheduled: number | null = null;
  private delivered = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private busy = false;
  private lastPersist = 0;
  constructor(private ctx: DurableObjectState, private env: Env) {
    ctx.blockConcurrencyWhile(async () => {
      this.battle = await ctx.storage.get<Battle>('battle') ?? null;
      this.roomId = await ctx.storage.get<string>('roomId') ?? '';
      this.scheduled = await ctx.storage.get<number>('scheduled') ?? null;
      this.delivered = await ctx.storage.get<boolean>('delivered') ?? false;
      if (this.battle && !battleResult(this.battle)) this.start();
    });
  }
  private start() {
    if (!this.timer) this.timer = setInterval(() => this.ctx.waitUntil(this.tick()), 100);
  }
  private validSocket(socket: WebSocket): boolean {
    const user = socket.deserializeAttachment() as Identity | null;
    if (user?.closed) return false;
    if (!user || user.exp <= Date.now() / 1000) {
      if (user) socket.serializeAttachment({ ...user, closed: true, active: false });
      socket.close(1008, 'Ticket expired'); return false;
    }
    if (this.battle && user.playerId !== (user.side === 'attacker' ? this.battle.attackerId : this.battle.defenderId)) { socket.close(1008, 'Forbidden'); return false; }
    return true;
  }
  private refreshPresence() {
    if (!this.battle) return;
    const online = this.ctx.getWebSockets().some(socket => {
      const user = socket.deserializeAttachment() as Identity | null;
      return user?.side === 'defender' && user.playerId === this.battle!.defenderId && user.roomId === this.battle!.id && user.active === true && this.validSocket(socket);
    });
    commandBattle(this.battle, 'defender', { type: 'presence', online });
  }
  /** Navigation buffers stay on the server; clients render positions and orders. */
  private snapshot(includeTerrain = false) {
    const { terrain, ...battle } = this.battle!;
    const groups = battle.groups.map(({ path: _path, pathGoal: _goal, pathVersion: _version, breachRetryAt: _retry, retreatExit: _exit, resumeOrder: _resume, ...group }) => group);
    return { ...battle, groups, ...(includeTerrain ? { terrain } : {}) };
  }
  private broadcast() {
    const sockets=this.ctx.getWebSockets().filter(socket=>this.validSocket(socket));
    if(!sockets.length)return;
    const message = JSON.stringify({ type: 'state', battle: this.snapshot() });
    for (const socket of sockets) {
      try { socket.send(message); } catch { socket.close(1011, 'Connection lost'); }
    }
  }
  private async callback(path: string, body: unknown): Promise<boolean> {
    try {
      const response = await fetch(`${this.env.APP_URL.replace(/\/$/, '')}${path}`, {
        method: 'POST', headers: { Authorization: `Bearer ${this.env.BATTLE_SERVER_SECRET}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000),
      });
      return response.ok;
    } catch { return false; }
  }
  private async tick() {
    if (this.busy || !this.battle) return;
    this.busy = true;
    try {
      this.refreshPresence();
      advanceBattle(this.battle, Date.now());
      this.broadcast();
      const result = battleResult(this.battle);
      if (result) {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
        await this.ctx.storage.put('battle', this.battle);
        if (!this.delivered) {
          this.delivered = await this.callback('/api/battles/result', { battleId: this.roomId, result });
          await this.ctx.storage.put('delivered', this.delivered);
        }
        if (!this.delivered) await this.ctx.storage.setAlarm(Date.now() + 5000);
        else await this.ctx.storage.deleteAlarm();
      } else {
        if (Date.now() - this.lastPersist >= 1000) {
          await this.ctx.storage.put('battle', this.battle);
          this.lastPersist = Date.now();
          await this.ctx.storage.setAlarm(Date.now() + 1000);
        }
      }
    } finally { this.busy = false; }
  }
  async alarm() {
    if (!this.battle && this.scheduled !== null) {
      if (Date.now() < this.scheduled) { await this.ctx.storage.setAlarm(this.scheduled); return; }
      const ok = await this.callback(`/api/battles/${encodeURIComponent(this.roomId)}/start`, {});
      // The callback may reenter this object and create the battle before it returns.
      // Preserve the newly installed battle alarm even if its HTTP response was lost.
      if (this.battle) { await this.ctx.storage.setAlarm(Date.now() + 1000); this.start(); }
      else if (!ok) await this.ctx.storage.setAlarm(Date.now() + 5000);
      else { this.scheduled = null; await this.ctx.storage.delete('scheduled'); }
      return;
    }
    await this.tick();
    if (this.battle && !battleResult(this.battle)) this.start();
  }
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const parts = url.pathname.split('/');
    const roomId = parts[2];
    const action = parts[3];
    if (action === 'socket') {
      if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return json({ error: 'WebSocket required' }, 426);
      const user = await identity(url.searchParams.get('ticket') ?? '', roomId, this.env.BATTLE_SERVER_SECRET);
      if (!user) return json({ error: 'Invalid or expired ticket' }, 401);
      const personal = roomId === `player-${user.playerId}` && user.side === 'defender';
      if (roomId.startsWith('player-') && !personal) return json({ error: 'Forbidden' }, 403);
      const b = this.battle as unknown as Record<string, unknown>;
      if (this.battle && !personal && b[user.side === 'attacker' ? 'attackerId' : 'defenderId'] !== user.playerId) return json({ error: 'Forbidden' }, 403);
      const pair = new WebSocketPair();
      pair[1].serializeAttachment({ ...user, active: true, closed: false });
      this.ctx.acceptWebSocket(pair[1]);
      this.refreshPresence();
      pair[1].send(JSON.stringify(this.battle ? { type: 'state', battle: this.snapshot() } : { type: 'update' }));
      return new Response(null, { status: 101, webSocket: pair[0] } as ResponseInit & { webSocket: WebSocket });
    }
    if (!authorized(request, this.env)) return json({ error: 'Unauthorized' }, 401);
    if (request.method === 'GET' && !action) return this.battle ? json({ battle: this.snapshot(true) }) : json({ scheduled: this.scheduled });
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    let body: Record<string, unknown>;
    try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
    if (!body || typeof body !== 'object') return json({ error: 'Invalid body' }, 400);
    if (roomId.startsWith('player-')) {
      if (action !== 'notify') return json({ error: 'Personal hub is read only' }, 403);
      for (const socket of this.ctx.getWebSockets()) { if (!this.validSocket(socket)) continue; try { socket.send(JSON.stringify({ type: 'update' })); } catch {} }
      return json({ ok: true });
    }
    if (action === 'schedule') {
      if (typeof body.arrive !== 'number' || !Number.isFinite(body.arrive)) return json({ error: 'Invalid arrival' }, 400);
      if (this.battle) return json({ ok: true });
      this.roomId = roomId; this.scheduled = body.arrive;
      await this.ctx.storage.put({ roomId, scheduled: this.scheduled });
      await this.ctx.storage.setAlarm(Math.max(Date.now() + 1, this.scheduled));
      return json({ ok: true });
    }
    if (action === 'command') {
      if (!this.battle) return json({ error: 'Battle not started' }, 404);
      if ((body.side !== 'attacker' && body.side !== 'defender') || !validCommand(body.command)) return json({ error: 'Invalid command' }, 400);
      const accepted = body.command.type === 'presence' ? body.side === 'defender' : commandBattle(this.battle, body.side, body.command);
      this.refreshPresence();
      await this.ctx.storage.put('battle', this.battle); this.broadcast();
      return json({ accepted });
    }
    if (action) return json({ error: 'Not found' }, 404);
    if (this.battle) return json({ ok: true, battle: this.snapshot(true) });
    if (!body.battle || typeof body.battle !== 'object' || (body.battle as Record<string, unknown>).id !== roomId) return json({ error: 'Invalid battle' }, 400);
    this.roomId = roomId; this.battle = body.battle as Battle; this.scheduled = null;
    await this.ctx.storage.put({ roomId, battle: this.battle, delivered: false });
    await this.ctx.storage.delete('scheduled');
    await this.ctx.storage.setAlarm(Date.now() + 1000); this.start();
    for (const socket of this.ctx.getWebSockets()) { if (this.validSocket(socket)) socket.send(JSON.stringify({ type: 'state', battle: this.snapshot() })); }
    return json({ ok: true, battle: this.snapshot(true) }, 201);
  }
  async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer) {
    const user = socket.deserializeAttachment() as Identity | null;
    if (!user || user.exp <= Date.now() / 1000) { socket.close(1008, 'Ticket expired'); return; }
    if (user.roomId.startsWith('player-')) return;
    if (typeof message !== 'string' || message.length > 4096 || !this.battle) return;
    const participantId = user.side === 'attacker' ? this.battle.attackerId : this.battle.defenderId;
    if (participantId !== user.playerId) { socket.close(1008, 'Forbidden'); return; }
    try {
      const frame = JSON.parse(message);
      const command = frame?.type === 'command' ? frame.command : frame;
      if (!validCommand(command)) { socket.send(JSON.stringify({ type: 'error', error: 'Invalid command' })); return; }
      const accepted = command.type === 'presence' ? user.side === 'defender' : commandBattle(this.battle, user.side, command);
      if (command.type === 'presence' && user.side === 'defender') socket.serializeAttachment({ ...user, active: command.online });
      this.refreshPresence();
      await this.ctx.storage.put('battle', this.battle);
      socket.send(JSON.stringify({ type: 'ack', accepted })); this.broadcast();
    } catch { socket.send(JSON.stringify({ type: 'error', error: 'Invalid message' })); }
  }
  async webSocketClose(socket: WebSocket, code: number, reason: string) {
    const user = socket.deserializeAttachment() as Identity | null;
    if (user) socket.serializeAttachment({ ...user, active: false, closed: true });
    socket.close(code, reason);
    this.refreshPresence();
    if (this.battle) { await this.ctx.storage.put('battle', this.battle); this.broadcast(); }
  }
  async webSocketError(socket: WebSocket) { await this.webSocketClose(socket, 1011, 'Connection error'); }
}
