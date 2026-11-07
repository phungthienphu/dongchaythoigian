import {NextResponse} from 'next/server';
import {currentUser} from '@/lib/auth';
import {withCity} from '@/lib/city-store';
import {citySync} from '@/lib/sync-anchor';
import {batchDelayEnabled} from '@/lib/city-sync-config';

/** A visible, idle controller checkpoints at most once per five minutes. Reads
 * remain projections; no empty command batches and no continuous village tick. */
export async function POST() {
  const user=await currentUser();
  if(!user?.cityId||!user.sessionVersion)return NextResponse.json({sessionEnded:true},{status:401});
  try {
    const out=await withCity(user.cityId,()=>null);
    if(!out)return NextResponse.json({error:'Không sở hữu làng.'},{status:403});
    return NextResponse.json({state:out.doc.state,serverNow:out.now,sync:citySync(out.doc,user.sessionVersion,out.now),batchEnabled:batchDelayEnabled(user.cityId)});
  } catch(e) {return NextResponse.json({error:(e as Error).message},{status:409});}
}
