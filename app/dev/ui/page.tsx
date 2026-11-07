"use client";

import { useState } from "react";

export default function ControlPreview() {
  const [tab,setTab]=useState("Xây dựng"),[selected,setSelected]=useState("Nhà ngói"),[count,setCount]=useState(1),[message,setMessage]=useState("Chọn công trình để xem trạng thái được chọn.");
  return <main className="wrap" style={{maxWidth:900,paddingBlock:24,gap:24}}>
    <header><p className="muted small">DÒNG SÔNG THỜI ĐẠI · GIAO DIỆN</p><h1>Nhẹ hơn. Rõ ràng hơn.</h1><p className="muted">Xem thử hệ nút mới, độc lập dữ liệu làng. <a href="/dev/art" style={{color:"#efcf91"}}>Xem nhân vật bỏ viền →</a></p></header>
    <section className="panel card" style={{borderColor:"#a7c3a133",padding:24}}>
      <h2 style={{marginTop:0}}>Hành động</h2><p className="muted small">Nền trong nhẹ, nhấn vàng cho thao tác chính, đỏ cho hành động nguy hiểm.</p>
      <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
        <button className="primary" onClick={()=>setMessage("Đã thử thao tác xây dựng. Không trừ tài nguyên.")}>Xây công trình</button>
        <button onClick={()=>setMessage("Đã thử thao tác quay lại.")}>Quay lại</button>
        <button className="danger" onClick={()=>setMessage("Đã thử nút tháo dỡ. Không xóa công trình.")}>Tháo dỡ</button>
        <button disabled>Chưa đủ tài nguyên</button>
        <button className="link" onClick={()=>setMessage("Đã mở hướng dẫn mẫu.")}>Xem hướng dẫn</button>
      </div>
    </section>
    <section className="panel card" style={{borderColor:"#a7c3a133",padding:24}}>
      <div className="tabs" aria-label="Bảng điều khiển">{["Xây dựng","Quân đội","Người dân"].map(t=><button key={t} className={"tab"+(tab===t?" on":"")} aria-pressed={tab===t} onClick={()=>setTab(t)}>{t}</button>)}</div>
      <h2 style={{fontSize:20}}>{tab}</h2>
      {tab==="Xây dựng"?<div className="shopgrid">{[["Nhà ngói","18 chỗ ở · 30 phút"],["Trường làng","Tăng sản lượng · 1 giờ"],["Hồ chứa","Dự trữ nước · 45 phút"],["Đại kho","10.000 mỗi loại · 30 phút"]].map(([name,detail])=><button key={name} className="shopcard" aria-pressed={selected===name} onClick={()=>{setSelected(name);setMessage("Đang chọn: "+name);}} style={{minHeight:94,justifyContent:"center"}}><span className="n">{name}</span><span className="c">{detail}</span></button>)}</div>:tab==="Quân đội"?<div className="assign"><span>Huấn luyện lính</span><div className="stepper"><button aria-label="Giảm số lính" disabled={count===1} onClick={()=>setCount(Math.max(1,count-1))}>−</button><span aria-live="polite">{count}</span><button aria-label="Tăng số lính" disabled={count===10} onClick={()=>setCount(Math.min(10,count+1))}>+</button></div><button className="primary" onClick={()=>setMessage(`Đã thử chọn ${count} lính. Không huấn luyện quân thật.`)}>Huấn luyện</button></div>:<div className="people"><button className="person" aria-pressed={selected==="An"} onClick={()=>{setSelected("An");setMessage("Đang chọn dân: An");}}><span className="nm">An</span><span className="tk">Đang làm ruộng</span></button><button className="person" aria-pressed={selected==="Bình"} onClick={()=>{setSelected("Bình");setMessage("Đang chọn dân: Bình");}}><span className="nm">Bình</span><span className="tk">Đang đốn gỗ</span></button></div>}
    </section>
    <p role="status" aria-live="polite" style={{color:"#d9c69e",minHeight:42}}>{message}</p>
    <p className="muted small">Có trạng thái hover, nhấn, chọn, vô hiệu hóa và focus bàn phím. Nút cảm ứng tối thiểu 44px trên thiết bị dùng chạm.</p>
  </main>;
}
