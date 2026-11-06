'use client';
import {useState} from 'react';
import BattleView from '@/components/BattleView';
import {createBattle} from '@/lib/battle';
import {newCity,G,R,W,idx} from '@/lib/engine';
function fixture(){
 const city=newCity(0,123);city.t.fill(G);city.seen.fill(1);city.b={};city.people=[];city.herds=[];city.camps=[];city.camp=idx(5,5);city.army={sword:20};
 city.homeOrders=Object.fromEntries(Array.from({length:20},(_,n)=>[`sword:${n}`,{route:[idx(5,5)],at:0,x:5.5,y:5.5}]));
 for(let y=0;y<W;y++)city.t[idx(7,y)]=R;
 const battle=createBattle({id:'local-defense',attackerId:'a',defenderId:'d',attacker:city,defender:city,troops:{club:1},now:0,defenderOnline:true});
 for(const g of battle.groups){g.x=g.side==='attacker'?8.5:5.5;g.y=5.5;g.order={type:'guard',x:g.x,y:g.y};}
 return {village:city,battle,side:'defender' as const,socket:null,war:{_id:'local-defense',attackerName:'Địch thử',defenderName:'Làng local',status:'fighting' as const,attackerId:'a',defenderId:'d',troops:{club:1},arrive:0}};
}
export default function Preview(){
 const [packet]=useState(fixture),[open,setOpen]=useState(true);
 return open?<BattleView id="local-defense" preview={packet} onClose={()=>setOpen(false)}/>:<main><p>Bản thử đã đóng.</p><button onClick={()=>setOpen(true)}>Mở lại</button></main>;
}
