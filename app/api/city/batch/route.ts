import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { BATCH_BYTES, validBatch } from '@/lib/city-sync';
import { saveCityBatch, BatchConflict } from '@/lib/city-batch-store';
import { trackOnlineCommand } from '@/lib/online-commands';
import { UnsupportedCityVersionError } from '@/lib/city-store';

export async function POST(req:Request) {
  const user=await currentUser();
  if(!user?.cityId || !user.sessionVersion)return NextResponse.json({error:'Phiên đăng nhập đã hết hạn.',sessionEnded:true},{status:401});
  return trackOnlineCommand(user.cityId,'city',async metrics=>{
    metrics.command='city.batch';
    // Limit the stream before JSON parsing/allocation; Content-Length is only a hint.
    const reader=req.body?.getReader();if(!reader)return NextResponse.json({error:'Thiếu lệnh.'},{status:400});
    const chunks:Uint8Array[]=[];let size=0;
    while(true) {
      const {value,done}=await reader.read();if(done)break;
      size+=value.byteLength;
      if(size>BATCH_BYTES){await reader.cancel();return NextResponse.json({error:'Gói thao tác quá lớn.'},{status:413});}
      chunks.push(value);
    }
    const data=new Uint8Array(size);let offset=0;for(const c of chunks){data.set(c,offset);offset+=c.byteLength;}
    let body:unknown;try{body=JSON.parse(new TextDecoder().decode(data));}catch{return NextResponse.json({error:'Gói thao tác không hợp lệ.'},{status:400});}
    if(!validBatch(body))return NextResponse.json({error:'Lệnh, sequence hoặc phiên bản không hợp lệ.'},{status:400});
    if(body.session!==user.sessionVersion)return NextResponse.json({error:'Phiên chơi đã được thay thế.',sessionEnded:true},{status:401});
    try {
      const response=await saveCityBatch(user,body,metrics);
      return response?NextResponse.json(response):NextResponse.json({error:'Không sở hữu làng.'},{status:403});
    } catch(e) {
      if(e instanceof BatchConflict || e instanceof UnsupportedCityVersionError)return NextResponse.json({error:e.message},{status:409});
      throw e;
    }
  });
}
