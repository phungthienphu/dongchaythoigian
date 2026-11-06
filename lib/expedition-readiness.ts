import {armyStagingTiles,buildings,expeditionPlan,isBuildingActive,marchSupplies,shipPlaces,shipsFree,shipsNeeded,UKEYS,type City,type Troops} from './engine';
/** A read-only route probe distinguishes capacity from an impossible route.
 * Extra ships exist only on this shallow diagnostic copy; nothing is reserved. */
export function expeditionReadiness(c:City,to:number,units:Troops){
 const places=UKEYS.reduce((n,u)=>n+(units[u]??0)*shipPlaces(u),0),required=shipsNeeded(units),free=shipsFree(c);
 const plan=places?expeditionPlan(c,to,units):null;
 const common={places,required,free,plan,supplies:plan?marchSupplies(units,plan.duration,c.era):null};
 if(!places)return {...common,reason:'troops' as const,message:'Chọn ít nhất một chiến binh để lập hành trình.'};
 if(plan)return {...common,reason:null,message:plan.ships?`Cần ${plan.ships} thuyền; hiện ${free} thuyền rảnh, đủ vận chuyển. Thuyền được giữ tới khi quân trở về.`:'Có đường bộ đã khám phá tới mục tiêu; không cần thuyền.'};
 const home=buildings(c).find(([,b])=>b.k==='barracks'&&isBuildingActive(b))?.[0]??c.camp;
 if(!armyStagingTiles(c,1,home).length)return {...common,reason:'exit' as const,message:'Trại lính bị bịt lối ra. Chừa ô đất trống nối ra ngoài hoặc đặt cổng thay tường; đóng thêm thuyền không giải quyết được lối ra bị chắn.'};
 const docks=buildings(c).filter(([,b])=>b.k==='dock'&&isBuildingActive(b));
 if(!docks.length)return {...common,reason:'dock' as const,message:`Chưa có đường bộ và chưa có Bến cảng hoạt động. Xây hoặc sửa Bến cảng sát đoạn sông cần đi qua, rồi khám phá tuyến. Nếu phải vượt sông, đoàn đã chọn cần ${required} thuyền.`};
 const probe=expeditionPlan({...c,transportShips:(c.transportShips??0)+required},to,units);
 if(probe)return {...common,supplies:marchSupplies(units,probe.duration,c.era),reason:'ships' as const,message:`Thiếu ${Math.max(0,probe.ships-free)} thuyền: cần ${probe.ships}, hiện có ${free} thuyền rảnh. Đóng thêm thuyền hoặc chờ thuyền đang chở quân trở về.`};
 return {...common,reason:'route' as const,message:`Chưa có tuyến đã khám phá từ trại lính tới mục tiêu qua đoạn sông nối với cảng. Núi và công trình cũng có thể chặn lối. Hiện ${free} thuyền rảnh; ${required} thuyền là yêu cầu chở đoàn này nếu vượt sông. Thêm thuyền chưa giải quyết được đường bị chắn.`};
}
