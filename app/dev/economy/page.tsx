"use client";
// Isolated real-engine economy checks; never loads or writes a player account.
import {useState} from 'react';
import HowToPlay from '@/components/HowToPlay';
import {newCity,G,O,idx,MIN,SEASON_MS,settle,stats,derive,upkeepRates,ERA_NAMES,type City} from '@/lib/engine';
function fixture(era:number,smelter:boolean):City{
 const c=newCity(0,123);c.era=era;c.t.fill(G);c.seen.fill(1);c.b={[idx(20,20)]:{k:'storehouse',lvl:5,doneAt:null}};c.camp=idx(20,20);c.camps=[];c.herds=[];c.res={food:1000,wood:500,stone:500,copper:0,gold:0,diamond:0};
 if(smelter){c.people=c.people.slice(0,3);c.b[idx(22,20)]={k:'smelter',lvl:1,doneAt:null};c.t[idx(23,20)]=O;for(const p of c.people){p.pos=idx(22,20);p.task={t:'work',at:idx(22,20)};}}
 else{c.people.push({...structuredClone(c.people[0]),id:99,name:'Six'});c.army={club:1};c.t0=-3*SEASON_MS;c.seasonIdx=3;c.b[idx(19,20)]={k:'fire',lvl:1,doneAt:null};for(let n=0;n<2;n++)c.b[idx(32,20+n)]={k:'gather',lvl:1,doneAt:null};for(const [n,p]of c.people.entries()){p.pos=c.camp;p.task=n<4?{t:'work',at:idx(32,20+Math.floor(n/2))}:{t:'idle'};}}
 return c;
}
const fmt=(n:number)=>n.toLocaleString('vi-VN',{maximumFractionDigits:2});
export default function EconomyPreview(){
 const [era,setEra]=useState(1),[smelter,setSmelter]=useState(false),[city,setCity]=useState(()=>fixture(1,false)),[guide,setGuide]=useState(false);
 const reset=(e=era,s=smelter)=>{setEra(e);setSmelter(s);setCity(fixture(e,s));};
 const advance=(minutes:number)=>{const c=structuredClone(city);settle(c,c.last+minutes*MIN);setCity(c);};
 const costs=upkeepRates(era),st=stats(city,derive(city),city.last);
 return <main style={{padding:24,maxWidth:900,margin:'auto',color:'#eadbb7'}}><h1>Kiểm tra cân bằng thu chi</h1><p>Bản thử độc lập, không thay đổi làng người chơi.</p><div>{[1,2,3].map(e=><button key={e} aria-pressed={era===e} onClick={()=>reset(e)}>{ERA_NAMES[e]}</button>)}</div><div><button onClick={()=>reset(era,false)}>Làng mùa đông</button><button onClick={()=>reset(Math.max(2,era),true)}>Lò đúc đủ 3 thợ</button></div><p>{smelter?'Lò cấp 1, đủ 3 thợ, điểm nộp gần nguồn.':'6 dân, 1 lính, 4 người hái lượm; nguồn cách kho 12 ô; mùa đông; một bếp đang đốt củi.'}</p><p>Mỗi 10 phút: dân {costs.civilian.food/6} thực; lính {costs.soldier.food/6} thực. Gỗ sinh hoạt/bảo dưỡng: {costs.civilian.wood} / dân / giờ, {costs.soldier.wood} / quân / giờ.</p><p>Bếp: {fmt(st.fireWoodUse/6)} gỗ/10 phút · Lò: {fmt((st.woodUse-st.fireWoodUse)/60)} gỗ + {fmt(st.stoneUse/60)} đá/phút.</p><p role="status">Đã chạy {fmt(city.last/MIN)} phút · Kho: {fmt(city.res.food)} thực · {fmt(city.res.wood)} gỗ · {fmt(city.res.stone)} đá · {fmt(city.res.copper)} đồng.</p><button onClick={()=>advance(1)}>Chạy 1 phút</button><button onClick={()=>advance(10)}>Chạy 10 phút</button><button onClick={()=>reset()}>Đặt lại</button><button onClick={()=>setGuide(true)}>Cách chơi</button>{guide&&<HowToPlay onClose={()=>setGuide(false)}/>}</main>;
}
