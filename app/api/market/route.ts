import {NextResponse} from 'next/server';
import {battlePlayerId} from '@/lib/city-store';
import {marketAction,marketData} from '@/lib/market';
import {validMarketAction} from '@/lib/market-rules';
import {trackOnlineCommand} from '@/lib/online-commands';
export async function GET(req?:Request){const pid=await battlePlayerId();if(!pid)return NextResponse.json({error:'Đăng nhập Google để giao thương.'},{status:401});try{return NextResponse.json(await marketData(pid,req?new URL(req.url).searchParams.get("caravan")?.slice(0,200):undefined));}catch(e){return NextResponse.json({error:(e as Error).message},{status:409});}}
export async function POST(req:Request){
 const pid=await battlePlayerId();if(!pid)return NextResponse.json({error:'Đăng nhập Google để giao thương.'},{status:401});
 return trackOnlineCommand(pid,'market',async metrics=>{
  const body=await req.json().catch(()=>null);
  if(!validMarketAction(body))return NextResponse.json({error:'Lô hàng, giá, quân hoặc mã thao tác không hợp lệ.'},{status:400});
  metrics.command=`market.${body.type}`;
  try{return NextResponse.json(await marketAction(pid,body,metrics));}catch(e){return NextResponse.json({error:(e as Error).message},{status:409});}
 });
}
