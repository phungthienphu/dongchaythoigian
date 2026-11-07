import { NextResponse } from 'next/server';
import { playerId } from '@/lib/city-store';
import { cities, envoyVisits } from '@/lib/db';
import { decideDiplomacy, diplomaticView } from '@/lib/diplomacy';
import { trackOnlineCommand } from '@/lib/online-commands';

export async function GET() {
  const pid=await playerId();if(!pid)return NextResponse.json({error:'Chưa có thành phố.'},{status:401});
  const now=Date.now(),col=await envoyVisits();
  const mine=await (await cities()).findOne({_id:pid},{projection:{"state.discoveries":1,"state.visits":1}});
  const rows=await col.find({$or:[{to:pid},{from:pid,requestedAt:{$exists:true}}],arrive:{$lte:now},expiresAt:{$gt:new Date(now)}}).sort({eventAt:-1}).limit(60).toArray();
  const next=await col.findOne({to:pid,arrive:{$gt:now},expiresAt:{$gt:new Date(now)}},{sort:{arrive:1},projection:{arrive:1}});
  return NextResponse.json({messages:rows.flatMap(row=>{const view=diplomaticView(row,pid,now);return view?[{...view,...(view.side==='host'?{known:mine?.state.discoveries?.includes(row.from)||Object.hasOwn(mine?.state.visits??{},row.from)}:{})}]:[];}),nextArrival:next?.arrive,serverNow:now});
}
export async function POST(req:Request) {
  const pid=await playerId();if(!pid)return NextResponse.json({error:'Chưa có thành phố.'},{status:401});
  return trackOnlineCommand(pid,'diplomacy',async metrics=>{
    const body=await req.json().catch(()=>null);
    if(!body || typeof body.id!=='string' || body.id.length>200 || !['request','accept','decline'].includes(body.action))return NextResponse.json({error:'Yêu cầu không hợp lệ.'},{status:400});
    metrics.command=`diplomacy.${body.action}`;
    try{await decideDiplomacy(pid,body.id,body.action,Date.now());return NextResponse.json({ok:true});}
    catch(error){return NextResponse.json({error:(error as Error).message},{status:409});}
  });
}
