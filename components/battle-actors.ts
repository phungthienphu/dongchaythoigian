import type { BattleState, BattleGroup } from '@/lib/battle';
import { drawSoldier as drawUnit } from './draw';
type Point = { x: number; y: number };
/** Render only server-confirmed strikes; never infer hits from proximity. */
export function drawBattleStrikes(ctx: CanvasRenderingContext2D, battle: BattleState, project: (x:number,y:number)=>Point, scale:number, now:number) {
  for (const e of battle.strikes ?? []) {
    const age=now-e.at;
    if(age<0||age>650)continue;
    const a=project(e.from.x,e.from.y),b=project(e.to.x,e.to.y);
    a.y-= (e.source.startsWith('b:')?38:12)*scale;b.y-=8*scale;
    ctx.save();ctx.globalAlpha=Math.min(1,(650-age)/150);
    if(e.kind==='melee') {
      ctx.strokeStyle='#ffdc91';ctx.lineWidth=2;ctx.beginPath();ctx.arc(b.x,b.y,Math.max(3,12*age/650),-.8,1.8);ctx.stroke();
    } else {
      const t=Math.min(1,age/500),x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t-Math.sin(t*Math.PI)*18*scale;
      const angle=Math.atan2(b.y-a.y-Math.cos(t*Math.PI)*18*scale*Math.PI,b.x-a.x);
      ctx.translate(x,y);ctx.rotate(angle);
      if(e.kind==='stone'){ctx.fillStyle='#d9d4bc';ctx.beginPath();ctx.arc(0,0,3,0,Math.PI*2);ctx.fill();}
      else {ctx.strokeStyle='#f5dfad';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(-13,0);ctx.lineTo(3,0);ctx.moveTo(0,-3);ctx.lineTo(4,0);ctx.lineTo(0,3);ctx.moveTo(-12,-3);ctx.lineTo(-9,0);ctx.lineTo(-12,3);ctx.stroke();}
    }
    ctx.restore();
  }
}
export function drawSoldier(ctx:CanvasRenderingContext2D,g:BattleGroup,x:number,y:number,scale:number,time:number,attacking:boolean) {
  const walking=g.order.type==='move'||g.order.type==='retreat'||!!g.path?.length;
  const face=g.order.type==='move' ? (g.order.x-g.x-(g.order.y-g.y)>=0?1:-1) : g.side==='attacker'?1:-1;
  ctx.save();
  drawUnit({c:ctx,v:{TW:64,TH:32,ox:x,oy:y,s:Math.max(.6,Math.min(1.6,scale)),width:0,height:0},anim:time},g.u,0,0,face,walking,g.u.length*.37,attacking);
  ctx.restore();
}
