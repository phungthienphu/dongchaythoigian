'use client';
import {useState} from 'react';
import ExpeditionReadiness from '@/components/ExpeditionReadiness';
import {expeditionReadiness} from '@/lib/expedition-readiness';
import {newCity,G,R,idx,type Troops} from '@/lib/engine';
function fixture(){const c=newCity(0,123);c.t.fill(G);c.seen.fill(1);c.people=[];c.camp=idx(10,10);c.era=3;c.b={[c.camp]:{k:'barracks' as const,lvl:3,doneAt:null},[idx(14,10)]:{k:'dock' as const,lvl:3,doneAt:null}};for(let y=0;y<96;y++)c.t[idx(15,y)]=R;c.transportShips=3;c.res.food=1;return c;}
export default function Page(){const [city,setCity]=useState(fixture);const troops:Troops={club:5,spear:1,bow:2,sword:2};return <main style={{maxWidth:520,margin:'auto',padding:20}}><h1>Chuẩn bị xuất quân</h1><p>Bản thử độc lập: 5 chiến binh gậy, 1 giáo binh, 2 cung thủ, 2 kiếm sĩ.</p><ExpeditionReadiness city={city} units={troops} readiness={expeditionReadiness(city,idx(20,10),troops)}/><button onClick={()=>setCity(c=>({...c,transportShips:(c.transportShips??0)+1}))}>Thêm 1 thuyền thử</button><button onClick={()=>setCity(c=>({...c,res:{...c.res,food:1000}}))}>Bổ sung 1.000 thực thử</button></main>;}
