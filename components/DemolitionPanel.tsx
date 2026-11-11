"use client";
import {useState} from 'react';
import {buildingName,costText,demolitionQuote,HOUR,workersAt,type City} from '@/lib/engine';

export default function DemolitionPanel({city,tile,now,disabled,onConfirm}:{city:City;tile:number;now:number;disabled:boolean;onConfirm:()=>Promise<boolean>}){
 const [review,setReview]=useState(false);
 const b=city.b[tile];
 if(!b)return null;
 if(!review)return <button disabled={disabled} onClick={()=>setReview(true)}>Bán / phá dỡ</button>;
 const quote=demolitionQuote(city,tile,now);
 const people=workersAt(city,tile);
 return <div className="demolition-review" role="region" aria-label="Xác nhận phá dỡ">
  <p><b>Phá {buildingName(city,b.k)} · hoàn {quote.percent}%</b></p>
  <p className="small">{b.lvl===0?'Đang xây, chưa sử dụng.':quote.age===null?'Công trình cũ chưa lưu ngày xây: áp dụng mức hoàn 20%.':`Đã sử dụng ${Math.floor(quote.age/HOUR)} giờ ${Math.floor(quote.age%HOUR/60000)} phút.`} Dưới 6 giờ hoàn 50%; từ 6 giờ hoàn 20%. Nâng cấp không tính lại tuổi công trình.</p>
  <p>Nhận vào kho: <b>{costText(quote.refund)||'0 tài nguyên'}</b>.</p>
  {Object.keys(quote.overflow).length>0&&<p className="err small">Kho còn lại không đủ chỗ: mất {costText(quote.overflow)} trong phần được hoàn.</p>}
  <p className="small">{quote.estimated?'Vật liệu cũ chưa có lịch sử: dùng giá cơ bản theo cấp cũ; các lần nâng cấp mới tính theo số thực trả.':'Tính trên tổng vật liệu đã trả để xây và nâng cấp, kể cả phần đang thi công.'} Không hoàn phí sửa chữa, cải tạo, chuyển bến hay phí tăng tốc.</p>
  <p className="small">Công trình sẽ bị xóa ngay, hủy tiến độ đang làm và mất công dụng, chỗ ở, sức chứa do công trình cung cấp.{people>0?` ${people} người làm được cho nghỉ, giữ hàng đang mang.`:''} Không thể khôi phục.</p>
  {quote.error&&<p className="err small" role="status">{quote.error}</p>}
  <button disabled={disabled||!!quote.error} onClick={async()=>{if(await onConfirm())setReview(false);}}>Xác nhận phá dỡ · {quote.percent}%</button>
  <button disabled={disabled} onClick={()=>setReview(false)}>Giữ công trình</button>
 </div>;
}
