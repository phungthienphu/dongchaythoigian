'use client';
import {W,costText,farmGroupCareQuote,type Action,type City} from '@/lib/engine';

export default function FarmGroupCare({city,tile,busy,act}:{city:City;tile:number;busy:boolean;act:(a:Action)=>Promise<boolean>}){
 if(city.era<3)return null;
 const group=farmGroupCareQuote(city,tile);
 return <div className="small"><button disabled={busy||!!group.error||group.tiles.length<2} title={group.error??'Chỉ chăm các ruộng cần chăm trong cụm nối cạnh; không tính chạm góc.'} onClick={()=>act({type:'tendFarmGroup',x:tile%W,y:Math.floor(tile/W)})}>Chăm cả cụm · {group.tiles.length} ruộng · {costText(group.cost)} · 30 giây</button><p>Cụm {group.connected} ruộng nối cạnh liên tục; chạm góc không tính. Bỏ qua ruộng đầy dinh dưỡng, đang cải tạo hoặc hư hỏng.{group.error&&` ${group.error}`}</p></div>;
}
