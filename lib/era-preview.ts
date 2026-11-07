/** Development fixture only. Never used by account routes or saved to MongoDB. */
import {B,G,R,RES,UNITS,idx,newCity,derive,stats,W,MIN,type BKey,type City} from './engine';
import {initializeMedieval} from './medieval';
import {initializeIndustry} from './industry';
import {initializeModern,stepPower} from './modern';
export function eraPreview(era:number,now:number,wonderReady=false):City{
 const c=newCity(now,728193);c.era=era;c.manualWorkforce=true;c.b={};c.people=[];c.pop=0;c.army={};c.herds=[];c.camps=[];c.raid=null;c.wildernessAt=now+30*MIN;
 const cx=c.camp%W,cy=Math.floor(c.camp/W);
 for(let y=Math.max(1,cy-16);y<=Math.min(W-2,cy+16);y++)for(let x=Math.max(1,cx-16);x<=Math.min(W-2,cx+16);x++){const i=idx(x,y);c.seen[i]=1;if(c.t[i]!==R)c.t[i]=G;}
 const places:number[]=[];for(let radius=2;radius<15;radius+=2)for(let y=-radius;y<=radius;y+=2)for(let x=-radius;x<=radius;x+=2){const i=idx(cx+x,cy+y);if(cx+x<1||cx+x>=W-1||cy+y<1||cy+y>=W-1||Math.max(Math.abs(x),Math.abs(y))!==radius||c.t[i]!==G||i===c.camp)continue;places.push(i);}
 const add=(k:BKey,lvl=1)=>{
  let tile:number|undefined;
  if(B[k].need==='water'||B[k].need==='river')tile=c.t.findIndex((t,i)=>t===G&&c.seen[i]&&!c.b[i]&&Math.max(Math.abs(i%W-cx),Math.abs(Math.floor(i/W)-cy))<15&&[i-1,i+1,i-W,i+W].some(j=>c.t[j]===R));
  else tile=places.find(i=>!c.b[i]);
  if(tile===undefined||tile<0)return -1;c.b[tile]={k,lvl,doneAt:null};return tile;
 };
 add('hall',Math.min(era,6));for(let n=0;n<6;n++)add(era>=4?'grandstore':'storehouse',3);
 for(let n=0;n<5;n++)add(era>=6?'apartment':era>=5?'tenement':era>=4?'tilehouse':'stonehouse',3);
 add('builderhouse',3);add('envoy',3);add('market');for(let n=0;n<3;n++)add('barracks',3);add('forge',3);add('logistics',3);add('infirmary',3);add('temple');
 if(era>=4)for(const k of ['well','reservoir','school','artisan','academy'] as BKey[])add(k);
 if(era>=5)for(const k of ['charcoal','machine','factory','transport','treatment','nursery','ironbridge'] as BKey[])add(k);
 if(era>=6)for(const k of ['thermal','hydro','solar','complex','hospital','university','park','retention'] as BKey[])add(k);
 if(era===6&&wonderReady){add('hydro');for(let n=0;n<3;n++)add('park');}
 const farms:number[]=[];for(let n=0;n<10;n++){const i=add(era>=4?'estate':'farm',3);if(i>=0)farms.push(i);}
 const pop=era>=6?(wonderReady?400:300):era>=5?180:100;
 for(let n=0;n<pop;n++){const farm=farms[Math.floor(n/4)];c.people.push({id:c.nextId++,name:`Dân ${n+1}`,task:farm!==undefined?{t:'work',at:farm}:{t:'idle'},pos:farm??c.camp});}c.pop=pop;
 for(const [tile,b]of Object.entries(c.b))if(B[b.k].jobs&&!['farm','estate'].includes(b.k)){
  const free=c.people.filter(p=>p.task.t==='idle').slice(0,B[b.k].jobs);for(const p of free){p.task={t:'work',at:+tile};p.pos=+tile;}
 }
 for(const r of RES)c.res[r]=r==='coal'&&era<5?0:era>=4?150000:15000;
 for(const u of ['sword','crossbow','cavalry','musket','cannon','infantry','armor'] as const)if(UNITS[u].era<=era)c.army[u]=u==='sword'?6:u==='armor'||u==='cannon'?1:3;
 initializeMedieval(c,now);initializeIndustry(c,now);initializeModern(c,now);
 if(c.medieval)for(const [i,b]of Object.entries(c.b))if(b.k==='reservoir'||b.k==='retention')c.medieval.water[i]=6*3600000;
 if(c.industry)c.industry.pollution=era===5?35:10;
 const storage=stats(c,derive(c),now).storage;for(const r of RES)c.res[r]=Math.min(c.res[r],storage[r]);
 c.log=[];if(era>=4)c.templeAt=now;
 if(wonderReady&&c.industry){c.industry.cleanSince=now-12*3600000;for(const b of Object.values(c.b))if(b.k==='thermal')b.off=true;}
 if(c.modern)stepPower(c,now,now, B);
 return c;
}
