"use client";
export default function CaravanNoticeLink({id,onTrack}:{id?:string;onTrack:(id:string)=>void}){
 return id?<button onClick={()=>onTrack(id)}>Theo dõi đoàn xe</button>:null;
}
