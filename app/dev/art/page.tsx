"use client";

import { useEffect, useRef, useState } from "react";
import { drawAnimalArt, drawFutureArt, drawMagicArt, drawSoldierArt, type AnimalArt, type FutureArt, type MagicArt, type SoldierArt } from "@/components/actor-art";
import styles from "./art.module.css";

type Entry = { id: string; name: string; detail: string; era: string; family: "soldier" | "animal" | "future" | "magic"; size: number; reserved?: boolean };
const art: Entry[] = [
  {id:"club",name:"Chiến binh gậy",detail:"Da thú · chùy đá buộc dây",era:"Đồ đá",family:"soldier",size:2.9},
  {id:"sling",name:"Lính ném đá",detail:"Túi đá · dây quăng",era:"Đồ đá",family:"soldier",size:2.9},
  {id:"spear",name:"Giáo binh đồng",detail:"Giáp phiến · giáo dài",era:"Đồ đồng",family:"soldier",size:2.7},
  {id:"bow",name:"Cung thủ",detail:"Bao tên · cung gỗ uốn",era:"Đồ đồng",family:"soldier",size:2.9},
  {id:"sword",name:"Kiếm sĩ sắt",detail:"Mũ thép · khiên bọc đồng",era:"Đồ sắt",family:"soldier",size:2.9},
  {id:"crossbow",name:"Lính nỏ",detail:"Giáp phiến · nỏ có dây",era:"Trung đại",family:"soldier",size:2.9},
  {id:"cavalry",name:"Kỵ binh",detail:"Chiến mã · yên thêu · thương",era:"Trung đại",family:"soldier",size:2.05},
  {id:"musket",name:"Lính súng",detail:"Áo quân phục · súng lưỡi lê",era:"Công nghiệp",family:"soldier",size:2.9},
  {id:"cannon",name:"Pháo dã chiến",detail:"Bánh nan hoa · nòng giật lùi",era:"Công nghiệp",family:"soldier",size:2.3},
  {id:"infantry",name:"Bộ binh hiện đại",detail:"Giáp chiến thuật · ba lô",era:"Hiện đại",family:"soldier",size:2.9},
  {id:"wagon",name:"Đoàn vận tải",detail:"Bao lương · xe gỗ có nan",era:"Đồ đồng",family:"soldier",size:2.5},
  {id:"medic",name:"Quân y",detail:"Túi cứu thương · áo vải",era:"Đồ đồng",family:"soldier",size:2.9},
  {id:"buffalo",name:"Trâu đồng",detail:"Sừng cong · móng chẻ · đuôi",era:"Động vật",family:"animal",size:2.5},
  {id:"elephant",name:"Voi chiến",detail:"Bành gỗ · quản tượng · ngà",era:"Đồ sắt",family:"animal",size:2.0},
  {id:"deer",name:"Hươu sao",detail:"Sừng phân nhánh · lông đốm",era:"Động vật",family:"animal",size:2.7},
  {id:"boar",name:"Lợn rừng",detail:"Bờm lưng · nanh cong",era:"Động vật",family:"animal",size:2.9},
  {id:"firemage",name:"Hỏa thuật sư",detail:"Áo choàng đỏ · mũ nhọn · trượng lửa",era:"Thức tỉnh",family:"magic",size:2.9},
  {id:"watermage",name:"Thủy thuật sư",detail:"Mũ trùm · trượng ngọc nước · phép hồi",era:"Thức tỉnh",family:"magic",size:2.9},
  {id:"golem",name:"Golem đá",detail:"Đá ghép · mạch ấn Thổ phát sáng",era:"Nguyên tố",family:"magic",size:2.8},
  {id:"spiritdeer",name:"Linh lộc",detail:"Sừng cành lá · đốm sáng Mộc",era:"Nguyên tố",family:"magic",size:2.6},
  {id:"treant",name:"Linh mộc vận tải",detail:"Chân rễ · tán lá · mang kiện hàng",era:"Nguyên tố",family:"magic",size:2.7},
  {id:"dragon",name:"Thanh Long",detail:"Thân rắn bay · sừng · râu dài · ngọc sáng",era:"Thần thoại",family:"magic",size:2.5},
  {id:"tortoise",name:"Huyền Quy",detail:"Mai lục giác · đuôi rắn · phù văn che chắn",era:"Thần thoại",family:"magic",size:2.4},
  {id:"phoenix",name:"Phượng Hoàng",detail:"Cánh lửa · đuôi lông vũ rực · hồi máu",era:"Thần thoại",family:"magic",size:2.6},
  {id:"tank",name:"Xe tăng",detail:"Xích chuyển động · giáp nghiêng",era:"Hiện đại",family:"future",size:2.05},
  {id:"coal",name:"Mỏ than",detail:"Hầm gia cố · ray và xe goòng",era:"Công nghiệp",family:"future",size:2.3},
  {id:"fighter",name:"Tiêm kích",detail:"Cánh xuôi · hai đuôi đứng",era:"Hiện đại",family:"future",size:2.0,reserved:true},
  {id:"helicopter",name:"Trực thăng",detail:"Cánh quạt · càng đáp",era:"Hiện đại",family:"future",size:2.1,reserved:true},
  {id:"radar",name:"Trạm radar",detail:"Ăng ten lưới quay · trạm tín hiệu",era:"Hiện đại",family:"future",size:2.0,reserved:true},
  {id:"oil",name:"Mỏ dầu",detail:"Tháp giếng · bơm gật gù · bồn",era:"Công nghiệp",family:"future",size:1.95,reserved:true},
  {id:"drone",name:"Phi cơ không người lái",detail:"Bốn cánh vòng · cảm biến quang học",era:"Hậu hiện đại",family:"future",size:2.0,reserved:true},
  {id:"mech",name:"Giáp cơ giới",detail:"Khớp trợ lực · buồng điều khiển",era:"Hậu hiện đại",family:"future",size:2.0,reserved:true},
  {id:"fusion",name:"Lò nhiệt hạch",detail:"Vòng từ trường · lõi năng lượng",era:"Hậu hiện đại",family:"future",size:1.95,reserved:true},
  {id:"satellite",name:"Vệ tinh quỹ đạo",detail:"Pin mặt trời · chảo thu phát",era:"Không gian",family:"future",size:2.1,reserved:true},
  {id:"orbital",name:"Cảng không gian",detail:"Tháp dịch vụ · tàu tái sử dụng",era:"Không gian",family:"future",size:1.65,reserved:true},
];
const tabs = ["Tất cả", "Binh lính", "Ma pháp", "Động vật", "Khí tài & công trình", "Sau Hiện đại"];
type Motion = "idle" | "walk" | "attack" | "cast" | "hurt";
function Preview({entry,playing,face,motion,zoom}:{entry:Entry;playing:boolean;face:1|-1;motion:Motion;zoom:number}) {
  const ref=useRef<HTMLCanvasElement>(null), clock=useRef(1200);
  useEffect(()=>{
    const canvas=ref.current,ctx=canvas?.getContext("2d");if(!canvas||!ctx)return;
    const dpr=Math.min(window.devicePixelRatio||1,2);canvas.width=360*dpr;canvas.height=210*dpr;
    let raf=0,previous=performance.now(),visible=true,lastPaint=0;
    const paint=(now:number)=>{
      if(playing&&visible&&now-lastPaint<1000/30){raf=requestAnimationFrame(paint);return;}
      lastPaint=now;
      if(playing)clock.current+=Math.min(64,now-previous);previous=now;
      ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,360,210);
      // Quiet isometric plinth keeps true foot anchors and scale visible.
      const ground=ctx.createRadialGradient(180,144,4,180,144,125);ground.addColorStop(0,"#34564b");ground.addColorStop(1,"#20382f");ctx.fillStyle=ground;
      ctx.beginPath();ctx.moveTo(180,106);ctx.lineTo(286,151);ctx.lineTo(180,198);ctx.lineTo(74,151);ctx.closePath();ctx.fill();
      ctx.strokeStyle="#5a786048";ctx.lineWidth=1;
      for(let i=1;i<4;i++){const v=i/4;ctx.beginPath();ctx.moveTo(180+106*v,106+45*v);ctx.lineTo(74+106*v,151+47*v);ctx.stroke();ctx.beginPath();ctx.moveTo(180-106*v,106+45*v);ctx.lineTo(286-106*v,151+47*v);ctx.stroke();}
      const pose={time:clock.current,face,walking:motion==="walk",fighting:motion==="attack",casting:motion==="cast",hurt:motion==="hurt"&&clock.current%900<220,still:!playing,active:motion!=="idle",graze:motion==="idle",antlers:true,seed:.37};
      const scale=entry.size*zoom;
      if(entry.family==="magic")drawMagicArt(ctx,entry.id as MagicArt,173,entry.id==="dragon"||entry.id==="phoenix"?178:160,scale,pose);
      else if(entry.family==="animal")drawAnimalArt(ctx,entry.id as AnimalArt,173,160,scale,pose);
      else if(entry.family==="soldier")drawSoldierArt(ctx,entry.id as SoldierArt,173,160,scale,pose);
      else drawFutureArt(ctx,entry.id as FutureArt,173,160,scale,pose);
      if(playing&&visible&&!document.hidden)raf=requestAnimationFrame(paint);
    };
    const restart=()=>{cancelAnimationFrame(raf);previous=performance.now();if(visible&&!document.hidden)paint(previous);};
    const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;restart();});
    paint(previous);observer.observe(canvas);document.addEventListener("visibilitychange",restart);
    return()=>{cancelAnimationFrame(raf);observer.disconnect();document.removeEventListener("visibilitychange",restart);};
  },[entry,playing,face,motion,zoom]);
  return <canvas ref={ref} width={360} height={210} aria-label={entry.name+" — "+entry.detail} role="img" className={styles.canvas}/>;
}
export default function ArtGallery(){
  const [tab,setTab]=useState("Tất cả"),[playing,setPlaying]=useState(true),[face,setFace]=useState<1|-1>(1),[motion,setMotion]=useState<Motion>("walk"),[zoom,setZoom]=useState(1);
  useEffect(()=>{if(window.matchMedia("(prefers-reduced-motion: reduce)").matches)setPlaying(false);},[]);
  const shown=art.filter(e=>tab==="Tất cả"||tab==="Binh lính"&&e.family==="soldier"||tab==="Ma pháp"&&e.family==="magic"||tab==="Động vật"&&e.family==="animal"||tab==="Khí tài & công trình"&&e.family==="future"||tab==="Sau Hiện đại"&&["Hậu hiện đại","Không gian"].includes(e.era));
  return <main className={styles.page}>
    <header className={styles.header}><a href="/" className={styles.brand}>DÒNG SÔNG THỜI ĐẠI <span> / XƯỞNG ĐỒ HỌA</span></a><span className={styles.edition}>BỘ SƯU TẬP 01 · ISOMETRIC 2.5D</span></header>
    <section className={styles.intro}><div><p className={styles.eyebrow}>TỪ BỜ SÔNG ĐẾN QUỸ ĐẠO</p><h1>Những hình hài<br/><em>của thời đại.</em></h1><p className={styles.lead}>Chiến binh, muông thú và những cỗ máy của ngày mai.<br/>Cùng một nét vẽ, xuyên suốt hành trình của thành phố.</p></div><div className={styles.stat}><strong>{String(art.length).padStart(2,"0")}</strong><span>MẪU HÌNH ĐỘNG</span><p>Lính & động vật đã dùng hình mới trong game.<br/>Mẫu có nhãn “Chuẩn bị” dành cho nội dung tương lai.</p></div></section>
    <nav className={styles.tabs} aria-label="Nhóm hình">{tabs.map(t=><button key={t} onClick={()=>setTab(t)} aria-pressed={tab===t} className={tab===t?styles.selected:""}>{t}</button>)}</nav>
    <div className={styles.controls}><div className={styles.motion} aria-label="Trạng thái hình">{([['idle','Đứng yên'],['walk','Di chuyển'],['attack','Chiến đấu'],['cast','Thi triển'],['hurt','Bị đánh']] as const).map(([id,label])=><button key={id} aria-pressed={motion===id} onClick={()=>setMotion(id)}>{label}</button>)}</div><div className={styles.actions}><button aria-pressed={!playing} onClick={()=>setPlaying(!playing)}>{playing?"Ⅱ Tạm dừng":"▷ Chạy hình"}</button><button onClick={()=>setFace(face===1?-1:1)}>↔ Đổi hướng</button><label>Thu phóng <select value={zoom} onChange={e=>setZoom(Number(e.target.value))}><option value={.7}>70%</option><option value={1}>100%</option><option value={1.15}>115%</option></select></label></div></div>
    <p className={styles.result}>{shown.length} mẫu <span> / Xem chuyển động và chi tiết ở từng trạng thái</span></p>
    <section className={styles.grid} aria-label="Bộ hình game">{shown.map((e,i)=><article key={e.family+e.id} className={styles.card}><div className={styles.cardTop}><span>{e.era}</span><span className={e.reserved?styles.reserved:styles.live}>{e.reserved?"CHUẨN BỊ":e.family==="magic"?"THỜI 7–9":"TRONG GAME"}</span></div><Preview entry={e} playing={playing} face={face} motion={motion} zoom={zoom}/><div className={styles.caption}><div><h2>{e.name}</h2><p>{e.detail}</p></div><span className={styles.number}>{String(i+1).padStart(2,"0")}</span></div></article>)}</section>
    <footer className={styles.footer}><span>ĐÁ · ĐỒNG · SẮT · TRUNG ĐẠI · CÔNG NGHIỆP · HIỆN ĐẠI · …</span><p>Phòng trưng bày độc lập, không dùng dữ liệu tài khoản. Các hướng hậu hiện đại và không gian là đề xuất hình ảnh.</p></footer>
  </main>;
}
