"use client";
import {B,bridgeQuote,buildingCost,canPlace,costText,derive,type Action,type City} from '@/lib/engine';
import {bridgeReady,SHORT_BRIDGE_WATER_TILES} from '@/lib/bridges';
import type {EngineRules} from '@/lib/eras';

export default function BridgePanel({city,from,to,selecting,busy,rules,onSelect,onCancel,act}:{city:City;from:number;to:number|null;selecting:boolean;busy:boolean;rules:EngineRules;onSelect:()=>void;onCancel:()=>void;act:(a:Action)=>Promise<boolean>}){
  const b=city.b[from],connected=bridgeReady(city,from),target=to??b.bridge?.to;
  const plan=target!==undefined?bridgeQuote(city,from,target,rules):null;
  const headError=target!==undefined?canPlace(city,derive(city),'bridgehead',target%96,Math.floor(target/96),rules):null;
  return <section aria-label="Nối Cầu Sắt" className="bridge-panel">
    <p className="small">Cầu qua tối đa {SHORT_BRIDGE_WATER_TILES} ô nước thi công từ một bờ. Sông rộng hơn cần xây xong Đầu cầu sắt bên kia rồi mới nối nhịp. Hai bờ phải thẳng hàng ngang hoặc dọc.</p>
    {connected?<p role="status">Đã nối hai bờ · dân và quân qua cầu không cần thuyền. Thuyền vẫn lưu thông dưới cầu.</p>:b.doneAt?<p role="status">Đang thi công nhịp cầu. Hoàn tất mới mở đường qua sông.</p>:<button disabled={busy||b.burned||b.flooded} onClick={onSelect}>{selecting?'Chọn lại bờ đối diện':'Nối sang bờ kia'}</button>}
    {selecting&&<p role="status" className="small">Bấm ô đất trống ở bờ đối diện trên bản đồ. Đường nét đứt là tuyến dự kiến; chưa trừ tài nguyên.</p>}
    {plan&&target!==undefined&&!connected&&!b.doneAt&&<>
      <p>Bờ đối diện ({target%96}, {Math.floor(target/96)}) · {plan.width} ô nước</p>
      <p>Nối nhịp: {costText(plan.cost)} · {Math.ceil(plan.duration/60000)} phút · 1 đội thợ xây</p>
      {plan.needsHead&&!plan.headReady&&<div><p className="small">Cần Đầu cầu sắt bên kia · {costText(buildingCost('bridgehead',city.era))} · {Math.ceil(B.bridgehead.sec/60)} phút.</p>
        {!city.b[target]?<button disabled={busy||!!headError} title={headError??undefined} onClick={()=>void act({type:'build',k:'bridgehead',x:target%96,y:Math.floor(target/96)})}>Xây đầu cầu ở bờ đối diện</button>:<p role="status" className="small">{city.b[target].k==='bridgehead'?(city.b[target].doneAt?'Chờ đầu cầu bên kia xây xong.':'Đầu cầu bên kia cần sửa.'): 'Bờ này đã có công trình khác.'}</p>}
        {headError&&!city.b[target]&&<p className="small muted">{headError}</p>}
      </div>}
      {plan.error&&<p role="status" className="err small">{plan.error}</p>}
      <button className="primary" disabled={busy||!!plan.error} onClick={async()=>{if(await act({type:'connectBridge',x:from%96,y:Math.floor(from/96),to:target}))onCancel();}}>Xác nhận thi công nhịp cầu</button>
    </>}
    {selecting&&<button disabled={busy} onClick={onCancel}>Hủy chọn tuyến</button>}
  </section>;
}
