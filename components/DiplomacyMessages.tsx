"use client";
import type { DiplomaticMessage } from '@/lib/diplomacy-types';
export function diplomacyText(m:DiplomaticMessage) {
 if(m.decision)return m.side==='host'?`Nước ${m.name} đã ${m.decision==='accepted'?'đồng ý chia sẻ vị trí trên bản đồ':'từ chối chia sẻ vị trí'}.`:`Bạn đã ${m.decision==='accepted'?'chia sẻ vị trí với':'từ chối lời xin vị trí của'} nước ${m.name}.`;
 if(m.requestedAt)return m.side==='host'?`Sứ giả đang chuyển lời xin vị trí tới nước ${m.name}.`:`Nước ${m.name} nhờ sứ giả hỏi: “Bạn có đồng ý cho biết vị trí nước mình trên bản đồ không?”`;
 return `Sứ giả nước ${m.name} đã tới thăm làng.`;
}
export default function DiplomacyMessages({messages,busy,error,onAction}:{messages:DiplomaticMessage[];busy:boolean;error:string;onAction:(id:string,action:'request'|'accept'|'decline')=>void}) {
 return <section aria-label="Lời nhắn ngoại giao"><h3>Sứ giả & ngoại giao</h3>{error&&<p className="err" role="alert">{error}</p>}
 {!messages.length&&<p className="muted small">Chưa có sứ giả đến thăm hoặc lời xin vị trí trong 7 ngày qua.</p>}
 <ul className="units">{messages.map(m=><li key={m.id}><div><p>{diplomacyText(m)}</p><small className="muted">{new Date(m.decidedAt??m.requestedAt??m.arrive).toLocaleString('vi-VN')}</small>
 {m.side==='host'&&!m.requestedAt&&!m.known&&<div className="actions"><button disabled={busy} onClick={()=>onAction(m.id,'request')}>Nhờ sứ giả xin vị trí nước {m.name}</button></div>}
 {m.side==='host'&&m.known&&!m.requestedAt&&<p className="ok small">Bạn đã biết vị trí nước này trên bản đồ.</p>}
 {m.side==='visitor'&&m.requestedAt&&!m.decision&&<><p className="small">Đồng ý sẽ mở vị trí nước mình lâu dài cho họ. Không cấp báo cáo do thám hay quyền xuất quân.</p><div className="actions"><button className="primary" disabled={busy} onClick={()=>onAction(m.id,'accept')}>Đồng ý chia sẻ vị trí</button><button disabled={busy} onClick={()=>onAction(m.id,'decline')}>Từ chối</button></div></>}
 </div></li>)}</ul></section>;
}
