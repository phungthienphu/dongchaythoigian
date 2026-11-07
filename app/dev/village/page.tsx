"use client";
import {useEffect,useRef,useState} from 'react';
import {drawCity,pickVillageTarget,type View} from '@/components/draw';
import {Crowd} from '@/components/villagers';
import HowToPlay from '@/components/HowToPlay';
import {newCity,derive,idx,G,HL,sendEnvoy,envoyVillagePosition,buildingName,type City,type BKey} from '@/lib/engine';
const view:View={TW:88,TH:44,ox:470,oy:-650,width:940,height:540,s:88/64};
function fixture(){const c=newCity(0,123);c.era=2;c.t.fill(G);c.seen.fill(1);c.b={};c.camps=[];c.herds=[];c.people=c.people.slice(0,3);c.camp=idx(20,20);c.res={food:500,wood:500,stone:500,copper:100, gold: 0, diamond:0,coal:0};
 for(const [x,y,k] of [[20,20,'house'],[22,20,'farm'],[18,20,'envoy'],[22,23,'logistics'],[20,23,'infirmary']] as const)c.b[idx(x,y)]={k,lvl:1,doneAt:null};
 c.t[idx(18,19)]=HL;c.t[idx(17,19)]=HL;
 c.people[0].task={t:'idle'};c.people[0].pos=idx(20,20);
 for(const p of c.people.slice(1)){p.task={t:'work',at:idx(22,20)};p.pos=idx(22,20);p.haul={phase:'work',at:0,nextAt:100000,tile:idx(22,20),route:[idx(22,20)],routeStart:0,carried:0,capacity:10,workRate:5400,resource:'food',source:{kind:'building',key:idx(22,20)},taskKey:'farm'};}
 sendEnvoy(c,'preview','Làng xem thử',4,0);return c;
}
export default function VillagePreview(){const canvas=useRef<HTMLCanvasElement>(null),city=useRef<City|null>(null),crowd=useRef(new Crowd());const [message,setMessage]=useState('Bấm nhà có người đứng trước để kiểm tra chọn công trình.'),[help,setHelp]=useState(false),[tool,setTool]=useState<BKey|null>(null),[depleted,setDepleted]=useState(false),[returning,setReturning]=useState(false);
 useEffect(()=>{const c=fixture();city.current=c;crowd.current.sync(c);const D=derive(c);let raf=0,start=performance.now();const paint=(at:number)=>{const cv=canvas.current,ctx=cv?.getContext('2d');if(!ctx)return;const tr=c.trips![0];const elapsed=(at-start)%20000,now=returning?tr.back-20000+elapsed:elapsed;c.b[idx(22,20)].fertility=depleted?0:600;
  for(const p of c.people.slice(1)){if(depleted)delete p.haul;}
  crowd.current.update(c,.016,now);const person=crowd.current.list.find(v=>v.id===c.people[0].id);if(person){person.fx=20.5;person.fy=20.5;person.visible=true;person.state='rest';}
  drawCity(ctx,c,D,{v:view,now,anim:at,hover:null,selected:null,tool,villagers:crowd.current.list,picked:new Set(),fx:[],chopping:new Set()});
  const pos=envoyVillagePosition(tr,now);if(pos){ctx.fillStyle='#f5e4ba';ctx.font='14px system-ui';ctx.fillText(returning?'Sứ giả đang về làng':'Sứ giả đang rời làng',16,24);}
  raf=requestAnimationFrame(paint);};raf=requestAnimationFrame(paint);return()=>cancelAnimationFrame(raf);
 },[tool,depleted,returning]);
 return <main style={{padding:16,background:'#19362b',color:'#f4e7c5',minHeight:'100vh'}}><h1>Kiểm tra tương tác làng</h1><p>Bản xem thử độc lập, không lưu tài khoản. Click thường chọn nhà; giữ Shift để chọn người che nhà.</p><div style={{display:'flex',gap:8,flexWrap:'wrap'}}><button onClick={()=>setHelp(true)}>Cách chơi</button><button onClick={()=>setTool(v=>v?null:'hut')}>Bật/tắt gợi ý ô xây</button><button onClick={()=>setDepleted(v=>!v)}>Ruộng {depleted?'đã cạn':'đang tốt'}</button><button onClick={()=>setReturning(v=>!v)}>Sứ giả {returning?'đang về':'đang đi'}</button></div><p role="status">{message}</p><canvas ref={canvas} width={940} height={540} style={{width:'100%',maxWidth:940,border:'1px solid #72936c'}} aria-label="Nhà có người đứng trước, hai nông dân, sứ giả, xe lương và quân y" onClick={e=>{const c=city.current;if(!c)return;const rect=e.currentTarget.getBoundingClientRect(),target=pickVillageTarget(view,c,crowd.current.list,performance.now(),(e.clientX-rect.left)*940/rect.width,(e.clientY-rect.top)*540/rect.height,e.shiftKey||e.ctrlKey||e.metaKey);setMessage(target?.type==='building'?`Đã chọn công trình: ${buildingName(c,c.b[idx(target.cell.x,target.cell.y)].k)}`:target?.type==='person'?`Đã chọn dân: ${target.person.id}`:'Đất trống');}}/>{help&&<HowToPlay onClose={()=>setHelp(false)}/>}</main>;
}
