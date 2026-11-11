import { MAGIC_SPELLS } from '@/lib/magic-data';
import type { BattleState, BattleGroup, BattleStrike } from '@/lib/battle';
import { drawSoldier as drawUnit } from './draw';
type Point = { x: number; y: number };
type Ctx = CanvasRenderingContext2D;
const glow = (ctx: Ctx, x: number, y: number, r: number, rgb: string, a: number) => {
  if (a <= 0 || r <= 0) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
};
/** Iso ground ellipse for `rad` tiles around a world point. */
function groundEllipse(project: (x: number, y: number) => Point, x: number, y: number, rad: number) {
  const c = project(x, y), e = project(x + rad * .7071, y - rad * .7071), n = project(x + rad * .7071, y + rad * .7071);
  return { c, rx: Math.abs(e.x - c.x), ry: Math.abs(n.y - c.y) };
}
function bolt(ctx: Ctx, x: number, y: number, scale: number, t: number) {
  const top = y - 150 * scale; ctx.beginPath(); ctx.moveTo(x + 10 * scale, top);
  for (let k = 1; k <= 6; k++) ctx.lineTo(x + (k % 2 ? -9 : 8) * scale * (1 - k / 7), top + (y - top) * k / 6);
  ctx.strokeStyle = 'rgba(190,220,255,.55)'; ctx.lineWidth = 6 * scale; ctx.stroke();
  ctx.strokeStyle = `rgba(255,250,215,${1 - t * .5})`; ctx.lineWidth = 2.6 * scale; ctx.stroke();
  glow(ctx, x, y, 34 * scale, '255,246,200', .75 * (1 - t));
}
/** Spell areas and heal pulses derived from battle state; purely visual. */
function drawBattleSpells(ctx: Ctx, battle: BattleState, project: (x: number, y: number) => Point, scale: number, now: number, still: boolean) {
  for (const e of battle.spellEffects ?? []) {
    if (now < e.start || now >= e.until + 400) continue;
    if (e.kind === 'thunder') {
      const { c, rx, ry } = groundEllipse(project, e.x, e.y, MAGIC_SPELLS.thunder.radius), t = Math.max(0, Math.min(1, (now - e.start) / Math.max(1, e.until - e.start)));
      ctx.fillStyle = 'rgba(255,215,90,.13)'; ctx.beginPath(); ctx.ellipse(c.x, c.y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,200,80,.22)'; ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.ellipse(c.x, c.y, rx, ry, 0, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * t); ctx.closePath(); ctx.fill();
      ctx.setLineDash([6, 4]); ctx.strokeStyle = 'rgba(255,225,120,.95)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(c.x, c.y, rx, ry, 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      if (now < e.until) { ctx.fillStyle = '#ffe38a'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(`ϟ ${Math.ceil((e.until - now) / 1000)}`, c.x, c.y - 6); }
    } else if (now < e.until) {
      const { c, rx, ry } = groundEllipse(project, e.x, e.y, MAGIC_SPELLS.sanctuary.radius), h = rx * .55, fade = Math.min(1, (e.until - now) / 1500);
      const g = ctx.createLinearGradient(c.x, c.y - h, c.x, c.y); g.addColorStop(0, `rgba(255,240,170,${.22 * fade})`); g.addColorStop(1, `rgba(150,240,190,${.12 * fade})`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(c.x, c.y, rx, ry, 0, 0, Math.PI); ctx.ellipse(c.x, c.y, rx, h, 0, Math.PI, 0); ctx.fill();
      ctx.strokeStyle = `rgba(255,240,180,${.65 * fade})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(c.x, c.y, rx, h, 0, Math.PI, 0); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(c.x, c.y, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
      for (let k = 1; k < 5; k++) { const a = Math.PI + k * Math.PI / 5; ctx.beginPath(); ctx.moveTo(c.x + Math.cos(a) * rx, c.y); ctx.lineTo(c.x + Math.cos(a) * rx * .15, c.y - h * .98); ctx.stroke(); }
    }
  }
  for (const g of battle.groups) {
    if (!g.count || g.escaped) continue;
    let age = -1, rad = 0, rgb = '';
    if (g.u === 'watermage' && g.castAt) { age = now - (g.castAt - MAGIC_SPELLS.waterheal.cooldown); rad = MAGIC_SPELLS.waterheal.radius; rgb = '143,224,255'; }
    else if (g.u === 'phoenix') { age = (now - battle.startedAt) % 10_000; rad = 3; rgb = '255,210,122'; }
    if (age < 0 || age > 1400) continue;
    const t = age / 1400, { c, rx, ry } = groundEllipse(project, g.x, g.y, rad * (still ? 1 : .4 + .6 * t));
    ctx.strokeStyle = `rgba(${rgb},${.85 * (1 - t) + .1})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(c.x, c.y, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
    for (let k = 0; k < 5; k++) { const a = k * Math.PI * 2 / 5, px = c.x + Math.cos(a) * rx * .5, py = c.y + Math.sin(a) * ry * .5 - (8 + t * 22) * scale;
      ctx.strokeStyle = `rgba(235,255,245,${1 - t})`; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(px - 3, py); ctx.lineTo(px + 3, py); ctx.moveTo(px, py - 3); ctx.lineTo(px, py + 3); ctx.stroke(); }
  }
}
type Look = 'fireball' | 'firebolt' | 'waterbolt' | 'breath' | 'feather' | 'thunder' | 'slam' | null;
function lookOf(e: BattleStrike, source: BattleGroup | undefined): Look {
  if (e.source.endsWith(':thunder')) return 'thunder';
  const u = source?.u;
  if (u === 'firemage') return e.kind === 'shell' ? 'fireball' : 'firebolt';
  if (u === 'watermage') return 'waterbolt';
  if (u === 'dragon') return 'breath';
  if (u === 'phoenix') return 'feather';
  if (u === 'golem' || u === 'tortoise') return 'slam';
  return null;
}
/** Render only server-confirmed strikes; never infer hits from proximity. */
export function drawBattleStrikes(ctx: CanvasRenderingContext2D, battle: BattleState, project: (x:number,y:number)=>Point, scale:number, now:number, still=false) {
  ctx.save();drawBattleSpells(ctx,battle,project,scale,now,still);ctx.restore();
  const groups=new Map(battle.groups.map(g=>[g.id,g]));
  for (const e of battle.strikes ?? []) {
    const age=now-e.at,look=lookOf(e,groups.get(e.source)),life=look==='fireball'?900:look==='thunder'?700:650;
    if(age<0||age>life)continue;
    const a=project(e.from.x,e.from.y),b=project(e.to.x,e.to.y);
    a.y-= (e.source.startsWith('b:')?38:look==='breath'?36:look==='feather'?40:12)*scale;b.y-=8*scale;
    ctx.save();ctx.globalAlpha=Math.min(1,(life-age)/150);
    if(look==='thunder'){bolt(ctx,b.x,b.y+8*scale,scale,age/life);ctx.restore();continue;}
    if(look==='fireball'){
      const t=age/life;
      if(t<.55){const p=t/.55,x=a.x+(b.x-a.x)*p,y=a.y+(b.y-a.y)*p-Math.sin(p*Math.PI)*22*scale;
        for(let k=1;k<5;k++){const q=Math.max(0,p-k*.05);ctx.fillStyle=`rgba(255,140,60,${.5-k*.1})`;ctx.beginPath();ctx.arc(a.x+(b.x-a.x)*q,a.y+(b.y-a.y)*q-Math.sin(q*Math.PI)*22*scale,(5-k*.8)*scale,0,Math.PI*2);ctx.fill();}
        glow(ctx,x,y,14*scale,'255,170,80',.9);ctx.fillStyle='#ffe7a0';ctx.beginPath();ctx.arc(x,y,4*scale,0,Math.PI*2);ctx.fill();}
      else{const p=(t-.55)/.45,{rx,ry}=groundEllipse(project,e.to.x,e.to.y,MAGIC_SPELLS.fireball.radius);
        glow(ctx,b.x,b.y,30*scale*(.5+p),'255,138,58',.85*(1-p));ctx.strokeStyle=`rgba(255,215,130,${1-p})`;ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(b.x,b.y+8*scale,rx*p,ry*p,0,0,Math.PI*2);ctx.stroke();}
      ctx.restore();continue;
    }
    if(e.kind==='melee') {
      if(look==='slam'){const p=age/650;ctx.strokeStyle='rgba(222,205,165,.9)';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(b.x,b.y+6*scale,(6+18*p)*scale,(3+8*p)*scale,0,0,Math.PI*2);ctx.stroke();
        for(let k=0;k<4;k++){const d=(k-1.5)*7*scale;ctx.fillStyle='#bfb291';ctx.fillRect(b.x+d,b.y+4*scale-p*10*scale,2.5*scale,2.5*scale);}}
      else{ctx.strokeStyle='#ffdc91';ctx.lineWidth=2;ctx.beginPath();ctx.arc(b.x,b.y,Math.max(3,12*age/650),-.8,1.8);ctx.stroke();}
    } else {
      const t=Math.min(1,age/500),x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t-Math.sin(t*Math.PI)*18*scale;
      if(look){
        // Magic shots: a glowing mote with a short tail and a burst on arrival.
        const rgb=look==='firebolt'||look==='feather'?'255,160,70':look==='waterbolt'?'140,220,255':'170,245,255',core=look==='waterbolt'?'#e9fbff':look==='breath'?'#e8fffb':'#fff0b8';
        if(t<1){for(let k=1;k<4;k++){const q=Math.max(0,t-k*.06);glow(ctx,a.x+(b.x-a.x)*q,a.y+(b.y-a.y)*q-Math.sin(q*Math.PI)*18*scale,(5-k)*scale,rgb,.5);}
          glow(ctx,x,y,(look==='breath'?12:8)*scale,rgb,.9);ctx.fillStyle=core;ctx.beginPath();ctx.arc(x,y,(look==='breath'?3.5:2.4)*scale,0,Math.PI*2);ctx.fill();}
        else{const p=Math.min(1,(age-500)/150);glow(ctx,b.x,b.y,16*scale,rgb,.8*(1-p));}
        ctx.restore();continue;
      }
      const angle=Math.atan2(b.y-a.y-Math.cos(t*Math.PI)*18*scale*Math.PI,b.x-a.x);
      ctx.translate(x,y);ctx.rotate(angle);
      if(e.kind==='bullet'){ctx.strokeStyle='#ffe7a1';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-9,0);ctx.lineTo(4,0);ctx.stroke();}
      else if(e.kind==='shell'){ctx.fillStyle='#414a40';ctx.beginPath();ctx.arc(0,0,4*scale,0,Math.PI*2);ctx.fill();if(t>=.9){ctx.strokeStyle='#ffc96c';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,12*scale,0,Math.PI*2);ctx.stroke();}}
      else if(e.kind==='stone'){ctx.fillStyle='#d9d4bc';ctx.beginPath();ctx.arc(0,0,3,0,Math.PI*2);ctx.fill();}
      else {ctx.strokeStyle='#f5dfad';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(-13,0);ctx.lineTo(3,0);ctx.moveTo(0,-3);ctx.lineTo(4,0);ctx.lineTo(0,3);ctx.moveTo(-12,-3);ctx.lineTo(-9,0);ctx.lineTo(-12,3);ctx.stroke();}
    }
    ctx.restore();
  }
}
export function drawSoldier(ctx:CanvasRenderingContext2D,g:BattleGroup,x:number,y:number,scale:number,time:number,attacking:boolean,extra:{casting?:boolean;hurt?:boolean}={}) {
  const walking=g.moving===true&&!attacking;
  const face=g.order.type==='move' ? (g.order.x-g.x-(g.order.y-g.y)>=0?1:-1) : g.side==='attacker'?1:-1;
  ctx.save();
  drawUnit({c:ctx,v:{TW:64,TH:32,ox:x,oy:y,s:Math.max(.6,Math.min(1.6,scale)),width:0,height:0},anim:time},g.u,0,0,face,walking,g.u.length*.37,attacking,false,undefined,extra);
  ctx.restore();
}
