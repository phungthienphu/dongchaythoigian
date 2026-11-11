'use client';
import {useEffect,useRef,useState} from 'react';
import {drawVillagerArt} from '@/components/villager-art';
import styles from '../art/art.module.css';
const jobs=[['idle','Dân làng','#bd8b70'],['farm','Nông dân','#87975b'],['gather','Người hái lượm','#9d8159'],['build','Thợ xây','#b58e62'],['wood','Tiều phu','#8a9c79'],['quarry','Thợ mỏ','#8499a2'],['smith','Công nhân / thợ rèn','#768fa7'],['trade','Thương nhân','#ad827a'],['hunt','Thợ săn','#8d9871'],['explore','Người thám hiểm','#72968b'],['other','Người lao động','#939ab0']];
function Actor({job,shirt,action,era,face}:{job:string;shirt:string;action:string;era:number;face:1|-1}){
 const ref=useRef<HTMLCanvasElement>(null);
 useEffect(()=>{const c=ref.current!.getContext('2d')!;let raf=0;const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 const render=(t:number)=>{c.clearRect(0,0,360,210);c.fillStyle='#adc79a12';c.beginPath();c.ellipse(180,175,100,25,0,0,Math.PI*2);c.fill();
 drawVillagerArt(c,180,170,5,{time:reduced?500:t,seed:.3,face,era,job,walking:action==='walk'||action==='run'||action==='carry',running:action==='run',working:action==='work',swing:Math.max(0,1-(t%1100)/330),carrying:action==='carry',resource:job==='wood'?'wood':job==='quarry'?'coal':job==='smith'?'copper':'food',skin:'#e6b58d',shirt,band:'#c6a76b'});
 if(!reduced)raf=requestAnimationFrame(render);};render(500);return()=>cancelAnimationFrame(raf);},[job,shirt,action,era,face]);
 return <canvas ref={ref} width={360} height={210} className={styles.canvas} aria-label={`Minh họa ${job}, ${action}`}/>;
}
export default function Villagers(){const [action,setAction]=useState('work'),[era,setEra]=useState(5),[face,setFace]=useState<1|-1>(1);
 return <main className={styles.page}><header className={styles.header}><a className={styles.brand} href="/">DÒNG CHẢY THỜI GIAN</a><a href="/dev/art">Kho hình ảnh</a></header><section className={styles.intro}><div><p className={styles.eyebrow}>NGƯỜI DÂN · TRANG PHỤC · CHUYỂN ĐỘNG</p><h1>Nhịp sống <em>làng quê</em></h1><p className={styles.lead}>Hình vẽ dùng trực tiếp trong game. Chọn động tác để xem từng nghề.</p></div></section><div className={styles.controls}><div className={styles.motion}>{[['idle','Nghỉ ngơi'],['walk','Đi bộ'],['run','Chạy'],['work','Làm việc'],['carry','Mang hàng']].map(([k,v])=><button key={k} aria-pressed={action===k} onClick={()=>setAction(k)}>{v}</button>)}</div><div className={styles.actions}><label>Thời đại <select value={era} onChange={e=>setEra(+e.target.value)}>{['Đồ đá','Đồ đồng','Đồ sắt','Trung cổ','Công nghiệp','Hiện đại'].map((v,i)=><option key={v} value={i+1}>{v}</option>)}</select></label><button onClick={()=>setFace(face===1?-1:1)}>Đổi hướng</button></div></div><p className={styles.result}>11 nghề · không viền đen · cùng bộ vẽ với dân trong bản đồ</p><section className={styles.grid}>{jobs.map(([job,name,shirt])=><article className={styles.card} key={job}><Actor {...{job,shirt,action,era,face}}/><div className={styles.caption}><h2>{name}</h2></div></article>)}</section></main>;
}
