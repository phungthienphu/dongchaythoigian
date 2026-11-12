import {W,H,R,isRock,isBuildingActive,type City,type Person,type Building} from './engine';
import {bridgeDeck} from './bridges';
import {careCapacity} from './magic-myth';

const SECOND=1000,MINUTE=60000;
export type AmbulanceMission={id:number;hospital:number;uid:number;slot:number;driver:number;patient?:number;phase:'outbound'|'aid'|'inbound'|'returning'|'treating';x:number;y:number;route:number[];edge:number;last:number;retryAt:number;blockedAt?:number;aidAt?:number;pickedAt?:number;end?:number;remaining?:number;failure?:string;topology:string;};
export type MedicalState={version:1;nextId:number;missions:AmbulanceMission[];disabled:number[]};
const routeCache=new WeakMap<City,{signature:string;trees:Map<number,Int32Array>}>();
type Context={position:(c:City,p:Person,at:number)=>{x:number;y:number};resume:(p:Person,at:number)=>void;clinicRoute:(from:number,to:number)=>number[]|null};
const tile=(x:number,y:number)=>Math.max(0,Math.min(H-1,Math.floor(y)))*W+Math.max(0,Math.min(W-1,Math.floor(x)));
const center=(i:number)=>({x:i%W+.5,y:Math.floor(i/W)+.5});
export const medicalProtected=(p:Person)=>p.vital?.ambulance!==undefined;
export const medicalMissions=(c:City)=>c.medical?.missions??[];
export const medicalReserved=(m:AmbulanceMission)=>m.patient!==undefined&&m.phase!=='returning';
export function medicalTopology(c:City){let h=2166136261;for(let i=0;i<W*H;i++)h=Math.imul(h^(c.t[i]+(c.seen[i]?32:0)),16777619);for(const k of Object.keys(c.b).sort((a,b)=>+a-+b)){const b=c.b[+k];for(const ch of `${k}:${b.k}:${b.lvl}:${b.doneAt}:${b.flooded}:${b.burned}:${b.off}:${b.uid}`)h=Math.imul(h^ch.charCodeAt(0),16777619);}return String(h>>>0);}
function pass(c:City,i:number,deck:ReadonlySet<number>,hospital:number){if(i<0||i>=W*H||!c.seen[i]||isRock(c.t[i])||c.t[i]===R&&!deck.has(i))return false;const b=c.b[i];return i===hospital||!b||['gate','farm','estate','canal','levee','ironbridge','bridgehead'].includes(b.k);}
// One BFS serves every patient considered for the same hospital in a dispatch pass.
function search(c:City,start:number,hospital:number,deck:ReadonlySet<number>){const prev=new Int32Array(W*H);prev.fill(-1);prev[start]=start;const q=[start];for(let h=0;h<q.length;h++){const i=q[h],x=i%W,y=Math.floor(i/W);for(const j of [x>0?i-1:-1,x<W-1?i+1:-1,y>0?i-W:-1,y<H-1?i+W:-1])if(j>=0&&prev[j]===-1&&pass(c,j,deck,hospital)){prev[j]=i;q.push(j);}}return prev;}
function path(prev:Int32Array,to:number){if(prev[to]<0)return null;const result=[to];while(prev[result[result.length-1]]!==result[result.length-1])result.push(prev[result[result.length-1]]);return result.reverse();}
function patientPath(c:City,prev:Int32Array,pos:{x:number;y:number}){const i=tile(pos.x,pos.y),x=i%W,y=Math.floor(i/W);let best:number[]|null=null;for(const j of [i,x>0?i-1:-1,x<W-1?i+1:-1,y>0?i-W:-1,y<H-1?i+W:-1])if(j>=0){const p=path(prev,j);if(p&&(!best||p.length<best.length))best=p;}return best;}
function powered(c:City,i:number){return isBuildingActive(c.b[i])&&(c.modern?.allocation[i]??0)>0;}
function staff(c:City,i:number){return c.people.filter(p=>p.task.t==='work'&&p.task.at===i&&p.vital?.downAt===undefined&&p.vital?.infectedAt===undefined&&!p.refuge);}
function stamp(c:City,i:number){const b=c.b[i];if(b.uid===undefined)b.uid=1+Math.max(0,...Object.values(c.b).map(b=>b.uid??0));return b.uid;}
export function ambulancePosition(c:City,id:number){const m=medicalMissions(c).find(m=>m.id===id);return m?{x:m.x,y:m.y}:null;}
export function medicalPause(c:City,elapsed:number){for(const p of c.people)if(p.vital?.medicalTransportUntil!==undefined)p.vital.medicalTransportUntil+=elapsed;for(const m of medicalMissions(c)){for(const k of ['last','retryAt','blockedAt','aidAt','pickedAt','end'] as const)if(m[k]!==undefined)m[k]!+=elapsed;}}
export function hospitalMedicalView(c:City,i:number){const b=c.b[i],missions=medicalMissions(c),own=missions.filter(m=>m.hospital===i&&m.uid===b?.uid),workers=staff(c,i),used=missions.filter(m=>m.hospital===i&&medicalReserved(m)).length+c.people.filter(p=>p.vital?.care?.tile===i).length;return {capacity:careCapacity(c,12),used,treating:own.filter(m=>m.phase==='treating').length,reserved:own.filter(m=>medicalReserved(m)&&m.phase!=='treating').length,cars:b?Math.min(3,b.lvl):0,busy:own.filter(m=>m.phase!=='treating').length,workers:workers.length,enabled:!c.medical?.disabled.includes(i),powered:!!b&&powered(c,i),missions:own};}

export function stepMedical(c:City,at:number,ctx:Context){
 let cleaned=false;for(const p of c.people){const v=p.vital;if(v&&v.downAt===undefined&&v.infectedAt===undefined&&!medicalProtected(p)&&(v.medicalTransportUntil!==undefined||v.medicalRetry!==undefined)){delete v.medicalTransportUntil;delete v.medicalRetry;delete v.medicalWait;cleaned=true;}}
 const hospitals=Object.entries(c.b).filter(([,b])=>(b.k==='hospital'||b.k==='healer')&&b.lvl>0).sort(([a],[b])=>+a-+b);
 if(!hospitals.length&&!c.medical?.missions.length)return cleaned;
 const needs=c.people.some(p=>p.vital&&(p.vital.downAt!==undefined||p.vital.infectedAt!==undefined));
 if(!needs&&!c.medical?.missions.length)return cleaned;
 const state=c.medical??={version:1,nextId:1,missions:[],disabled:[]};
 const staffIndex=new Map<number,Person[]>(),legacyBeds=new Map<number,number>();
 for(const p of c.people){if(p.task.t==='work'&&p.vital?.downAt===undefined&&p.vital?.infectedAt===undefined&&!p.refuge){const list=staffIndex.get(p.task.at)??[];list.push(p);staffIndex.set(p.task.at,list);}if(p.vital?.care)legacyBeds.set(p.vital.care.tile,(legacyBeds.get(p.vital.care.tile)??0)+1);}
 for(const list of staffIndex.values())list.sort((a,b)=>a.id-b.id);
 const staffAt=(i:number)=>staffIndex.get(i)??[];
 const people=new Map(c.people.map(p=>[p.id,p])),deck=bridgeDeck(c),signature=medicalTopology(c);let changed=cleaned;
 const release=(m:AmbulanceMission)=>{const d=people.get(m.driver);if(d?.vital?.ambulance===m.id){delete d.vital.ambulance;d.vital.paused=false;d.pos=tile(m.x,m.y);ctx.resume(d,at);}};
 const drop=(m:AmbulanceMission,reason:string)=>{const p=people.get(m.patient??-1);if(p?.vital){if(p.vital.ambulance===m.id){delete p.vital.ambulance;if(p.vital.downAt!==undefined)p.vital.downAt=at-(10*MINUTE-(m.remaining??0));p.vital.last=at;p.vital.x=m.x;p.vital.y=m.y;p.pos=tile(m.x,m.y);p.vital.paused=p.vital.downAt!==undefined;}p.vital.medicalRetry=`${signature}:${m.hospital}:${m.uid}:${m.driver}`;}delete m.patient;delete m.pickedAt;m.phase='returning';m.route=[];m.edge=0;m.retryAt=at;m.failure=reason;changed=true;};
 const done=new Set<number>();
 for(const m of state.missions){
  const p=people.get(m.patient??-1),d=people.get(m.driver),b=c.b[m.hospital],valid=!!b&&b.k==='hospital'&&b.uid===m.uid&&isBuildingActive(b);
  const elapsed=Math.max(0,at-m.last);m.last=at;if(elapsed>0)changed=true;
  if(m.phase==='treating'){
   if(!p?.vital){done.add(m.id);continue;}
   if(!valid){drop(m,'Bệnh viện không còn hoạt động');release(m);done.add(m.id);continue;}
   if(powered(c,m.hospital)&&staffAt(m.hospital).length){if(at>=m.end!){p.vital.hp=Math.max(50,p.vital.hp);delete p.vital.infectedAt;delete p.vital.downAt;delete p.vital.medicalTransportUntil;delete p.vital.medicalRetry;delete p.vital.ambulance;p.vital.paused=false;p.vital.last=at;p.pos=m.hospital;Object.assign(p.vital,center(m.hospital));ctx.resume(p,at);done.add(m.id);changed=true;}}
   else m.end!+=elapsed;
   if(p.vital.infectedAt!==undefined)p.vital.infectedAt+=elapsed;
   if(p.vital.downAt!==undefined)p.vital.downAt+=elapsed;
   continue;
  }
  if(!valid||!d||d.task.t!=='work'||d.task.at!==m.hospital||d.vital?.downAt!==undefined){drop(m,'Mất bệnh viện hoặc kíp cứu thương');release(m);done.add(m.id);continue;}
  if(m.patient!==undefined&&!p)drop(m,'Bệnh nhân không còn');
  if(m.pickedAt!==undefined&&at>=(p?.vital?.medicalTransportUntil??m.pickedAt+20*MINUTE))drop(m,'Hết thời gian ổn định trên xe');
  if(m.phase==='inbound'&&p?.vital){if(p.vital.downAt!==undefined)p.vital.downAt+=elapsed;if(p.vital.infectedAt!==undefined)p.vital.infectedAt+=elapsed;p.vital.last=at;}
  const target=m.phase==='outbound'||m.phase==='aid'?p?ctx.position(c,p,at):center(m.hospital):center(m.hospital);
  const destination=tile(target.x,target.y),current=tile(m.x,m.y);
  const reached=()=>m.phase==='outbound'||m.phase==='aid'?(Math.abs(tile(m.x,m.y)%W-destination%W)+Math.abs(Math.floor(tile(m.x,m.y)/W)-Math.floor(destination/W))<=1&&Math.hypot(m.x-target.x,m.y-target.y)<=1.6):Math.hypot(m.x-target.x,m.y-target.y)<.01;
  const badRoute=m.topology!==signature||!m.route.length||!pass(c,m.route[Math.min(m.edge+1,m.route.length-1)],deck,m.hospital)||((m.phase==='outbound'||m.phase==='aid')&&Math.abs(m.route.at(-1)!%W-destination%W)+Math.abs(Math.floor(m.route.at(-1)!/W)-Math.floor(destination/W))>1);
  if(!reached()&&badRoute&&at>=m.retryAt){const prev=search(c,current,m.hospital,deck),route=m.phase==='outbound'||m.phase==='aid'?patientPath(c,prev,target):path(prev,m.hospital);m.topology=signature;m.retryAt=at+5*SECOND;m.route=route??[];m.edge=Math.hypot(m.x-center(current).x,m.y-center(current).y)>.001?-1:0;if(!route)m.blockedAt??=at;else delete m.blockedAt;}
  if(!reached()&&m.route.length&&pass(c,m.route[Math.min(m.edge+1,m.route.length-1)],deck,m.hospital)){
   let distance=elapsed/SECOND*2;
   while(distance>0&&m.edge<m.route.length-1){if(!pass(c,m.route[m.edge+1],deck,m.hospital)){m.route=[];m.edge=0;m.blockedAt??=at;break;}const q=center(m.route[m.edge+1]),dx=q.x-m.x,dy=q.y-m.y,len=Math.hypot(dx,dy);if(len<=distance){m.x=q.x;m.y=q.y;m.edge++;distance-=len;}else{m.x+=dx/len*distance;m.y+=dy/len*distance;distance=0;}}
  }
  if(m.blockedAt!==undefined&&at-m.blockedAt>=MINUTE&&m.phase==='outbound')drop(m,'Đường đi bị chặn');
  if(m.phase==='aid'&&!reached()){m.phase='outbound';delete m.aidAt;}
  if(reached()){
   if(m.phase==='outbound'){m.phase='aid';m.aidAt=at+30*SECOND;changed=true;}
   else if(m.phase==='aid'&&at>=m.aidAt!&&p?.vital){if(p.vital.downAt!==undefined&&at>=p.vital.downAt+10*MINUTE){drop(m,'Không kịp sơ cứu');}else{m.remaining=p.vital.downAt===undefined?undefined:p.vital.downAt+10*MINUTE-at;m.pickedAt=at;p.vital.medicalTransportUntil??=at+20*MINUTE;m.phase='inbound';m.route=[];m.retryAt=at;p.vital.ambulance=m.id;p.vital.paused=true;p.vital.last=at;changed=true;}}
   else if(m.phase==='inbound'&&p?.vital){m.phase='treating';m.end=at+(c.magic?.boosted.includes(m.hospital)?20:30)*MINUTE;release(m);changed=true;}
   else if(m.phase==='returning'){release(m);done.add(m.id);changed=true;}
  }
  if(d?.vital?.ambulance===m.id){d.vital.x=m.x;d.vital.y=m.y;}
  if(p?.vital?.ambulance===m.id){p.vital.x=m.x;p.vital.y=m.y;}
 }
 state.missions=state.missions.filter(m=>!done.has(m.id));
 // Stable triage independent of people/snapshot ordering.
 const reserved=new Set(state.missions.filter(m=>m.patient!==undefined).map(m=>m.patient!));
 const patients=c.people.filter(p=>p.vital&&!p.vital.care&&!medicalProtected(p)&&!reserved.has(p.id)&&(p.vital.downAt!==undefined||p.vital.infectedAt!==undefined)).sort((a,b)=>{
  const av=a.vital!,bv=b.vital!;return Number(bv.downAt!==undefined)-Number(av.downAt!==undefined)||(av.downAt!==undefined&&bv.downAt!==undefined?av.downAt-bv.downAt:av.hp-bv.hp||(av.infectedAt??0)-(bv.infectedAt??0))||a.id-b.id;
 });
 let cached=routeCache.get(c);if(!cached||cached.signature!==signature){cached={signature,trees:new Map()};routeCache.set(c,cached);}
 const searches=cached.trees;
 for(const p of patients){
  if(p.vital!.medicalTransportUntil!==undefined&&at>=p.vital!.medicalTransportUntil){p.vital!.medicalWait='Đã hết thời gian ổn định trên xe';continue;}
  let reason='Chưa có cơ sở cứu thương';
  let best:{i:number;b:Building;driver:Person;slot:number;route:number[];eta:number}|undefined;
  for(const [key,b]of hospitals){const i=+key,clinic=b.k==='healer';if(!isBuildingActive(b)||!clinic&&!powered(c,i)){reason='Bệnh viện chưa hoạt động hoặc thiếu điện';continue;}if(!clinic&&state.disabled.includes(i)){reason='Bệnh viện đã tắt tự điều xe';continue;}
   if(clinic&&Math.hypot(ctx.position(c,p,at).x-center(i).x,ctx.position(c,p,at).y-center(i).y)>6)continue;
   const own=state.missions.filter(m=>m.hospital===i&&m.uid===b.uid),used=own.filter(medicalReserved).length+(legacyBeds.get(i)??0);if(used>=careCapacity(c,clinic?[0,2,3,4][b.lvl]:12)){reason='Hết giường trống';continue;}if(c.res.food<(clinic?40:80)||!clinic&&c.res.gold<10){reason='Thiếu thực hoặc vàng';continue;}
   const busy=new Set(own.filter(m=>m.phase!=='treating').map(m=>m.slot));let slot=0;while(busy.has(slot))slot++;if(!clinic&&slot>=Math.min(3,b.lvl)){reason='Tất cả xe đang chạy';continue;}
   const driver=staffAt(i).filter(d=>Math.hypot(ctx.position(c,d,at).x-center(i).x,ctx.position(c,d,at).y-center(i).y)<=1.6&&!d.vital?.paused&&!d.vital?.care&&!d.vital?.rescuing&&!medicalProtected(d)&&!(d.haul?.carried)).sort((a,b)=>a.id-b.id)[0];if(!driver){reason='Chưa có thợ sẵn sàng tại cơ sở';continue;}
   const uid=stamp(c,i);if(p.vital?.medicalRetry===`${signature}:${i}:${uid}:${driver.id}`)continue;
   let prev=searches.get(i);if(!prev){prev=search(c,i,i,deck);if(searches.size>=8)searches.delete(searches.keys().next().value!);searches.set(i,prev);}const route=clinic?ctx.clinicRoute(i,tile(ctx.position(c,p,at).x,ctx.position(c,p,at).y)):patientPath(c,prev,ctx.position(c,p,at));if(!route){reason='Không có đường tới bệnh nhân';continue;}const eta=(route.length-1)/(clinic?1.2:2)*SECOND+30*SECOND;
   if(p.vital?.downAt!==undefined&&at+eta>=p.vital.downAt+10*MINUTE){reason='Không kịp đến và sơ cứu trước hạn';continue;}
   if(!best||eta<best.eta||eta===best.eta&&i<best.i)best={i,b,driver,slot,route,eta};
  }
  if(!best){if(p.vital!.medicalWait!==reason){p.vital!.medicalWait=reason;changed=true;}continue;}
  delete p.vital!.medicalWait;
  if(best){const {i,b,driver,slot,route}=best;
   if(b.k==='healer'){legacyBeds.set(i,(legacyBeds.get(i)??0)+1);const travel=Math.max(1,route.length-1)*SECOND/1.2;c.res.food-=40;const v=p.vital!;v.care={tile:i,doctor:driver.id,route:route.slice().reverse(),start:at,pickupAt:at+travel+30*SECOND,arrive:at+travel*2+30*SECOND,end:at+travel*2+30*SECOND+(c.magic?.boosted.includes(i)?20:30)*MINUTE};v.paused=true;const dv=driver.vital??={hp:100,last:at};dv.paused=true;dv.rescuing=p.id;Object.assign(dv,center(i));changed=true;continue;}
   const id=state.nextId++;c.res.food-=80;c.res.gold-=10;state.missions.push({id,hospital:i,uid:b.uid!,slot,driver:driver.id,patient:p.id,phase:'outbound',...center(i),route,edge:0,last:at,retryAt:at,topology:signature});const v=driver.vital??={hp:100,last:at};v.ambulance=id;v.paused=true;Object.assign(v,center(i));changed=true;}
 }
 return changed;
}
