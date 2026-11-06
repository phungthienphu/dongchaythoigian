import {RES,UKEYS,UNITS,isBuildingActive,troopCount,type City,type Troops} from './engine';
import type {MarketAction,Caravan,CaravanView,Point} from './market-types';
import {knowsNation} from './world-discovery';
export const CARAVAN_CELLS_PER_MIN=2;
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
const whole=(v:unknown,max=1000000)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0&&v<=max;
const resource=(v:unknown)=>RES.includes(v as typeof RES[number]);
export function validTradeTroops(v:unknown):v is Troops{return record(v)&&Object.entries(v).every(([u,n])=>UKEYS.includes(u as typeof UKEYS[number])&&typeof n==='number'&&Number.isSafeInteger(n)&&n>=0&&n<=100)&&troopCount(v as Troops)<=100;}
export function validMarketAction(v:unknown):v is MarketAction{
 if(!record(v)||typeof v.requestId!=='string'||!/^[a-zA-Z0-9_-]{8,100}$/.test(v.requestId))return false;
 if(v.type==='create')return resource(v.resource)&&resource(v.currency)&&v.resource!==v.currency&&whole(v.amount)&&whole(v.price)&&validTradeTroops(v.escorts);
 return ['buy','cancel','raid'].includes(v.type as string)&&typeof v.id==='string'&&v.id.length>0&&v.id.length<=210&&(v.type!=='raid'||validTradeTroops(v.units));
}
export const hasMarket=(c:City)=>Object.values(c.b).some(b=>b.k==='market'&&isBuildingActive(b));
export const fighters=(t:Troops)=>UKEYS.reduce((n,u)=>n+(UNITS[u].atk>0?t[u]??0:0),0);
export function caravanPosition(c:Pick<Caravan,'from'|'to'|'depart'|'arrive'|'raid'>,now:number):Point{
 if(c.raid && now>=c.raid.meetAt){
  const fight=c.raid.fight;
  if(!fight?.finished || c.raid.won)return {...c.raid.to};
  const t=Math.max(0,Math.min(1,(now-fight.last)/Math.max(1,c.arrive-fight.last)));
  return {x:c.raid.to.x+(c.to.x-c.raid.to.x)*t,y:c.raid.to.y+(c.to.y-c.raid.to.y)*t};
 }
 const t=Math.max(0,Math.min(1,(now-c.depart)/Math.max(1,c.arrive-c.depart)));
 return {x:c.from.x+(c.to.x-c.from.x)*t,y:c.from.y+(c.to.y-c.from.y)*t};
}
/** Solve the earliest intercept along the moving route at twice caravan speed. */
export function interception(c:Caravan,from:Point,now:number):{meetAt:number;point:Point}|null{
 if(now>=c.arrive||c.status!=='travelling'||c.raid)return null;
 const reachable=(at:number)=>{const p=caravanPosition(c,at);return Math.hypot(from.x-p.x,from.y-p.y)/4*60000<=at-now;};
 if(!reachable(c.arrive-1000))return null;
 let lo=now,hi=c.arrive-1000;for(let i=0;i<35;i++){const mid=(lo+hi)/2;if(reachable(mid))hi=mid;else lo=mid;}
 const meetAt=Math.max(now+5000,Math.ceil(hi/1000)*1000);return meetAt<c.arrive?{meetAt,point:caravanPosition(c,meetAt)}:null;
}
export function caravanView(c:Caravan,pid:string,city:City):CaravanView|null{
 const mine=c.seller===pid||c.buyer===pid||c.raid?.by===pid;
 const visible=knowsNation(city,c.seller)&&knowsNation(city,c.buyer);
 if(!mine&&!visible)return null;
 const {from,to,raid,...base}=c;
 const routeKnown=(pid===c.seller||knowsNation(city,c.seller))&&(pid===c.buyer||knowsNation(city,c.buyer));
 return {...base,mine,canRaid:!mine&&visible&&c.status==='travelling'&&!raid,...(routeKnown?{from,to}:{}),...(raid?{raid:(()=>{const {from,to,requestId:_request,...rest}=raid;return{...rest,...(pid===raid.by||knowsNation(city,raid.by)?{from}:{}),...(routeKnown?{to}:{})};})()}: {})};
}

/** Only use explicitly disclosed coordinates. Returning carts follow the same route home. */
export function caravanMapPosition(c:CaravanView,now:number):Point|null{
 if(!c.from||!c.to||c.status==='completed'||c.escortsReturned)return null;
 const r=c.raid;
 if(r?.to&&now>=r.meetAt){
  if(!r.fight?.finished)return r.to;
  if(r.won){const f=Math.max(0,Math.min(1,(now-r.fight.last)/Math.max(1,c.back-r.fight.last)));return{x:r.to.x+(c.from.x-r.to.x)*f,y:r.to.y+(c.from.y-r.to.y)*f};}
  if(now<c.arrive){const f=Math.max(0,Math.min(1,(now-r.fight.last)/Math.max(1,c.arrive-r.fight.last)));return{x:r.to.x+(c.to.x-r.to.x)*f,y:r.to.y+(c.to.y-r.to.y)*f};}
 }
 if(now>=c.arrive){const f=Math.max(0,Math.min(1,(now-c.arrive)/Math.max(1,c.back-c.arrive)));return{x:c.to.x+(c.from.x-c.to.x)*f,y:c.to.y+(c.from.y-c.to.y)*f};}
 const f=Math.max(0,Math.min(1,(now-c.depart)/Math.max(1,c.arrive-c.depart)));return{x:c.from.x+(c.to.x-c.from.x)*f,y:c.from.y+(c.to.y-c.from.y)*f};
}
