"use client";
import { useEffect, useRef, useState } from 'react';
import { drawSoldier, drawBattleStrikes } from '@/components/battle-actors';
import { advanceBattle, createBattle, type BattleGroup, type BattleState, type BattleStrike } from '@/lib/battle';
import { MAGIC_SPELLS } from '@/lib/magic-data';
import { drawEnvoyActor } from '@/components/draw';
import { newCity, UKEYS, UNITS } from '@/lib/engine';
import UnitPortrait from '@/components/UnitPortrait';
const MAGIC_ROW=['firemage','watermage','golem','spiritdeer','dragon','tortoise','phoenix'] as const;
/** Scripted 8-second loop of every battle spell visual; no simulation or account data. */
function SpellGallery(){
 const canvas=useRef<HTMLCanvasElement>(null),[still,setStill]=useState(false);
 useEffect(()=>{if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)setStill(true);},[]);
 useEffect(()=>{
  const ctx=canvas.current?.getContext('2d');if(!ctx)return;let raf=0;const start=performance.now();
  const g=(id:string,u:BattleGroup['u'],x:number,y:number,side:BattleGroup['side']='attacker',extra:Partial<BattleGroup>={}):BattleGroup=>({id,side,u,count:1,initial:1,hp:1,x,y,order:{type:'guard',x,y},...extra});
  const project=(x:number,y:number)=>({x:450+(x-y)*40,y:40+(x+y)*18});
  const paint=(t:number)=>{
   const now=still?2600:(t-start)%8000,cycle=(n:number)=>Math.floor(now/n)*n;
   const groups=[g('fm','firemage',1,5),g('wm','watermage',2,6,'attacker',{castAt:cycle(4000)+600+MAGIC_SPELLS.waterheal.cooldown}),g('dr','dragon',4,9),g('ph','phoenix',5,10),g('go','golem',8,4),g('tu','tortoise',9,5),g('de','spiritdeer',7,7),
    g('z1','club',6,2,'defender'),g('z2','spear',7,1,'defender'),g('z3','club',11,6,'defender'),g('z4','sword',12,9,'defender')];
   const strikes:BattleStrike[]=[
    {id:'a',at:cycle(2000),source:'fm',kind:'shell',from:{x:1,y:5},to:{x:6,y:2}},
    {id:'b',at:cycle(1000)+300,source:'wm',kind:'arrow',from:{x:2,y:6},to:{x:7,y:1}},
    {id:'c',at:cycle(2000)+500,source:'dr',kind:'shell',from:{x:4,y:9},to:{x:11,y:6}},
    {id:'d',at:cycle(2000)+900,source:'ph',kind:'arrow',from:{x:5,y:10},to:{x:12,y:9}},
    {id:'e',at:cycle(2500),source:'go',kind:'melee',from:{x:8,y:4},to:{x:8.6,y:3.2}},
    {id:'f',at:cycle(3000)+1200,source:'tu',kind:'melee',from:{x:9,y:5},to:{x:9.8,y:4.6}},
   ];
   const t0=cycle(8000);
   if(now>=5000&&now<5700)strikes.push({id:'g',at:t0+5000,source:'defender:thunder',kind:'shell',from:{x:9,y:1},to:{x:9,y:1}});
   const battle={groups,strikes,startedAt:0,lastTick:now,spellEffects:[{id:'defender:thunder',side:'defender',kind:'thunder',x:9,y:1,start:t0,until:t0+5000},{id:'attacker:sanctuary',side:'attacker',kind:'sanctuary',x:4,y:6.5,start:t0+1000,until:t0+7500}]} as unknown as BattleState;
   ctx.fillStyle='#263d35';ctx.fillRect(0,0,900,460);
   drawBattleStrikes(ctx,battle,project,1,now,still);
   for(const grp of [...groups].sort((a,b)=>a.x+a.y-b.x-b.y)){const at=project(grp.x,grp.y),attacking=strikes.some(e=>e.source===grp.id&&now-e.at>=0&&now-e.at<650);
    drawSoldier(ctx,grp,at.x,at.y,1.2,still?0:t,attacking,{casting:grp.u==='watermage'&&now%4000>=600&&now%4000<1300||grp.u==='firemage'&&now%2000<400});}
   ctx.fillStyle='#f4e6c6';ctx.font='14px system-ui';ctx.textAlign='left';
   ctx.fillText('Hỏa cầu · Thủy hồi · Long tức · Lông lửa · Golem/Huyền Quy đập · Hộ giới (vòm) · Thiên lôi (vùng báo 5 giây rồi sét)',16,440);
   if(!still)raf=requestAnimationFrame(paint);
  };raf=requestAnimationFrame(paint);return()=>cancelAnimationFrame(raf);
 },[still]);
 return <section><h2>Phép và thần thú trong trận</h2><p>Vòng lặp dựng sẵn để xem hiệu ứng; sát thương thật do mô phỏng quyết định.</p>
  <label><input type="checkbox" checked={still} onChange={e=>setStill(e.target.checked)}/> Giảm chuyển động</label>
  <canvas ref={canvas} width={900} height={460} style={{width:'100%',maxWidth:900,display:'block',marginTop:8}} aria-label="Hiệu ứng phép thuật trong trận"/>
  <div style={{display:'flex',gap:12,flexWrap:'wrap',marginTop:12}}>{MAGIC_ROW.map(u=><figure key={u} style={{margin:0,textAlign:'center'}}><UnitPortrait unit={u}/><figcaption>{UNITS[u].n}</figcaption></figure>)}</div>
 </section>;
}
export default function CombatGallery(){
 const canvas=useRef<HTMLCanvasElement>(null);
 useEffect(()=>{
  const ctx=canvas.current?.getContext('2d');if(!ctx)return;
  const city=newCity(0,123),s=createBattle({id:'preview',attackerId:'a',defenderId:'b',attacker:city,defender:city,troops:{club:1000},now:0});
  s.buildings=[{id:'b:tower',tile:5*96+8,k:'watchtower',lvl:1,hp:100,maxHp:100,burned:false,initiallyBurned:false,value:100}];
  s.groups[0].x=5;s.groups[0].y=5;s.groups[0].order={type:'guard',x:5,y:5};let raf=0,start=performance.now();
  const paint=(now:number)=>{if(now-start>20000){start=now;s.lastTick=0;s.startedAt=0;s.strikes=[];s.status="fighting";s.groups[0].hp=20000;s.groups[0].count=1000;}advanceBattle(s,now-start);ctx.fillStyle='#263d35';ctx.fillRect(0,0,840,520);
   ctx.fillStyle='#f4e6c6';ctx.font='16px system-ui';ctx.textAlign='center';
   UKEYS.filter(u=>UNITS[u].mana===undefined).forEach((u,i)=>{const x=65+i*100;drawSoldier(ctx,{...s.groups[0],u,side:i%2?'defender':'attacker',order:{type:'move',x:10,y:5}},x,115,1.6,now,true);ctx.fillText(UNITS[u].n,x,155);});
   [1,2,3].forEach((era,i)=>{drawEnvoyActor(ctx,era,280+i*140,225,1.2,now,true);ctx.fillStyle='#f4e6c6';ctx.fillText('Sứ giả · đời '+era,280+i*140,255);});
   ctx.fillStyle='#9d7952';ctx.fillRect(575,370,34,75);ctx.fillStyle='#dec18c';ctx.fillRect(563,360,58,12);
   drawSoldier(ctx,{...s.groups[0],u:'bow',side:'defender'},592,360,1.2,now,true);
   drawSoldier(ctx,s.groups[0],280,440,1.5,now,false);
   drawBattleStrikes(ctx,s,(x,y)=>({x:280+(x-5)*89.14,y:440+(y-5)*-52}),1,now-start);
   ctx.fillStyle='#f4e6c6';ctx.fillText('Chòi canh bắn mục tiêu trong tầm — sát thương do mô phỏng quyết định',420,495);
   raf=requestAnimationFrame(paint);
  };raf=requestAnimationFrame(paint);return()=>cancelAnimationFrame(raf);
 },[]);
 return <main style={{padding:24,background:'#172b24',minHeight:'100vh',color:'#f4e6c6'}}><h1>Quân lính và hỏa lực phòng thủ</h1><p>Bản xem thử độc lập, không tác động tài khoản.</p><canvas ref={canvas} width={840} height={520} style={{width:'100%',maxWidth:840}} aria-label="Tám loại quân và chòi canh bắn tên"/><SpellGallery/></main>;
}
