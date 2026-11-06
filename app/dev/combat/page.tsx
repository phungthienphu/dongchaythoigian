"use client";
import { useEffect, useRef } from 'react';
import { drawSoldier, drawBattleStrikes } from '@/components/battle-actors';
import { advanceBattle, createBattle } from '@/lib/battle';
import { drawEnvoyActor } from '@/components/draw';
import { newCity, UKEYS, UNITS } from '@/lib/engine';
export default function CombatGallery(){
 const canvas=useRef<HTMLCanvasElement>(null);
 useEffect(()=>{
  const ctx=canvas.current?.getContext('2d');if(!ctx)return;
  const city=newCity(0,123),s=createBattle({id:'preview',attackerId:'a',defenderId:'b',attacker:city,defender:city,troops:{club:1000},now:0});
  s.buildings=[{id:'b:tower',tile:5*96+8,k:'watchtower',lvl:1,hp:100,maxHp:100,burned:false,initiallyBurned:false,value:100}];
  s.groups[0].x=5;s.groups[0].y=5;s.groups[0].order={type:'guard',x:5,y:5};let raf=0,start=performance.now();
  const paint=(now:number)=>{if(now-start>20000){start=now;s.lastTick=0;s.startedAt=0;s.strikes=[];s.status="fighting";s.groups[0].hp=20000;s.groups[0].count=1000;}advanceBattle(s,now-start);ctx.fillStyle='#263d35';ctx.fillRect(0,0,840,520);
   ctx.fillStyle='#f4e6c6';ctx.font='16px system-ui';ctx.textAlign='center';
   UKEYS.forEach((u,i)=>{const x=65+i*100;drawSoldier(ctx,{...s.groups[0],u,side:i%2?'defender':'attacker',order:{type:'move',x:10,y:5}},x,115,1.6,now,true);ctx.fillText(UNITS[u].n,x,155);});
   [1,2,3].forEach((era,i)=>{drawEnvoyActor(ctx,era,280+i*140,225,1.2,now,true);ctx.fillStyle='#f4e6c6';ctx.fillText('Sứ giả · đời '+era,280+i*140,255);});
   ctx.fillStyle='#9d7952';ctx.fillRect(575,370,34,75);ctx.fillStyle='#dec18c';ctx.fillRect(563,360,58,12);
   drawSoldier(ctx,{...s.groups[0],u:'bow',side:'defender'},592,360,1.2,now,true);
   drawSoldier(ctx,s.groups[0],280,440,1.5,now,false);
   drawBattleStrikes(ctx,s,(x,y)=>({x:280+(x-5)*89.14,y:440+(y-5)*-52}),1,now-start);
   ctx.fillStyle='#f4e6c6';ctx.fillText('Chòi canh bắn mục tiêu trong tầm — sát thương do mô phỏng quyết định',420,495);
   raf=requestAnimationFrame(paint);
  };raf=requestAnimationFrame(paint);return()=>cancelAnimationFrame(raf);
 },[]);
 return <main style={{padding:24,background:'#172b24',minHeight:'100vh',color:'#f4e6c6'}}><h1>Quân lính và hỏa lực phòng thủ</h1><p>Bản xem thử độc lập, không tác động tài khoản.</p><canvas ref={canvas} width={840} height={520} style={{width:'100%',maxWidth:840}} aria-label="Tám loại quân và chòi canh bắn tên"/></main>;
}
