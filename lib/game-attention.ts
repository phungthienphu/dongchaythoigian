import {B,RES,RN,availableForQuickAssign,farmRemaining,type City,type Res} from './engine';
import type {SaveStatus} from './batched-city';
export type AttentionTarget = {kind:'shop'|'people'|'army'|'era'|'log'|'sync'|'zombies'}|{kind:'tile';tile:number}|{kind:'resource';resource:keyof Res}|{kind:'battle';id:string};
export type AttentionItem = {id:string;severity:'urgent'|'warning'|'info';title:string;detail:string;action:string;target:AttentionTarget};
type War = { _id:string;status:string;side:string;attackerName:string;defenderName:string };
/** Derived presentation only: no timers, requests, simulation or automatic orders. */
export function villageAttention(c:City,storage:Res,save:SaveStatus,wars:readonly War[],unread:number,now=c.last):AttentionItem[]{
  const items:AttentionItem[]=[];
  if(['offline','error','readonly'].includes(save))items.push({id:'sync',severity:'urgent',title:save==='readonly'?'Làng đang được điều khiển ở tab khác':'Có tiến trình chưa lưu',detail:save==='readonly'?'Tab này chỉ xem. Quay lại tab đang điều khiển.':'Kiểm tra kết nối và thử đồng bộ để bảo vệ tiến trình.',action:save==='readonly'?'Xem hướng dẫn':'Thử đồng bộ',target:{kind:'sync'}});
  for(const war of wars.filter(w=>w.side==='defender'&&(w.status==='marching'||w.status==='fighting')))items.push({id:`war:${war._id}`,severity:'urgent',title:`${war.attackerName} đang tiến đánh`,detail:war.status==='fighting'?'Trận đánh đang diễn ra. Bạn có thể chỉ huy quân phòng thủ.':'Chuẩn bị quân ở nhà và các điểm gác.',action:war.status==='fighting'?'Chỉ huy trận':'Xem quân đội',target:war.status==='fighting'?{kind:'battle',id:war._id}:{kind:'army'}});
  if(c.raid||c.raidEncounter)items.push({id:'raid',severity:'urgent',title:'Man rợ đe dọa làng',detail:'Xem thời điểm địch tới và chuẩn bị phòng thủ tại Quân đội.',action:'Chuẩn bị phòng thủ',target:{kind:'army'}});
  const zombies=c.zombies;
  if(!zombies)items.push({id:'zombie-activation',severity:'info',title:'Luật zombie mới đang chờ bạn đọc',detail:'Đợt đầu sau 5 phút kể từ khi bật. Chuẩn bị lính và y tế; công trình bị phá mất vĩnh viễn.',action:'Đọc và chuẩn bị',target:{kind:'zombies'}});
  else if(zombies.actors.length||zombies.warning!==undefined)items.push({id:'zombies',severity:'urgent',title:zombies.actors.length?`${zombies.actors.length} zombie đang đe dọa làng`:'Đất nứt · zombie sắp trồi',detail:'Bảo vệ dân, chặn lối bằng tường và giữ thợ y tế sẵn sàng. Nhà bị phá phải xây mới.',action:'Xem zombie và cứu hộ',target:{kind:'zombies'}});
  const down=c.people.filter(p=>p.vital?.downAt!==undefined).length;
  if(down)items.push({id:'zombie-rescue',severity:'urgent',title:`${down} dân gục cần cứu ngay`,detail:'Có 10 phút để tiếp cận cứu hộ. Giao thợ y tế và chuẩn bị thực phẩm.',action:'Xem cứu hộ',target:{kind:'zombies'}});
  if(c.disaster&&c.disaster.at>now&&c.disaster.at-now<=30*60000)items.push({id:'disaster',severity:'warning',title:`${c.disaster.kind==='earthquake'?'Động đất':'Thiên tai'} có thể sắp tới`,detail:'Xem dự báo và chuẩn bị công trình bảo vệ. Cảnh báo còn hiệu lực vẫn hiện dù đã đọc tin.',action:'Xem thông báo',target:{kind:'log'}});
  if(c.people.length&&(c.res.food<=0||(c.hunger?.stressMs??0)>0))items.push({id:'hunger',severity:c.res.food<=0?'urgent':'warning',title:c.res.food<=0?'Dân đang đói':'Dân đang hồi phục sau đói',detail:c.res.food<=0?'Cần lương thực được nộp vào kho. Giao người kiếm ăn hoặc kiểm tra chuyến hàng đang chờ.':'Giữ nguồn thực đều đặn để mức đói giảm; dân chưa tăng lại ngay.',action:'Kiểm tra lương thực',target:{kind:'resource',resource:'food'}});
  const waiting=Object.fromEntries(RES.map(r=>[r,0])) as Res;
  for(const p of c.people){const h=p.haul;if(h?.resource&&h.carried>0&&(h.resting?storage[h.resource]-c.res[h.resource]<h.carried:h.phase==='unload'&&storage[h.resource]-c.res[h.resource]<=1e-9))waiting[h.resource]++;}
  for(const r of RES)if(waiting[r])items.push({id:`storage:${r}`,severity:'warning',title:`${waiting[r]} người chờ nộp ${RN[r].toLocaleLowerCase('vi')}`,detail:'Kho không còn đủ chỗ cho kiện đang mang. Dùng bớt hoặc nâng đúng ngăn kho.',action:'Xem sức chứa',target:{kind:'resource',resource:r}});
  const fields=Object.entries(c.b).filter(([,b])=>(b.k==='farm'||b.k==='estate')&&!b.tendUntil&&b.lvl>0&&farmRemaining(b)<=0);
  if(fields.length)items.push({id:'fields',severity:'warning',title:`${fields.length} ruộng bạc màu`,detail:c.era>=4?'Ruộng chờ tự cải tạo khi đủ thực và gỗ. Chọn ruộng để xem vật liệu còn thiếu.':'Nông dân giữ việc và chờ cải tạo. Chọn ruộng để gieo lại.',action:'Tới ruộng',target:{kind:'tile',tile:+fields[0][0]}});
  const broken=Object.entries(c.b).filter(([,b])=>b.burned||b.flooded||b.stranded);
  if(broken.length)items.push({id:'damaged',severity:'warning',title:`${broken.length} công trình bị ảnh hưởng`,detail:'Có công trình cháy, ngập hoặc cảng mắc cạn. Xem từng nhà để sửa hoặc chuyển bến.',action:`Xem ${B[broken[0][1].k].n}`,target:{kind:'tile',tile:+broken[0][0]}});
  if(c.industry&&c.industry.pollution>=60)items.push({id:'pollution',severity:'warning',title:`Ô nhiễm ${Math.floor(c.industry.pollution)}/100`,detail:'Xem nguồn phát thải và công trình xử lý đang thực sự hoạt động.',action:'Xem cách giảm',target:{kind:'era'}});
  const idle=c.people.filter(availableForQuickAssign).length;
  if(c.era<=2&&!c.people.some(p=>p.task.t==='hunt'||p.task.t==='work'&&B[c.b[p.task.at]?.k]?.prod?.food)){
    const gather=Object.entries(c.b).find(([,b])=>b.k==='gather'&&b.lvl>0&&!b.burned&&!b.flooded);
    items.push({id:'first-food',severity:'info',title:'Bắt đầu với nguồn lương thực',detail:gather?'Chọn trại và giao người rảnh. Kho tăng khi dân mang thức ăn về nộp.':'Xây Trại hái lượm rồi giao người, hoặc chọn dân đi săn đàn thú.',action:gather?'Tới trại hái lượm':'Xây nguồn thực',target:gather?{kind:'tile',tile:+gather[0]}:{kind:'shop'}});
  }
  if(idle)items.push({id:'idle',severity:'info',title:`${idle} dân có thể nhận việc`,detail:'Chọn nhóm hoặc phân công số dân. Người đang khám phá hoặc trú ẩn không nằm trong số này.',action:'Phân công',target:{kind:'people'}});
  if(unread)items.push({id:'notices',severity:'info',title:`${unread} thông báo chưa đọc`,detail:'Xem tin ngoại giao, chuyến hàng, thiên tai và kết quả trận đánh.',action:'Mở thông báo',target:{kind:'log'}});
  const priority={urgent:0,warning:1,info:2};
  return items.sort((a,b)=>priority[a.severity]-priority[b.severity]);
}
