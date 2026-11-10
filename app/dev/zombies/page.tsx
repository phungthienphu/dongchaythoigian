'use client';
import ZombieSimulation from './simulation';
import {useEffect,useRef,useState} from 'react';
import {drawZombieArt} from '@/components/zombie-art';
import {type ZombieKind,zombieStats} from '@/lib/zombies';
export default function ZombiePreview(){
 const canvas=useRef<HTMLCanvasElement>(null);
 const [pose,setPose]=useState('walk'),[blood,setBlood]=useState(true),[era,setEra]=useState(5),[face,setFace]=useState<1|-1>(1);
 useEffect(()=>{const cv=canvas.current!,ctx=cv.getContext('2d')!;let frame=0,last=0;
 const paint=(at:number)=>{if(!document.hidden&&at-last>=1000/30){last=at;ctx.fillStyle='#192e28';ctx.fillRect(0,0,960,350);
 (['normal','super','breaker']as ZombieKind[]).forEach((kind,i)=>{const x=160+i*320;ctx.fillStyle='#345244';ctx.beginPath();ctx.ellipse(x,255,90,30,0,0,Math.PI*2);ctx.fill();drawZombieArt(ctx,kind,x,255,3.5,{time:at,walking:pose==='walk',attacking:pose==='attack',emerging:pose==='emerge'?(Math.sin(at/1200)+1)/2:1,face,gore:blood});const s=zombieStats(kind,era);ctx.fillStyle='#eee2c3';ctx.font='18px sans-serif';ctx.textAlign='center';ctx.fillText(kind==='normal'?'Zombie thường':kind==='super'?'Super Zombie':'Zombie phá hoại',x,300);ctx.font='14px sans-serif';ctx.fillText(`${s.hp} HP · ${s.speed} ô/giây`,x,327);});}frame=requestAnimationFrame(paint);};frame=requestAnimationFrame(paint);return()=>cancelAnimationFrame(frame);},[pose,blood,era,face]);
 return <main style={{minHeight:'100vh',background:'#10231d',color:'#eee2c3',padding:24}}><h1>Tạo hình zombie</h1><p>Ba dáng riêng · vết thương và máu vừa phải · dùng cùng nét vẽ trong game.</p><div style={{display:'flex',gap:16,flexWrap:'wrap'}}><label>Hành động <select value={pose} onChange={e=>setPose(e.target.value)}><option value="idle">Đứng</option><option value="walk">Di chuyển</option><option value="attack">Tấn công</option><option value="emerge">Trồi lên</option></select></label><label>Thời đại <select value={era} onChange={e=>setEra(+e.target.value)}>{[1,3,4,5,6,7,8,9].map(n=><option key={n} value={n}>{n}</option>)}</select></label><label><input type="checkbox" checked={blood} onChange={e=>setBlood(e.target.checked)}/>Vết máu</label><button onClick={()=>setFace(f=>f===1?-1:1)}>Đổi hướng</button></div><canvas ref={canvas} width={960} height={350} style={{width:'100%',maxWidth:960,marginTop:20}} aria-label="Tạo hình và chuyển động của ba loại zombie"/><p>Thường từ Đá · Super từ Trung đại · Phá hoại và né hỏa lực từ Công nghiệp. Chọn đời chỉ đổi thông số xem trước, không đổi luật mở khóa.</p><ZombieSimulation/></main>;
}
