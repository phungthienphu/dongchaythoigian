import {staffCounts} from './industry';
/** Read-only selectors for the era 7–9 UI. Nothing here changes a city: research
 * previews run the engine check on copies, and the network is read as persisted. */
import {B,buildingName,foodEraScale,type Building,type City,type ResKey} from './engine';
import {MAGIC_BUILDINGS,MAGIC_RESEARCH,MAGIC_SPELLS,CONTRACT_RESEARCH,magicDef,type Element,type MagicBuilding,type MagicGoods,type MagicSpell,type Research,type Contract} from './magic-data';
import {beginMagicResearch} from './magic-research';
import {RESEARCH_NAMES,SOURCES,PRODUCTION,OFF_NETWORK,isMagicBuilding,magicSiteId,magicSupportError,operating,tileDistance,flaskMages} from './magic';
import {ELEMENT_NAMES,SEAL_STATIONS} from './magic-elements';
import {BEAST_SLOTS,CONTRACT_NAMES,DOMAIN_NAMES,MAX_PACKAGES,PACKAGE_SEALS,TELEPORT,altarActive,beastSlotsUsed,byUid,domainActive,eyeActive,matrixActive,type Domain,type PackageSpell} from './magic-myth';

export const KNOWLEDGE_CAP=5000;
const W=96,HOUR=3600000;
export const tileLabel=(tile:number)=>`(${tile%W}, ${Math.floor(tile/W)})`;
const levelScale=(lvl:number)=>[0,1,1.6,2.4][Math.max(1,Math.min(3,lvl))];

export const PRIORITY_LABELS={health:'Chữa dân',defense:'Phòng thủ',input:'Đầu vào',output:'Đầu ra',other:'Còn lại'} as const;
export type PriorityGroup=keyof typeof PRIORITY_LABELS;
const PRIORITY_ORDER:PriorityGroup[]=['health','defense','input','output','other'];

/** Built magic buildings with a uid, by tile order. Never assigns ids. */
export function magicSites(c:City){
 const out:{tile:number;b:Building;id:string}[]=[];
 if(!c.magic)return out;
 for(const [key,b]of Object.entries(c.b))if(isMagicBuilding(b.k)&&b.lvl>=1&&b.uid!==undefined)out.push({tile:+key,b,id:magicSiteId(b)});
 return out.sort((a,b)=>a.tile-b.tile);
}
const siteName=(c:City,s:{b:Building;tile:number})=>`${buildingName(c,s.b.k)} ${tileLabel(s.tile)}`;

/* ---------- research ---------- */
export type ResearchStatus='done'|'running'|'ready'|'locked'|'soon';
export type ResearchItem={key:Research;name:string;era:number;requires:string[];goods:MagicGoods;knowledge:number;seconds:number;status:ResearchStatus;reason?:string;contract?:Contract};
const CONTRACT_OF=Object.fromEntries(Object.entries(CONTRACT_RESEARCH).map(([k,v])=>[v,k])) as Partial<Record<Research,Contract>>;
const anyOperating=(c:City,k:string)=>Object.values(c.b).some(b=>b.k===k&&operating(b));
/** The same checks as the research action, run on copies. */
export function researchView(c:City,now:number,maxEra:number){
 const m=c.magic;if(!m)return null;
 const context={era:c.era,academy:anyOperating(c,'mageacademy'),university:anyOperating(c,'university'),fourSpirits:anyOperating(c,'fourspirits'),covenant:anyOperating(c,'covenantaltar')};
 const contractTaken=!!(m.contract?.active||m.contract?.pending||m.researched.some(k=>CONTRACT_OF[k])||m.research&&CONTRACT_OF[m.research.key]);
 const items:ResearchItem[]=(Object.keys(MAGIC_RESEARCH) as Research[]).map(key=>{
  const d=MAGIC_RESEARCH[key],base={key,name:RESEARCH_NAMES[key],era:d.era,requires:d.requires.map(r=>RESEARCH_NAMES[r]),goods:d.goods,knowledge:d.knowledge,seconds:d.seconds,...(CONTRACT_OF[key]?{contract:CONTRACT_OF[key]}:{})};
  if(m.researched.includes(key))return {...base,status:'done'};
  if(m.research?.key===key)return {...base,status:'running'};
  if(d.era>maxEra)return {...base,status:'soon',reason:'Sắp ra mắt.'};
  if(CONTRACT_OF[key]&&contractTaken)return {...base,status:'locked',reason:'Mỗi làng một khế ước chủ đạo; đổi ở mục Khế ước.'};
  const stock:MagicGoods={};for(const r of ['food','wood','stone','copper','gold','coal','aetherCrystal','rune','essence','celestialStone'] as const)stock[r]=c.res[r];
  const reason=beginMagicResearch({knowledge:m.knowledge,researched:[...m.researched],...(m.research?{research:{...m.research}}:{})},stock,key,now,context);
  return reason?{...base,status:'locked',reason}:{...base,status:'ready'};
 });
 const r=m.research,running=r?{key:r.key,name:RESEARCH_NAMES[r.key],progress:Math.max(0,Math.min(1,(now-r.startedAt)/Math.max(1,r.doneAt-r.startedAt))),remaining:Math.max(0,r.doneAt-now),refundGoods:Object.fromEntries(Object.entries(r.goods).map(([k,v])=>[k,Math.floor(v*.5)])) as MagicGoods,refundKnowledge:Math.floor(r.knowledge*.5)}:undefined;
 const academies=magicSites(c).filter(s=>s.b.k==='mageacademy');
 const perHour=academies.reduce((n,s)=>n+(m.factories[s.id]&&!m.factories[s.id].blocked?(MAGIC_BUILDINGS.mageacademy.knowledge):0),0);
 return {knowledge:m.knowledge,cap:KNOWLEDGE_CAP,full:m.knowledge>=KNOWLEDGE_CAP,perHour,academies:academies.length,running,items};
}

/* ---------- mana network ---------- */
export type SourceView={id:string;tile:number;name:string;stored:number;capacity:number;perHour:number;running:boolean;blocked?:string;slots:number;used:number;receivers:{id:string;tile:number;name:string;backup:boolean}[]};
export type ReceiverView={id:string;tile:number;name:string;kind:string;group:PriorityGroup;primary?:{id:string;tile:number;name:string};backup?:{id:string;tile:number;name:string};reason?:string;blocked?:string;manaPerHour:number};
export function manaView(c:City){
 const m=c.magic;if(!m)return null;
 const sites=magicSites(c),byId=new Map(sites.map(s=>[s.id,s]));
 const ref=(id?:string)=>{const s=id?byId.get(id):undefined;return s?{id:s.id,tile:s.tile,name:siteName(c,s)}:undefined;};
 const sources:SourceView[]=sites.filter(s=>SOURCES.has(s.b.k)).map(s=>{
  const n=m.network.sources[s.id],f=m.factories[s.id],d=magicDef(s.b.k as MagicBuilding).source!;
  const receivers=Object.entries(m.network.bindings).flatMap(([rid,bind])=>bind.primary===s.id||bind.backup===s.id?[{id:rid,tile:byId.get(rid)?.tile??-1,name:byId.get(rid)?siteName(c,byId.get(rid)!):'Công trình đã mất',backup:bind.primary!==s.id}]:[]);
  return {id:s.id,tile:s.tile,name:siteName(c,s),stored:m.mana[s.id]??0,capacity:n?.capacity??d.capacity*levelScale(s.b.lvl),perHour:d.perHour*levelScale(s.b.lvl),running:!!f&&!f.blocked&&operating(s.b),...(f?.blocked?{blocked:f.blocked}:!operating(s.b)?{blocked:'Công trình đang dừng, hư hại hoặc đang nâng cấp.'}:{}),slots:n?.slots??0,used:n?.used??0,receivers};
 });
 const receivers:ReceiverView[]=sites.filter(s=>!OFF_NETWORK.has(s.b.k)&&!SOURCES.has(s.b.k)&&!magicDef(s.b.k as MagicBuilding).relay&&(s.id in m.network.bindings||magicDef(s.b.k as MagicBuilding).mana!==undefined)).map(s=>{
  const d=magicDef(s.b.k as MagicBuilding),bind=m.network.bindings[s.id],f=m.factories[s.id];
  const primary=ref(bind?.primary),backup=ref(bind?.backup);
  return {id:s.id,tile:s.tile,name:siteName(c,s),kind:s.b.k,group:d.priority??'other',...(primary?{primary}:{}),...(backup?{backup}:{}),...(bind?.reason?{reason:bind.reason}:!bind?{reason:'Mạng mana cập nhật ở mốc phút tiếp theo.'}:{}),...(f?.blocked?{blocked:f.blocked}:{}),manaPerHour:(d.mana??0)*levelScale(s.b.lvl)};
 }).sort((a,b)=>PRIORITY_ORDER.indexOf(a.group)-PRIORITY_ORDER.indexOf(b.group)||a.tile-b.tile);
 const relays=sites.filter(s=>magicDef(s.b.k as MagicBuilding).relay).map(s=>({id:s.id,tile:s.tile,name:siteName(c,s),active:operating(s.b)}));
 const groups=PRIORITY_ORDER.map(g=>({group:g,label:PRIORITY_LABELS[g],receivers:receivers.filter(r=>r.group===g)})).filter(g=>g.receivers.length);
 return {sources,receivers,relays,groups,stored:sources.reduce((n,s)=>n+s.stored,0),capacity:sources.reduce((n,s)=>n+s.capacity,0),links:manaLinks(c)};
}

/** Straight segments source → relays → receiver along each primary binding. The
 * chain is rebuilt by distance only (the engine already proved the road). */
export type ManaLink={from:number;to:number;kind:'relay'|'supply';backup?:boolean};
export function manaLinks(c:City):ManaLink[]{
 const m=c.magic;if(!m)return [];
 const sites=magicSites(c),byId=new Map(sites.map(s=>[s.id,s])),relays=sites.filter(s=>magicDef(s.b.k as MagicBuilding).relay&&operating(s.b));
 const links:ManaLink[]=[],seen=new Set<string>();
 const add=(l:ManaLink)=>{const key=`${l.from}>${l.to}:${l.kind}:${l.backup?1:0}`;if(!seen.has(key)){seen.add(key);links.push(l);}};
 for(const [rid,bind]of Object.entries(m.network.bindings))for(const [sid,backup]of [[bind.primary,false],[bind.backup,true]] as const){
  const source=sid?byId.get(sid):undefined,receiver=byId.get(rid);if(!source||!receiver)continue;
  if(tileDistance(source.tile,receiver.tile)<=6){add({from:source.tile,to:receiver.tile,kind:'supply',backup});continue;}
  // Breadth-first over relays (at most three hops), recording the first chain found.
  const queue:{tile:number;path:number[]}[]=[{tile:source.tile,path:[source.tile]}],visited=new Set([source.tile]);let chain:number[]|undefined;
  for(let i=0;i<queue.length&&!chain;i++){const node=queue[i];if(node.path.length>4)continue;
   if(node.path.length>1&&tileDistance(node.tile,receiver.tile)<=6){chain=node.path;break;}
   for(const r of relays)if(!visited.has(r.tile)&&tileDistance(node.tile,r.tile)<=6){visited.add(r.tile);queue.push({tile:r.tile,path:[...node.path,r.tile]});}}
  if(!chain)continue;
  for(let i=1;i<chain.length;i++)add({from:chain[i-1],to:chain[i],kind:'relay',backup});
  add({from:chain.at(-1)!,to:receiver.tile,kind:'supply',backup});
 }
 return links;
}

/* ---------- seals ---------- */
function sealNeeds(c:City,b:Building):{need:Element[];any?:number;optional?:boolean}{
 if(b.k==='golemworks'||b.k==='spiritstable')return {need:[...(magicDef(b.k).elements??[])]};
 if(b.k==='spiritgate')return {need:['water','earth']};
 if(b.k==='worldmatrix')return {need:['fire','water','wood','earth'],any:2};
 if(b.k==='harmonizer')return {need:[...(c.magic?.harmony?.[magicSiteId(b)]??[])]};
 if(b.k==='rivershrine')return {need:['water'],optional:true};
 return {need:[]};
}
const stationsOf=(c:City,element:Element)=>magicSites(c).filter(s=>SEAL_STATIONS[s.b.k]===element);

/* ---------- per-building diagnosis: "cần ai → thiếu gì → cấp cho ai" ---------- */
export type NeedRow={label:string;ok:boolean;detail:string;tile?:number};
export type Diagnosis={needs:NeedRow[];missing?:{text:string;tile?:number};serves:{label:string;tile?:number}[];buffers:{resource:string;have:number;capacity:number;perHour:number}[];mana?:{stored:number;capacity:number};spells:SpellRow[]};
export type SpellRow={key:MagicSpell;name:string;cost:string;cooldown:string;readyIn:number;area:string;trigger:string;locked?:string};
const RES_NAMES:Record<string,string>={food:'lương thực',wood:'gỗ',stone:'đá',copper:'đồng',gold:'vàng',coal:'than',aetherCrystal:'tinh thạch',rune:'phù văn',essence:'tinh chất',celestialStone:'thiên thạch'};
export const goodsText=(g:MagicGoods)=>Object.entries(g).filter(([,v])=>v).map(([k,v])=>`${Math.floor(v).toLocaleString('vi-VN')} ${RES_NAMES[k]??k}`).join(' + ');
const seconds=(ms:number)=>ms>=HOUR?`${+(ms/HOUR).toFixed(1)} giờ`:ms>=60000?`${+(ms/60000).toFixed(1)} phút`:`${ms/1000} giây`;
/** Automatic trigger rules (spec 7.2); thresholds are fixed in this release. */
export const SPELL_TRIGGERS:Record<MagicSpell,string>={
 fireball:'Pháp sư bắn khi có mục tiêu trong tầm và đủ mana.',
 waterheal:'Khi nhóm quân gần đó thiếu tổng ≥50 HP.',
 roots:'Khi ≥3 địch đứng gần nhau trong 6 ô quanh trận.',
 lightpulse:`Mỗi 10 giây nếu có zombie trong ${MAGIC_SPELLS.lightpulse.radius} ô.`,
 firecircle:`Mỗi 2 giây, tự động khi zombie vào ${MAGIC_SPELLS.firecircle.radius} ô.`,
 purify:'Khi ≥2 dân nhiễm bệnh trong vùng.',
 firestorm:'Khi ≥4 địch trong vùng 3 ô.',
 cleanse:'Khi ≥2 dân nhiễm bệnh trong 10 ô.',
 growthrain:'Khi có ruộng đang có người làm; giữ lại 120 mana cho phòng thủ.',
 stonewall:'Khi ≥3 zombie trong 6 ô và vách không chặn lối duy nhất tới Đình.',
 thunder:'Khi ≥4 địch nhìn thấy được trong vùng 2 ô.',
 sanctuary:'Khi ≥4 quân mình dưới 50% HP.',
};
function cooldownKey(spell:MagicSpell,id:string){return spell==='roots'?`roots:${id}`:spell==='waterheal'?`heal:${id}`:spell;}
export function buildingSpells(c:City,b:Building,now:number):SpellRow[]{
 const m=c.magic;if(!m)return [];const id=magicSiteId(b);
 return (Object.keys(MAGIC_SPELLS) as MagicSpell[]).filter(k=>{const s=MAGIC_SPELLS[k] as {building?:string};return s.building===b.k||k==='waterheal'&&b.k==='rivershrine';}).map(k=>{
  const s=MAGIC_SPELLS[k] as {name:string;mana:number;goods?:MagicGoods;cooldown:number;radius:number;targets:number;research?:Research;package?:boolean};
  const cd=s.package?0:Math.max(0,(m.cooldowns[cooldownKey(k,id)]??0)-now);
  const locked=s.research&&!m.researched.includes(s.research)?`Cần nghiên cứu ${RESEARCH_NAMES[s.research]}.`:undefined;
  return {key:k,name:s.name,cost:[`${s.mana} mana`,s.goods?goodsText(s.goods):''].filter(Boolean).join(' + '),cooldown:s.package?'Một lần mỗi trận, cần gói chuẩn bị':s.cooldown?`Hồi ${seconds(s.cooldown)}${['purify','firestorm','cleanse','growthrain','stonewall'].includes(k)?' (chung cả làng)':''}`:'Không hồi',readyIn:cd,area:`Vùng ${s.radius} ô · tối đa ${s.targets>=300?'mọi':s.targets} mục tiêu`,trigger:SPELL_TRIGGERS[k],...(locked?{locked}:{})};
 });
}
export function magicDiagnosis(c:City,tile:number,now:number):Diagnosis|null{
 const m=c.magic,b=c.b[tile];if(!m||!b||!isMagicBuilding(b.k)||b.uid===undefined)return null;
 const d=magicDef(b.k as MagicBuilding),id=magicSiteId(b),f=m.factories[id],sites=magicSites(c),byId=new Map(sites.map(s=>[s.id,s]));
 const needs:NeedRow[]=[],serves:Diagnosis['serves']=[];
 let missing:Diagnosis['missing'];
 const blame=(text:string,at?:number)=>{missing??={text,...(at!==undefined?{tile:at}:{})};};
 if(b.lvl<1||b.doneAt)blame('Đang xây hoặc nâng cấp.');
 else if(!operating(b))blame((c.b[tile] as Building).off?'Công trình đang tắt.':'Công trình hư hại, cần sửa.');
 // Workers
 if(d.jobs){const need=Math.ceil(d.jobs*levelScale(b.lvl)),have=PRODUCTION.has(b.k)?f?.workers??0:staffCounts(c).get(tile)??0;needs.push({label:'Thợ',ok:have>=need,detail:`${have}/${need} thợ đã tới nơi`});if(have<=0)blame('Chưa có thợ làm việc. Giao dân rảnh vào công trình này.');}
 // Old industry support
 const support=magicSupportError(c,tile,b);if(d.support?.length){needs.push({label:'Xưởng hỗ trợ',ok:!support,detail:support??'Có xưởng hỗ trợ hoạt động trong 6 ô.'});if(support)blame(support);}
 // Mana
 if(!SOURCES.has(b.k)&&!OFF_NETWORK.has(b.k)&&!d.relay){
  const bind=m.network.bindings[id];
  if(!bind)needs.push({label:'Nguồn mana',ok:false,detail:'Mạng mana cập nhật ở mốc phút tiếp theo.'});
  else if(!bind.primary){needs.push({label:'Nguồn mana',ok:false,detail:bind.reason??'Chưa nối nguồn.'});blame(bind.reason??'Chưa nối nguồn mana: đặt giếng/tháp hoặc cột dẫn linh trong 6 ô, có đường đi.');}
  else{const p=byId.get(bind.primary),stored=m.mana[bind.primary]??0,pf=m.factories[bind.primary];
   needs.push({label:'Nguồn mana chính',ok:stored>0,detail:`${p?siteName(c,p):bind.primary} · còn ${Math.floor(stored)} mana`,...(p?{tile:p.tile}:{})});
   if(bind.backup){const q=byId.get(bind.backup);needs.push({label:'Nguồn dự phòng',ok:(m.mana[bind.backup]??0)>0,detail:`${q?siteName(c,q):bind.backup} · còn ${Math.floor(m.mana[bind.backup]??0)} mana`,...(q?{tile:q.tile}:{})});}
   if(stored<=0&&p)blame(`Nguồn ${siteName(c,p)} hết mana${pf?.blocked?`: ${pf.blocked}`:'.'}`,p.tile);}
 }
 // Seals
 const seals=m.seals?.[id]??[],req=sealNeeds(c,b);
 if(b.k==='harmonizer'&&req.need.length!==2){needs.push({label:'Ấn đã chọn',ok:false,detail:'Chọn hai ấn khác loại bên dưới.'});blame('Chưa chọn hai ấn cho đài điều hòa.');}
 for(const e of req.need){const have=seals.includes(e),stations=stationsOf(c,e).filter(s=>tileDistance(s.tile,tile)<=6);
  const station=stations[0],sf=station?m.factories[station.id]:undefined;
  const detail=have?`Nhận ấn ${ELEMENT_NAMES[e]}${station?` từ ${siteName(c,station)}`:''}`:!station?`Không có ${B[Object.keys(SEAL_STATIONS).find(k=>SEAL_STATIONS[k]===e) as keyof typeof B].n} trong 6 ô`:sf?.blocked?`${siteName(c,station)} không cấp ấn: ${sf.blocked}`:`${siteName(c,station)} đã cấp đủ 3 nhà`;
  needs.push({label:`Ấn ${ELEMENT_NAMES[e]}${req.optional?' (tùy chọn)':''}`,ok:have,detail,...(station?{tile:station.tile}:{})});
 }
 if(req.any){if(new Set(seals).size<req.any)blame(`Cần ít nhất ${req.any} ấn khác loại trong 6 ô; đang có ${seals.length}.`);}
 else if(!req.optional){const lack=req.need.find(e=>!seals.includes(e));if(lack){const station=stationsOf(c,lack).find(s=>tileDistance(s.tile,tile)<=6);blame(`Thiếu ấn ${ELEMENT_NAMES[lack]}${station&&m.factories[station.id]?.blocked?`: ${siteName(c,station)} ${m.factories[station.id].blocked!.toLowerCase()}`:''}`,station?.tile);}}
 // Research gates that stop running (observatory) or the build
 if(b.k==='observatory'&&!m.researched.includes('gatecraft')){needs.push({label:'Nghiên cứu',ok:false,detail:'Cần Khai giới để duy trì Thiên nhãn.'});}
 if(b.k==='riverpalace'){const dom=m.domain;needs.push({label:'Lãnh địa',ok:!!dom?.active,detail:dom?.active?`${DOMAIN_NAMES[dom.active]} đang chọn`:dom?.pending?`Đang đổi sang ${DOMAIN_NAMES[dom.pending.domain]}`:'Chưa chọn lãnh địa'});}
 // Buffers
 const buffers=Object.entries(d.input??{}).filter(()=>PRODUCTION.has(b.k)).map(([r,rate])=>({resource:RES_NAMES[r]??r,have:f?.input[r as keyof MagicGoods]??0,capacity:rate*2*levelScale(b.lvl),perHour:rate*levelScale(b.lvl)}));
 for(const x of buffers)if(x.have<=1e-9&&!missing&&f?.blocked)blame(`Bộ đệm ${x.resource} trống: cần dân mang ${x.resource} từ kho tới.`);
 if(f?.blocked)blame(f.blocked);
 // Who it serves
 if(SOURCES.has(b.k)){for(const [rid,bind]of Object.entries(m.network.bindings))if(bind.primary===id||bind.backup===id){const r=byId.get(rid);if(r)serves.push({label:`${siteName(c,r)}${bind.primary===id?'':' (dự phòng)'}`,tile:r.tile});}if(!serves.length)serves.push({label:'Chưa nhà nào nhận mana từ nguồn này.'});}
 const element=SEAL_STATIONS[b.k];
 if(element){for(const s of sites)if(s.id!==id&&(m.seals?.[s.id]??[]).includes(element)&&tileDistance(s.tile,tile)<=6)serves.push({label:`Ấn ${ELEMENT_NAMES[element]} → ${siteName(c,s)}`,tile:s.tile});if(!serves.length)serves.push({label:`Chưa nhà nào trong 6 ô cần ấn ${ELEMENT_NAMES[element]}.`});}
 if(d.output&&!PRODUCTION.has(b.k))serves.push({label:`${goodsText(Object.fromEntries(Object.entries(d.output).map(([k,v])=>[k,v*levelScale(b.lvl)*(k==='food'?foodEraScale(c,now):1)])) as MagicGoods)}/giờ công suất trước vận chuyển`});
 if(d.knowledge)serves.push({label:`${d.knowledge} tri thức ma pháp/giờ (trần ${KNOWLEDGE_CAP.toLocaleString('vi-VN')})`});
 if(d.defense)serves.push({label:`Chống zombie: ${d.defense.damage} sát thương, tầm ${d.defense.range} ô, tối đa ${d.defense.targets} mục tiêu mỗi ${d.defense.cooldown/1000} giây; ${d.defense.mana} mana/mục tiêu.`});
 if(d.armySpace)serves.push({label:`${d.armySpace} chỗ quân ma pháp`});
 if(b.k==='spiritgarden')for(const t of m.boosted??[])serves.push({label:`Rút ngắn ca chữa tại ${buildingName(c,c.b[t]?.k??'healer')} ${tileLabel(t)}`,tile:t});
 if(b.k==='harmonizer'){for(const s of sites)if(SOURCES.has(s.b.k)&&tileDistance(s.tile,tile)<=6)serves.push({label:`+1 chỗ cấp cho ${siteName(c,s)}`,tile:s.tile});serves.push({label:'Giảm 8 ô nhiễm/giờ'});}
 if(d.relay)serves.push({label:'Nối nguồn mana tới nhà nhận trong 6 ô; không trữ mana.'});
 const mana=SOURCES.has(b.k)?{stored:m.mana[id]??0,capacity:m.network.sources[id]?.capacity??(d.source!.capacity*levelScale(b.lvl))}:undefined;
 return {needs,...(missing?{missing}:{}),serves,buffers,...(mana?{mana}:{}),spells:buildingSpells(c,b,now)};
}

/* ---------- choices: specialization, contract, domain ---------- */
export const SPECIALIZATION_EFFECTS:Record<Element,string>={fire:'+10% sát thương Hỏa cầu và Bão lửa lên quân',water:'Thủy hồi thêm 1 mục tiêu',wood:'Thêm 1 linh mộc vận tải tối đa',earth:'+10% HP tối đa cho golem tuyển sau khi chọn'};
export const CONTRACT_EFFECTS:Record<Contract,string>={dragon:'Thanh Long bay, đánh tối đa 3 mục tiêu; cơ động, sát thương diện',tortoise:'Huyền Quy chắc chắn, che quân gần giảm 15% sát thương; chậm',phoenix:'Phượng Hoàng bay, hồi máu quân gần mỗi 10 giây; hỏa lực yếu hơn'};
export const DOMAIN_EFFECTS:Record<Domain,string>={river:'Giường bệnh tối đa +50%, phí ca không đổi',citadel:'Tổ tuần tra đuổi xa 10 → 14 ô, tới điểm báo zombie nhanh hơn 20%',crafts:'Mỗi giờ hoàn 10% mana sản xuất thường đã dùng vào đúng nguồn'};
const fighting=(c:City)=>!!c.battleId||(c.zombies?.actors.length??0)>0;
const lack=(c:City,g:Partial<Record<ResKey,number>>)=>(Object.entries(g) as [ResKey,number][]).filter(([r,n])=>c.res[r]<n).map(([r,n])=>`${Math.ceil(n-c.res[r])} ${RES_NAMES[r]}`).join(', ');
export function choicesView(c:City,now:number){
 const m=c.magic;if(!m)return null;
 const spec=m.specialization,firstSpec=!spec?.element&&!m.cooldowns.specialized&&!spec?.pending;
 const specLock=c.era<8?'Mở từ thời Vương triều Nguyên tố.':!m.researched.includes('pact')?'Cần hoàn thành nghiên cứu Khế ước.':fighting(c)?'Không đổi khi đang có trận chiến.':spec?.pending?`Đang đổi sang ${ELEMENT_NAMES[spec.pending.element]}.`:undefined;
 const specCost={rune:100,essence:40};
 const contract=m.contract,beasts=beastSlotsUsed(c);
 const contractCost={celestialStone:200,essence:100};
 const contractLock=c.era<9?'Mở từ Kỷ nguyên Thần thoại.':!contract?.active&&!contract?.pending?'Nghiên cứu khế ước đầu tiên ở mục Nghiên cứu (cần Đài khế ước).':contract.pending?`Đang đổi sang ${CONTRACT_NAMES[contract.pending.contract]}.`:fighting(c)?'Không đổi khi đang có trận chiến.':beasts>0?'Thu hồi mọi thần thú trước: giải tán ở nhà, chờ quân xuất chinh về và lượt huấn luyện xong. Không hoàn phí.':!altarActive(c)?'Cần Đài khế ước hoạt động.':undefined;
 const domain=m.domain,palace=Object.values(c.b).some(b=>b.k==='riverpalace'&&operating(b));
 const domainCost={rune:100,celestialStone:40};
 const domainLock=c.era<9?'Mở từ Kỷ nguyên Thần thoại.':!palace?'Cần Thiên Cung Sông Mẹ đã hoàn thành và còn hoạt động.':fighting(c)?'Không đổi khi đang có trận chiến.':domain?.pending?`Đang đổi sang ${DOMAIN_NAMES[domain.pending.domain]}.`:undefined;
 return {
  specialization:{active:spec?.element,pending:spec?.pending?{element:spec.pending.element,remaining:Math.max(0,spec.pending.doneAt-now)}:undefined,first:firstSpec,cost:firstSpec?undefined:specCost,lack:firstSpec?'':lack(c,specCost),hours:firstSpec?0:6,lock:specLock},
  contract:{active:contract?.active,pending:contract?.pending?{contract:contract.pending.contract,remaining:Math.max(0,contract.pending.doneAt-now)}:undefined,cost:contractCost,lack:lack(c,contractCost),hours:12,lock:contractLock,beasts,beastSlots:BEAST_SLOTS},
  domain:{active:domain?.active,running:domain?.active?domainActive(c,domain.active):false,pending:domain?.pending?{domain:domain.pending.domain,remaining:Math.max(0,domain.pending.doneAt-now)}:undefined,first:!domain?.chosen,cost:domain?.chosen?domainCost:undefined,lack:domain?.chosen?lack(c,domainCost):'',hours:domain?.chosen?6:0,lock:domainLock,upkeep:40},
 };
}

/* ---------- spell packages ---------- */
export function packagesView(c:City,now:number){
 const m=c.magic;if(!m)return null;
 const sites=magicSites(c),matrices=sites.filter(s=>s.b.k==='worldmatrix');
 const list=(m.packages??[]).map(p=>({...p,name:MAGIC_SPELLS[p.spell].name,remaining:Math.max(0,p.expiresAt-now),matrixTile:byUid(c,p.matrix)?.[0]}));
 const prepare=(['thunder','sanctuary'] as PackageSpell[]).map(spell=>{
  const s=MAGIC_SPELLS[spell],need=PACKAGE_SEALS[spell];
  const matrix=matrices.find(x=>matrixActive(c,x.b)&&need.every(e=>(m.seals?.[x.id]??[]).includes(e)));
  const bind=matrix?m.network.bindings[matrix.id]:undefined,mana=bind?.primary?Math.max(m.mana[bind.primary]??0,bind.backup?m.mana[bind.backup]??0:0):0;
  const lock=c.era<9?'Mở từ Kỷ nguyên Thần thoại.':list.length>=MAX_PACKAGES?`Đã có ${MAX_PACKAGES} gói (kể cả gói đang mang theo trận).`:!matrices.length?'Cần xây Trận đồ thiên địa.':!matrix?`Cần Trận đồ hoạt động có ấn ${need.map(e=>ELEMENT_NAMES[e]).join(' + ')} và nguồn mana.`:c.res.celestialStone<s.goods.celestialStone?`Thiếu ${s.goods.celestialStone-Math.floor(c.res.celestialStone)} thiên thạch.`:mana<s.mana?`Nguồn mana của trận đồ chỉ còn ${Math.floor(mana)}/${s.mana}.`:undefined;
  return {spell,name:s.name,cost:`${s.mana} mana + ${s.goods.celestialStone} thiên thạch`,seals:need.map(e=>ELEMENT_NAMES[e]).join(' + '),effect:spell==='thunder'?`Báo vùng 2 ô, sau 5 giây gây ${MAGIC_SPELLS.thunder.damage} sát thương tối đa 6 địch; nhà nhận ×0,25.`:`Quân trong 4 ô giảm 25% sát thương trong 15 giây.`,trigger:SPELL_TRIGGERS[spell],...(lock?{lock}:{})};
 });
 return {list,prepare,max:MAX_PACKAGES,matrices:matrices.length};
}
/** Ready packages that can ride along a PvP attack (one of each type). */
export function attackPackages(c:City,now:number){const m=c.magic;if(!m?.packages)return [];return (['thunder','sanctuary'] as PackageSpell[]).filter(s=>m.packages!.some(p=>p.spell===s&&!p.away&&p.expiresAt>now&&byUid(c,p.matrix))).map(s=>({spell:s,name:MAGIC_SPELLS[s].name}));}
/** Operating mana sources for the PvP flask: tile + stored mana. */
export function flaskSources(c:City){const m=c.magic;if(!m)return [];return magicSites(c).filter(s=>SOURCES.has(s.b.k)&&operating(s.b)).map(s=>({tile:s.tile,name:siteName(c,s),stored:Math.floor(m.mana[s.id]??0)}));}
export {flaskMages};

/* ---------- teleport docks ---------- */
export function dockView(c:City,tile:number,now:number){
 const m=c.magic,b=c.b[tile];if(!m||b?.k!=='teleportdock'||b.uid===undefined)return null;
 const others=magicSites(c).filter(s=>s.b.k==='teleportdock'&&s.tile!==tile).map(s=>({tile:s.tile,name:siteName(c,s),uid:s.b.uid!,operating:operating(s.b)}));
 const pair=m.dockPairs?.find(p=>p.includes(b.uid!)),partner=pair?byUid(c,pair[0]===b.uid?pair[1]:pair[0]):undefined;
 const cooldown=pair?Math.max(0,(m.cooldowns[`dock:${pair.join('-')}`]??0)-now):0;
 const bound=(x:Building)=>!!m.network.bindings[magicSiteId(x)]?.primary;
 const lock=!operating(b)?'Bến này không hoạt động.':!pair?'Bến chưa được ghép cặp.':!partner?'Bến đích đã mất.':!operating(partner[1])?'Bến đích không hoạt động.':!bound(b)||!bound(partner[1])?'Cả hai bến cần nối nguồn mana.':cooldown>0?`Cặp bến đang hồi, còn ${Math.ceil(cooldown/1000)} giây.`:c.res.rune<TELEPORT.rune?'Cần 1 phù văn mỗi chuyến.':undefined;
 const shipments=(m.shipments??[]).filter(s=>s.from===b.uid||s.to===b.uid).map(s=>({id:s.id,resource:RES_NAMES[s.resource]??s.resource,amount:s.amount,remaining:Math.max(0,s.arriveAt-now),outgoing:s.from===b.uid}));
 return {others,partner:partner?{tile:partner[0],name:`${buildingName(c,partner[1].k)} ${tileLabel(partner[0])}`}:undefined,cooldown,lock,shipments,rule:TELEPORT};
}

/* ---------- army: magic space and beast slots ---------- */
export function magicArmyView(c:City){
 const m=c.magic;if(!m)return null;
 const space=magicSites(c).filter(s=>operating(s.b)).map(s=>({name:siteName(c,s),space:magicDef(s.b.k as MagicBuilding).armySpace??0})).filter(s=>s.space);
 const mages=(c.army.firemage??0)+(c.army.watermage??0);
 return {space,total:space.reduce((n,s)=>n+s.space,0),beasts:beastSlotsUsed(c),beastSlots:BEAST_SLOTS,contract:m.contract?.active,mages};
}

/* ---------- zombies ---------- */
export function magicDefenseView(c:City,now:number){
 const m=c.magic;if(!m)return null;const sites=magicSites(c),rows:{name:string;detail:string;ok:boolean;tile?:number}[]=[];
 const eye=c.era>=9&&eyeActive(c),observatory=sites.find(s=>s.b.k==='observatory');
 for(const s of sites){const id=s.id,running=operating(s.b)&&!!m.factories[id]&&!m.factories[id].blocked;
  if(s.b.k==='aetherwell')rows.push({name:`Linh quang · ${siteName(c,s)}`,detail:(m.mana[id]??0)>=2?`${Math.floor(m.mana[id]??0)} mana · đánh zombie trong ${MAGIC_SPELLS.lightpulse.radius} ô`:'Hết mana',ok:operating(s.b)&&(m.mana[id]??0)>=2,tile:s.tile});
  if(s.b.k==='wardcircle')rows.push({name:`Hỏa trận · ${siteName(c,s)}`,detail:m.network.bindings[id]?.primary?`Đốt zombie trong ${MAGIC_SPELLS.firecircle.radius} ô`:m.network.bindings[id]?.reason??'Chưa nối nguồn mana',ok:operating(s.b)&&!!m.network.bindings[id]?.primary,tile:s.tile});
  if(s.b.k==='firealtar'||s.b.k==='earthtemple'){const spell=s.b.k==='firealtar'?'firestorm':'stonewall',cd=Math.max(0,(m.cooldowns[spell]??0)-now);rows.push({name:`${MAGIC_SPELLS[spell].name} · ${siteName(c,s)}`,detail:!running?m.factories[id]?.blocked??'Không hoạt động':c.res.essence<2?'Thiếu 2 tinh chất trong kho':cd?`Hồi còn ${Math.ceil(cd/1000)} giây`:'Sẵn sàng',ok:running&&c.res.essence>=2&&!cd,tile:s.tile});}
 }
 const ready=(m.packages??[]).filter(p=>!p.away&&p.expiresAt>now);
 for(const p of ready)rows.push({name:`Gói ${MAGIC_SPELLS[p.spell].name}`,detail:`Hết hạn sau ${Math.ceil((p.expiresAt-now)/60000)} phút`,ok:true});
 return {eye,warningSeconds:eye?180:60,observatory:observatory?{tile:observatory.tile,blocked:m.factories[observatory.id]?.blocked}:undefined,rows};
}
