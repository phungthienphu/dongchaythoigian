import { cloneCity } from './clone-city';
import { applyAction, settle, type Action, type City } from './engine';
import type { EngineRules } from './eras';
import { BATCH_DELAY_MS, BATCH_LIMIT, BATCH_BYTES, QUEUE_LIMIT, QUEUE_BYTES, QUEUE_AGE_MS, byteLength,
  validBatch, type SyncCommand, type CitySync, type BatchRequest, type BatchResponse } from './city-sync';
import type { CityQueueStorage } from './city-queue-storage';
import { CityLeaseLostError } from './city-queue-storage';

export type SaveStatus='initializing'|'queued'|'sending'|'saved'|'offline'|'readonly'|'error';
export class SyncTransportError extends Error { constructor(message:string,readonly status:number){super(message);} }
type Options={
  state:City; sync:CitySync; rules?:EngineRules; storage?:CityQueueStorage;
  now?:()=>number; onState:(c:City)=>void; onStatus?:(s:SaveStatus)=>void; onError?:(s:string)=>void;
  send:(request:BatchRequest)=>Promise<BatchResponse>; reload:()=>Promise<BatchResponse>;
  checkpoint?:()=>Promise<BatchResponse>;
  delayMs?:number;
  timers?:{set:(fn:()=>void,ms:number)=>unknown;clear:(id:unknown)=>void};
};
const clone=<T>(v:T):T=>structuredClone(v);

export class BatchedCityQueue {
  private base:City;
  private visible:City;
  private sync:CitySync;
  private pending:SyncCommand[]=[];
  private writes=Promise.resolve();
  private pump:Promise<boolean>|null=null;
  private checkpointTask:Promise<boolean>|null=null;
  private refreshTask:Promise<boolean>|null=null;
  private timer:unknown;
  private ready=false;
  private stopped=false;
  private blocked=false;
  private external=false;
  private recovering=false;
  private durable=true;
  private generation=0;
  private retries=0;
  private state:SaveStatus='initializing';
  private clock:()=>number;
  readonly key:string;
  constructor(private options:Options) {
    this.base=cloneCity(options.state);this.visible=cloneCity(options.state);this.sync=clone(options.sync);
    this.clock=options.now??Date.now;
    this.key=`${this.sync.cityId}:${this.sync.session}:${this.sync.engine}`;
  }
  get isPending(){return !!this.pending.length||this.recovering||!!this.checkpointTask||!!this.refreshTask;}
  get version(){return this.generation;}
  get snapshot(){return cloneCity(this.visible);}
  get status(){return this.state;}
  private statusAs(s:SaveStatus){if(!this.stopped){this.state=s;this.options.onStatus?.(s);}}
  private publish(){if(!this.stopped)this.options.onState(cloneCity(this.visible));}
  async initialize() {
    try {
      const saved=await this.options.storage?.load();
      if(this.stopped)return;
      if(saved) {
        if(saved.key!==this.key || !Array.isArray(saved.commands) || saved.commands.length>QUEUE_LIMIT || byteLength(saved)>QUEUE_BYTES)throw new Error('Invalid saved queue');
        for(let n=0;n<saved.commands.length;n+=BATCH_LIMIT) {
          if(!validBatch({engine:this.sync.engine,session:this.sync.session,commands:saved.commands.slice(n,n+BATCH_LIMIT)}))throw new Error('Invalid saved commands');
        }
        if(saved.commands.some((c,n)=>n>0&&(c.seq!==saved.commands[n-1].seq+1||c.at<saved.commands[n-1].at)))throw new Error('Invalid saved sequence');
        this.pending=clone(saved.commands).filter(c=>c.seq>this.sync.ack);
        if(this.pending.length && this.pending[0].seq!==this.sync.ack+1){this.blocked=true;this.options.onError?.('Hàng đợi thiếu thao tác. Tiến trình đã lưu vẫn được giữ; cần đối chiếu trước khi chơi tiếp.');}
      }
      this.durable=!!this.options.storage;
    } catch {
      // Unknown local data may contain accepted but unacknowledged commands.
      // Never replace it with an empty queue or reuse its sequence numbers.
      this.statusAs('error');this.stop();
      this.options.onError?.('Không đọc được hàng đợi trên máy. Dữ liệu được giữ nguyên; hãy tải lại trang để thử đọc lại trước khi chơi tiếp.');
      return;
    }
    if(this.stopped)return;
    this.ready=true;this.replay();
    this.statusAs(this.blocked?'error':this.pending.length?'queued':'saved');
    if(this.pending.length&&!this.blocked)void this.flush();
  }
  private clearTimer(){if(this.options.timers)this.options.timers.clear(this.timer);else clearTimeout(this.timer as ReturnType<typeof setTimeout>);this.timer=undefined;}
  stop(){this.stopped=true;this.clearTimer();}
  advance(at=this.clock()) {
    if(this.stopped)return;
    if(!this.visible.battleId)settle(this.visible,Math.max(at,this.visible.last));
    this.publish();
  }
  setAuthoritative(state:City,expected=this.generation,sync?:CitySync) {
    if(this.stopped||this.isPending||expected!==this.generation||state.last<this.base.last)return false;
    if(sync && (!this.sameSession(sync)||sync.revision<this.sync.revision||sync.ack<this.sync.ack))return false;
    if(sync)this.sync=clone(sync);
    this.base=cloneCity(state);this.replay();return true;
  }
  private sameSession(sync:CitySync){return sync.cityId===this.sync.cityId&&sync.session===this.sync.session&&sync.engine===this.sync.engine;}
  async enqueue(action:Action):Promise<boolean> {
    if(this.stopped||!this.ready||this.blocked||this.external){this.options.onError?.('Làng đang đồng bộ hoặc được điều khiển ở tab khác.');return false;}
    const at=Math.max(Math.floor(this.clock()),this.pending.at(-1)?.at??0);
    if(at>this.sync.until){this.options.onError?.('Cần nối lại máy chủ để lấy mốc thời gian mới.');void this.refresh();return false;}
    if(this.pending.length>=QUEUE_LIMIT || (this.pending[0] && at-this.pending[0].at>QUEUE_AGE_MS)) {
      this.options.onError?.('Hàng đợi đã đầy hoặc quá lâu. Hãy nối mạng để lưu trước khi tiếp tục.');return false;
    }
    const entry:SyncCommand={seq:(this.pending.at(-1)?.seq??this.sync.ack)+1,id:crypto.randomUUID(),at,anchor:this.sync.anchor,action:clone(action)};
    if(byteLength({...entry,action})>BATCH_BYTES-1024 || byteLength([...this.pending,entry])>QUEUE_BYTES){this.options.onError?.('Thao tác quá lớn để lưu. Hãy chọn ít dân hơn mỗi lần.');return false;}
    const next=cloneCity(this.visible),error=applyAction(next,entry.action,at,this.options.rules);
    if(error){this.options.onError?.(error);return false;}
    this.pending.push(entry);this.visible=next;this.generation++;this.statusAs('queued');this.publish();
    await this.persist();
    if(this.stopped)return false;
    if(this.recovering)return true; // Preserve retry backoff while collecting offline commands.
    if(this.pending.length>=BATCH_LIMIT || !this.durable || this.options.delayMs===0)void this.flush();
    else if(!this.timer&&!this.pump)this.schedule(Math.max(0,(this.pending[0]?.at??at)+(this.options.delayMs??BATCH_DELAY_MS)-this.clock()));
    return true;
  }
  private persist() {
    const save=async()=>{
      if(this.stopped||!this.options.storage)return;
      try {await this.options.storage.save({key:this.key,commands:clone(this.pending)});}
      catch(e) {
        if(e instanceof CityLeaseLostError){this.statusAs('readonly');this.stop();return;}
        this.durable=false;
        this.options.onError?.('Không lưu được trên máy. Đang gửi ngay; giữ trang mở đến khi báo Đã lưu.');
      }
    };
    this.writes=this.writes.then(save);return this.writes;
  }
  private schedule(ms:number){this.clearTimer();const run=()=>{this.timer=undefined;void this.flush();};this.timer=this.options.timers?this.options.timers.set(run,ms):setTimeout(run,ms);}
  private replay() {
    let state=cloneCity(this.base);
    for(const c of this.pending) {
      if(state.battleId)break;
      const next=cloneCity(state);
      // A rejected optimistic replay stays in the durable queue until server ACK.
      if(!applyAction(next,c.action,Math.max(c.at,state.last),this.options.rules))state=next;
    }
    if(!state.battleId)settle(state,Math.max(this.visible.last,this.clock()));
    this.visible=state;this.generation++;this.publish();
  }
  private async accept(response:BatchResponse) {
    if(this.stopped)return;
    if(!this.sameSession(response.sync)) {this.statusAs('error');this.stop();this.options.onError?.('Phiên hoặc phiên bản game đã đổi. Hàng đợi cũ được giữ riêng.');return;}
    if(response.sync.revision<this.sync.revision || response.sync.ack<this.sync.ack)return;
    for(const c of this.pending.filter(c=>c.seq<=response.sync.ack)) {
      const r=response.sync.results.find(r=>r.seq===c.seq);
      if(!r || r.id!==c.id)this.options.onError?.('Máy chủ đã chốt sequence này ở nơi khác. Thao tác chờ ở tab này không được tự gửi lại; hãy kiểm tra làng.');
      else if(r?.error)this.options.onError?.(r.error);
      else if(r?.rescheduled)this.options.onError?.('Làng có cập nhật từ bên ngoài; thao tác chờ đã được áp theo trạng thái mới.');
    }
    this.pending=this.pending.filter(c=>c.seq>response.sync.ack);
    this.sync=clone(response.sync);this.base=cloneCity(response.state);this.replay();await this.persist();
    if(response.batchEnabled!==undefined) {
      this.options.delayMs=response.batchEnabled?BATCH_DELAY_MS:0;
      if(!response.batchEnabled&&this.pending.length&&!this.pump&&!this.blocked)this.schedule(0);
    }
  }
  refresh():Promise<boolean> {
    if(this.stopped||this.pump)return Promise.resolve(false);
    return this.refreshTask??=this.options.reload().then(async response=>{
      await this.accept(response);this.recovering=false;if(!this.pending.length)this.blocked=false;
      this.statusAs(this.blocked?'error':this.pending.length?'queued':'saved');return !this.stopped;
    }).catch(()=>{this.statusAs('offline');return false;}).finally(()=>{this.refreshTask=null;});
  }
  flush():Promise<boolean> {
    this.clearTimer();
    if(this.stopped||!this.ready||this.blocked)return Promise.resolve(false);
    if(this.checkpointTask)return this.checkpointTask.then(ok=>ok?this.flush():false);
    return this.pump??=this.drain().finally(()=>{this.pump=null;});
  }
  checkpointIfDue():Promise<boolean> {
    if(this.stopped||!this.ready||this.blocked||this.external||this.isPending||this.pump||this.base.battleId
      || !this.options.checkpoint||this.sync.checkpointAt===undefined||this.clock()-this.sync.checkpointAt<5*60_000)return Promise.resolve(false);
    this.statusAs('sending');
    return this.checkpointTask=this.options.checkpoint().then(async value=>{
      await this.accept(value);this.statusAs(this.pending.length?'queued':'saved');return true;
    }).catch(()=>{this.statusAs('offline');return false;}).finally(()=>{this.checkpointTask=null;});
  }
  private async drain():Promise<boolean> {
    await this.writes;
    try {
      if(this.recovering){await this.accept(await this.options.reload());this.recovering=false;}
      while(this.pending.length&&!this.stopped) {
        await this.writes;if(this.stopped)return false;
        const commands:SyncCommand[]=[];
        for(const c of this.pending.slice(0,BATCH_LIMIT)) {
          if(byteLength({engine:this.sync.engine,session:this.sync.session,commands:[...commands,c]})>BATCH_BYTES)break;
          commands.push(clone(c));
        }
        if(!commands.length)throw new SyncTransportError('Thao tác đã lưu quá lớn. Cần đối chiếu hàng đợi.',400);
        this.statusAs('sending');
        const response=await this.options.send({engine:this.sync.engine,session:this.sync.session,commands});
        if(response.sync.ack<commands.at(-1)!.seq)throw new Error('Missing durable ACK');
        await this.accept(response);
      }
      this.retries=0;this.statusAs('saved');return !this.stopped;
    } catch(e) {
      if(this.stopped)return false;
      this.recovering=true;
      if(e instanceof SyncTransportError && [400,403,409,413].includes(e.status)) {
        // Fetch ACK once: conflict may be a committed request with a lost response.
        try{await this.accept(await this.options.reload());}catch{}
        this.recovering=false;this.blocked=!!this.pending.length;this.statusAs(this.blocked?'error':'saved');
        this.options.onError?.(e.message);return !this.blocked;
      }
      this.statusAs('offline');this.schedule(Math.min(30000,1000*2**Math.min(this.retries++,5)));return false;
    }
  }
  async exclusive<T>(run:()=>Promise<T>):Promise<T> {
    if(this.external||this.stopped||!this.ready)throw new Error('Làng đang được cập nhật.');
    this.external=true;
    try {
      if(!await this.flush())throw new Error('Chưa lưu được thao tác chờ. Hãy nối mạng rồi thử lại.');
      return await run();
    } finally {
      // Even an ambiguous external response may have changed the village.
      if(!this.stopped) {
        try{await this.accept(await this.options.reload());}
        catch{this.blocked=true;this.statusAs('offline');this.options.onError?.('Chưa đối chiếu được làng sau thao tác. Hãy nối mạng để tiếp tục.');}
      }
      this.external=false;
    }
  }
}
