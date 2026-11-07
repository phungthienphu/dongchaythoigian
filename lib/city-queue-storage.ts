import type { SyncCommand } from './city-sync';

export type StoredCityQueue = { key:string; commands:SyncCommand[] };
export interface CityQueueStorage {
  load():Promise<StoredCityQueue|undefined>;
  save(value:StoredCityQueue):Promise<void>;
}
export class CityLeaseLostError extends Error {}
const request=<T>(r:IDBRequest<T>)=>new Promise<T>((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
const committed=(t:IDBTransaction)=>{
  const done=new Promise<void>((resolve,reject)=>{t.oncomplete=()=>resolve();t.onabort=()=>reject(t.error??new Error('IndexedDB transaction aborted'));t.onerror=()=>{};});
  void done.catch(()=>{});return done;
};
export class BrowserCityQueueStorage implements CityQueueStorage {
  private db:Promise<IDBDatabase>;
  private owner=crypto.randomUUID();
  private fenced=false;
  constructor(readonly key:string) {
    this.db=new Promise((resolve,reject)=>{
      const r=indexedDB.open('dong-song-city-sync',1);
      r.onupgradeneeded=()=>{r.result.createObjectStore('queues',{keyPath:'key'});r.result.createObjectStore('leases',{keyPath:'key'});};
      r.onsuccess=()=>{r.result.onversionchange=()=>r.result.close();resolve(r.result);};
      r.onerror=()=>reject(r.error);r.onblocked=()=>reject(new Error('IndexedDB is blocked'));
    });
    // Acquisition can fail before the queue awaits this promise.
    void this.db.catch(()=>{});
  }
  async load() {
    const db=await this.db,t=db.transaction('queues','readonly'),done=committed(t);
    const value=await request(t.objectStore('queues').get(this.key));await done;return value as StoredCityQueue|undefined;
  }
  async save(value:StoredCityQueue) {
    const db=await this.db,t=db.transaction(['queues','leases'],'readwrite'),done=committed(t);
    // A lease fence must be checked in the same transaction as the queue write.
    if(this.fenced) {
      const lease=await request(t.objectStore('leases').get(this.key));
      if(lease?.owner!==this.owner || lease.until<=Date.now()){
        t.abort();await done.catch(()=>{});throw new CityLeaseLostError('Tab đã mất quyền điều khiển.');
      }
    }
    t.objectStore('queues').put(value);await done;
  }
  async lease():Promise<boolean> {
    const db=await this.db,t=db.transaction('leases','readwrite'),done=committed(t),store=t.objectStore('leases');
    const old=await request(store.get(this.key));
    const won=!old || old.owner===this.owner || old.until<=Date.now();
    if(won){this.fenced=true;store.put({key:this.key,owner:this.owner,until:Date.now()+15000});}
    await done;return won;
  }
  async release() {
    const db=await this.db,t=db.transaction('leases','readwrite'),done=committed(t),store=t.objectStore('leases');
    const old=await request(store.get(this.key));if(old?.owner===this.owner)store.delete(this.key);await done;
  }
  close(){void this.db.then(db=>db.close()).catch(()=>{});}
}

/** Browser-only coordination. Web Locks releases on crash; fallback leases are
 * atomic IndexedDB transactions and every queue save checks their owner fence. */
export function controlCityTab(key:string,onChange:(active:boolean,storage?:CityQueueStorage)=>void,options:{useWebLocks?:boolean}={}) {
  let disposed=false,held=false,observed=false,release:(()=>void)|undefined,timer:ReturnType<typeof setTimeout>;
  const storage=typeof indexedDB==='undefined'?undefined:new BrowserCityQueueStorage(key);
  const locks=options.useWebLocks===false?undefined:globalThis.navigator?.locks;
  const attempt=async()=>{
    if(disposed)return;
    try {
      if(locks) {
        await locks.request('dong-song-city:'+key,{ifAvailable:true},async lock=>{
          if(!lock){onChange(false);return;}
          if(disposed)return;
          held=true;onChange(true,storage);
          await new Promise<void>(resolve=>{release=resolve;if(disposed)resolve();});
          held=false;
        });
      } else if(storage) {
        const won=await storage.lease();
        if(disposed)return;
        if(!observed||won!==held){observed=true;held=won;onChange(won,won?storage:undefined);}
      } else onChange(false);
    } catch { if(!disposed){held=false;onChange(false);} }
    if(!disposed)timer=setTimeout(()=>void attempt(),held?5000:2000);
  };
  void attempt();
  return ()=>{disposed=true;clearTimeout(timer);release?.();if(!locks&&storage)void storage.release().catch(()=>{}).finally(()=>storage.close());else storage?.close();};
}
