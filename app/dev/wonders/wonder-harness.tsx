'use client';
import {useState} from 'react';
import {HOUR,idx,RES} from '@/lib/engine';
import {eraFixture,eraStaff} from '@/lib/era-fixtures.test-utils';
import FinalWonderReview from '@/components/FinalWonderReview';
function fixture(ready=false){
 const c=eraFixture(6);c.last=12*HOUR;c.b[idx(19,20)].lvl=ready?6:5;eraStaff(c,c.camp,400);
 for(let n=0;n<2;n++){const tile=idx(22+n,22);c.b[tile]={k:'hydro',lvl:1,doneAt:null};if(n===0||ready)eraStaff(c,tile,3);}
 for(let n=0;n<4;n++)c.b[idx(22+n,23)]={k:'park',lvl:1,doneAt:null};
 c.modern!.supply=ready?100:285;c.modern!.clean=ready?100:125;c.industry!.pollution=ready?20:57.66;if(ready)c.industry!.cleanSince=0;
 for(const r of RES)c.res[r]=100_000;return c;
}
export default function WonderHarness(){
 const [city,setCity]=useState(()=>fixture()),[kind,setKind]=useState<'dam'|'green'|null>(null),[status,setStatus]=useState('');
 return <main style={{padding:24}}><h1>Kiểm tra điều kiện kỳ quan</h1><p>Dữ liệu giả lập độc lập; không gọi API hay sửa làng thật.</p><button onClick={()=>{setCity(fixture());setStatus('');}}>Thiếu điều kiện</button><button onClick={()=>{setCity(fixture(true));setStatus('');}}>Đủ điều kiện</button><button onClick={()=>setKind('dam')}>Xem Đập Sông Mẹ</button><button onClick={()=>setKind('green')}>Xem Thành Phố Sông Xanh</button><output role="status">{status}</output>{kind&&<FinalWonderReview city={city} kind={kind} now={city.last} onClose={()=>setKind(null)} onConfirm={()=>{setStatus(`Đã chọn vị trí cho ${kind}`);setKind(null);}} onLocate={tile=>{setStatus(`Tới công trình ${tile}`);setKind(null);}}/>}</main>;
}
