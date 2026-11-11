'use client';
import {useEffect,useRef,useState} from 'react';
import {B,derive,newCity,buildingCost,costText,type BKey} from '@/lib/engine';
import {MAGIC_EXPANSION} from '@/lib/building-expansion';
import {drawThumb} from '@/components/draw';
const preview=newCity(0,123),D=derive(preview);
const keys=['hydroponics','recyclingworks',...Object.keys(MAGIC_EXPANSION)] as BKey[];
function Card({kind,level,season}:{kind:BKey;level:number;season:number}){
 const ref=useRef<HTMLCanvasElement>(null),d=B[kind],city={...preview,era:d.era};
 useEffect(()=>{if(ref.current)drawThumb(ref.current,{...preview,era:d.era},D,kind,season,level,1500);},[kind,d.era,level,season]);
 return <article style={{background:'#223a32',border:'1px solid #637b65',borderRadius:12,padding:20,display:'flex',flexDirection:'column'}}><canvas ref={ref} aria-label={`${d.n} cấp ${level}`} style={{width:160,height:220,alignSelf:'center'}}/><small style={{color:'#d9b777'}}>Thời {d.era} · Cấp {level}</small><h2 style={{fontSize:21,margin:'8px 0'}}>{d.n}</h2><p style={{fontSize:13,lineHeight:1.7,flex:1}}>{d.d}</p><p style={{color:'#e0c58b',fontSize:12}}>Giá xây cấp 1: {costText(buildingCost(kind,city.era))} · {d.sec/3600} giờ</p></article>;
}
export default function ExpansionGallery(){
 const [era,setEra]=useState(7),[level,setLevel]=useState(1),[season,setSeason]=useState(0);
 return <main style={{background:'#122820',color:'#f0eddc',minHeight:'100dvh',padding:'24px max(16px,4vw)'}}><p style={{color:'#d9b777'}}>BẢN THỬ · CÔNG TRÌNH MỞ RỘNG</p><h1 style={{fontSize:32}}>Một đô thị, nhiều cách phát triển</h1><p>Hiện đại thêm 2 loại. Ma pháp: 20 / 18 / 14 loại ở thời 7 / 8 / 9. Dưới đây là 28 công trình mới; mỗi nhà có đánh đổi riêng về đất, thợ, điện, mana hoặc vật liệu.</p><div style={{display:'flex',flexWrap:'wrap',gap:20,margin:'24px 0'}}><label>Thời đại <select aria-label="Thời đại xem trước" value={era} onChange={e=>setEra(+e.target.value)}>{[6,7,8,9].map(v=><option value={v} key={v}>Thời {v} · {keys.filter(k=>B[k].era===v).length} nhà mới</option>)}</select></label><label>Cấp <select aria-label="Cấp xem trước" value={level} onChange={e=>setLevel(+e.target.value)}>{[1,2,3].map(v=><option key={v} value={v}>{v}</option>)}</select></label><label>Mùa <select aria-label="Mùa xem trước" value={season} onChange={e=>setSeason(+e.target.value)}>{['Xuân','Hạ','Thu','Đông'].map((v,i)=><option value={i} key={v}>{v}</option>)}</select></label></div><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,280px),1fr))',gap:20}}>{keys.filter(k=>B[k].era===era).map(k=><Card key={k} kind={k} level={B[k].up?level:1} season={season}/>)}</div></main>;
}
