/** Map overlay for the mana network (sources, relays, links, seals).
 *
 * The UI owns the on/off flag; the map renderer reads it. Renderer contract:
 *   import {manaOverlayEnabled,manaOverlay} from '@/lib/mana-overlay';
 *   if(manaOverlayEnabled()&&city.magic){const o=manaOverlay(city); ...draw o...}
 * `manaOverlay` is cached per network topology and settled minute, so calling it
 * every frame is cheap. Tiles are map indices (x = tile % 96, y = tile / 96). */
import type {City} from './engine';
import {magicDef,type Element,type MagicBuilding} from './magic-data';
import {SEAL_STATIONS} from './magic-elements';
import {SOURCES,operating} from './magic';
import {magicSites,manaLinks,type ManaLink} from './magic-view';

let enabled=false;
const listeners=new Set<()=>void>();
export const manaOverlayEnabled=()=>enabled;
export function setManaOverlay(on:boolean){if(on===enabled)return;enabled=on;for(const l of listeners)l();}
export function subscribeManaOverlay(listener:()=>void){listeners.add(listener);return ()=>{listeners.delete(listener);};}

export type ManaOverlay={
 /** Mana sources: coverage radius 6, fill = stored / capacity (0..1). */
 sources:{tile:number;radius:number;fill:number;active:boolean}[];
 /** Relay posts: reach radius 6. */
 relays:{tile:number;radius:number;active:boolean}[];
 /** Segments of each receiver's primary (and backup) chain. */
 links:ManaLink[];
 /** Receivers: ok = bound to a source and not blocked; reason when not. */
 receivers:{tile:number;ok:boolean;reason?:string}[];
 /** Seal stations: element service radius 6. */
 seals:{tile:number;element:Element;radius:number;active:boolean}[];
};
let cache:{key:string;city:City;value:ManaOverlay}|undefined;
export function manaOverlay(c:City):ManaOverlay{
 const m=c.magic;if(!m)return {sources:[],relays:[],links:[],receivers:[],seals:[]};
 const key=`${m.topology}|${m.minuteAt}`;if(cache&&cache.city===c&&cache.key===key)return cache.value;
 const sites=magicSites(c),value:ManaOverlay={sources:[],relays:[],links:manaLinks(c),receivers:[],seals:[]};
 for(const s of sites){const d=magicDef(s.b.k as MagicBuilding),active=operating(s.b);
  if(SOURCES.has(s.b.k)){const cap=m.network.sources[s.id]?.capacity||1;value.sources.push({tile:s.tile,radius:6,fill:Math.max(0,Math.min(1,(m.mana[s.id]??0)/cap)),active});continue;}
  if(d.relay){value.relays.push({tile:s.tile,radius:6,active});continue;}
  const element=SEAL_STATIONS[s.b.k];if(element)value.seals.push({tile:s.tile,element,radius:6,active:active&&!!m.factories[s.id]&&!m.factories[s.id].blocked});
  const bind=m.network.bindings[s.id];if(bind){const blocked=m.factories[s.id]?.blocked,reason=bind.reason??blocked;value.receivers.push({tile:s.tile,ok:!!bind.primary&&!blocked,...(reason?{reason}:{})});}
 }
 cache={key,city:c,value};return value;
}
