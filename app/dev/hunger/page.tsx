"use client";
// Isolated mood/renderer fixture; never loads or saves a player village.
import {useEffect,useRef,useState} from 'react';
import {newCity,G,idx,derive,ERA_NAMES,type City} from '@/lib/engine';
import {Crowd} from '@/components/villagers';
import {drawCity,type View} from '@/components/draw';
import {HungerNotice,HungryVillager} from '@/components/HungerStatus';
import {villagersHungry} from '@/lib/villager-mood';
const view:View={TW:88,TH:44,ox:460,oy:-180,width:920,height:500,s:88/64};
function fixture(era=1,food=0):City{const c=newCity(0,123);c.t.fill(G);c.seen.fill(1);c.people=c.people.slice(0,3);c.b={};c.herds=[];c.camps=[];c.era=era;c.res.food=food;for(const [n,p]of c.people.entries()){p.pos=idx(10+n*2,10);p.task={t:'idle'};}return c;}
export default function HungerPreview(){
 const [city,setCity]=useState(fixture),[showPeople,setShowPeople]=useState(true),canvas=useRef<HTMLCanvasElement>(null);
 useEffect(()=>{const crowd=new Crowd();crowd.sync(city);const ctx=canvas.current?.getContext('2d'),d=derive(city);let raf=0;const paint=(time:number)=>{crowd.update(city,0,0);if(ctx)drawCity(ctx,city,d,{v:view,now:0,anim:time,hover:null,selected:null,tool:null,villagers:crowd.list,picked:new Set([city.people[2].id]),fx:[],chopping:new Set()});raf=requestAnimationFrame(paint);};raf=requestAnimationFrame(paint);return()=>cancelAnimationFrame(raf);},[city]);
 return <main style={{padding:16,maxWidth:960,margin:'auto',color:'#eadbb7'}}><h1>Dân đói và lời than theo thời đại</h1><p>Bản thử độc lập, không thay đổi làng người chơi.</p><div>{[1,2,3].map(era=><button key={era} aria-pressed={city.era===era} onClick={()=>setCity(fixture(era,city.res.food))}>{ERA_NAMES[era]}</button>)}</div><button onClick={()=>setCity(fixture(city.era,0))}>Cho kho hết thức ăn</button><button onClick={()=>setCity(fixture(city.era,10))}>Nộp 10 lương thực vào kho</button><p role="status">Kho: {city.res.food} lương thực · {villagersHungry(city)?'Dân đang đói':'Dân đã có thức ăn'}</p><HungerNotice city={city} onFindFood={()=>setShowPeople(true)}/>{showPeople&&<ul>{city.people.map(p=><li key={p.id}>{p.name}<HungryVillager city={city} person={p}/><small>Việc đang giao: Rảnh</small></li>)}</ul>}<canvas ref={canvas} width={920} height={500} style={{width:'100%'}} aria-label={villagersHungry(city)?'Dân có nhãn Đói và lời than trên đầu':'Dân không còn nhãn Đói hoặc lời than'}/></main>;
}
