"use client";
import {useState} from 'react';
import EraStorageNotice from '@/components/EraStorageNotice';
import {newCity,G,idx,derive,stats,settle,MIN} from '@/lib/engine';
function fixture(){
 const c=newCity(0,123);c.t.fill(G);c.seen.fill(1);c.camp=idx(20,20);c.era=2;c.herds=[];c.camps=[];
 c.b={[idx(19,20)]:{k:'hall',lvl:3,doneAt:null},[idx(22,20)]:{k:'gather',lvl:1,doneAt:null}};
 c.people=c.people.slice(0,2);for(const p of c.people){p.task={t:'work',at:idx(22,20)};p.pos=idx(22,20);}
 c.res.food=1900;return c;
}
export default function StoragePreview(){
 const [city,setCity]=useState(fixture),[shop,setShop]=useState(false);
 const storage=stats(city,derive(city),city.last).storage;
 return <main style={{padding:24,maxWidth:520,margin:'auto'}}><h1>Sức chứa và mục tiêu lên đời</h1><p>Bản thử độc lập, không ghi dữ liệu người chơi.</p><p>Trong kho: {Math.floor(city.res.food).toLocaleString('vi-VN')}/{storage.food.toLocaleString('vi-VN')}</p><EraStorageNotice era={city.era} storage={storage} onOpenShop={()=>setShop(true)}/><p>Tiến độ lên đời: {Math.floor(city.res.food).toLocaleString('vi-VN')}/3.000 lương thực</p><button onClick={()=>{const c=structuredClone(city);settle(c,c.last+2*MIN);setCity(c);}}>Thu hoạch 2 phút</button><button onClick={()=>{const c=structuredClone(city);c.b[idx(21,20)]={k:'storehouse',lvl:1,doneAt:null};setCity(c);}}>Xây thêm Kho</button>{shop&&<p role="status">Đã mở cửa hàng xây Kho</p>}</main>;
}
