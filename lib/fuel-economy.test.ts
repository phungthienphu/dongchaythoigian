import test from 'node:test';
import assert from 'node:assert/strict';
import {newCity,G,O,idx,MIN,HOUR,SEASON_MS,stats,derive,settle,type City} from './engine';
const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
function fixture():City{
 const c=newCity(0,123);c.t.fill(G);c.seen.fill(1);c.b={};c.camps=[];c.herds=[];c.camp=idx(20,20);c.people=c.people.slice(0,3);c.era=2;c.army={};c.res={food:5000,wood:100,stone:500,copper:0,gold:0,diamond:0,coal:0,aetherCrystal:0,rune:0,essence:0,celestialStone:0};
 c.b[idx(19,20)]={k:'storehouse',lvl:5,doneAt:null};for(const p of c.people){p.task={t:'idle'};p.pos=c.camp;}return c;
}
function smelter(c:City){const tile=idx(22,20);c.b[tile]={k:'smelter',lvl:1,doneAt:null};c.t[idx(23,20)]=O;for(const p of c.people){p.task={t:'work',at:tile};p.pos=tile;}return tile;}
test('each staffed level-one smelter consumes ten wood and ten stone per minute and delivers more copper than both material inputs combined',()=>{
 const c=fixture();smelter(c);const st=stats(c,derive(c),0);assert.equal(st.woodUse,600);assert.equal(st.stoneUse,600);
 settle(c,5*MIN);const fuel=500-c.res.stone;assert.ok(fuel>0&&fuel<=50);close(c.res.wood,100-fuel-6/12);assert.ok(c.res.copper>100,`delivered ${c.res.copper} copper versus 100 material units`);
 const online=fixture();smelter(online);for(let at=137;at<5*MIN;at+=1731)settle(online,at);settle(online,5*MIN);assert.deepEqual(c,online);
});
test('missing wood or stone pauses smelting without burning the other input; empty and damaged smelters consume nothing',()=>{
 for(const missing of ['wood','stone'] as const){const c=fixture();smelter(c);c.res[missing]=0;settle(c,MIN);assert.equal(c.res.copper,0);if(missing==='wood')assert.equal(c.res.stone,500);else close(c.res.wood,99.9);}
 for(const inactive of ['empty','burned','flooded']){const c=fixture(),tile=smelter(c);if(inactive==='empty')for(const p of c.people)p.task={t:'idle'};else c.b[tile][inactive as 'burned'|'flooded']=true;const st=stats(c,derive(c),0);assert.equal(st.woodUse,0);assert.equal(st.stoneUse,0);}
});
test('each fire consumes fifty wood per ten minutes; lack of fuel stops its growth bonus, not normal growth',()=>{
 const make=(fuel:number)=>{const c=fixture();c.era=1;c.res.wood=fuel;c.people=c.people.slice(0,1);c.b[idx(21,20)]={k:'fire',lvl:1,doneAt:null};return c;};
 const c=make(100);settle(c,10*MIN);close(c.res.wood,100-50-1/6);
 const withFuel=make(100),withoutFuel=make(0);for(const city of [withFuel,withoutFuel])city.b[idx(20,21)]={k:'hut',lvl:2,doneAt:null};
 settle(withFuel,31_000);settle(withoutFuel,31_000);assert.equal(withFuel.people.length,2);assert.equal(withoutFuel.people.length,1);settle(withoutFuel,61_000);assert.equal(withoutFuel.people.length,2);
});
test('four food workers can sustain six villagers, one soldier and a lit fire with a twelve-tile return route, even in winter in every era',()=>{
 for(const era of [1,2,3]){
  const c=fixture();c.era=era;c.people=newCity(0,123).people;c.people.push({...structuredClone(c.people[0]),id:99,name:'Six'});c.army={club:1};c.res.food=1000;c.res.wood=200;
  c.t0=-3*SEASON_MS;c.seasonIdx=3;c.b={[c.camp]:{k:'storehouse',lvl:5,doneAt:null},[idx(19,20)]:{k:'fire',lvl:1,doneAt:null}};
  for(let n=0;n<2;n++)c.b[idx(32,20+n)]={k:'gather',lvl:1,doneAt:null};
  for(const [n,p]of c.people.entries()){p.pos=c.camp;p.task=n<4?{t:'work',at:idx(32,20+Math.floor(n/2))}:{t:'idle'};}
  settle(c,10*MIN);assert.ok(c.res.food>1000,`era ${era}: ${c.res.food} food after upkeep`);assert.equal(c.people.length,6);
 }
});

test('exhausted ore and full copper storage do not waste furnace materials',()=>{
 for(const full of [false,true]){const c=fixture();smelter(c);if(full)c.res.copper=5500;else c.t[idx(23,20)]=G;settle(c,MIN);assert.equal(c.res.stone,500);close(c.res.wood,99.9);}
});
