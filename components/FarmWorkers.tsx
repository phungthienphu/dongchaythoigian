import {buildingJobs,type City} from '@/lib/engine';
import {farmWorkSummary} from '@/lib/farm-work-status';

export default function FarmWorkers({city,tile,storage}:{city:City;tile:number;storage:City['res']}){
 const {workers,counts}=farmWorkSummary(city,tile,storage);
 const labels=[['working','đang làm trên ruộng'],['travelling','đang tới ruộng'],['delivering','đang mang/nộp hàng'],['waiting-storage','chờ kho còn chỗ'],['tending','chờ cải tạo'],['exhausted','nghỉ vì ruộng bạc màu'],['sheltering','đang tránh địch'],['inactive','chờ công trình hoạt động'],['blocked','chờ đường tới ruộng']] as const;
 return <div role="status" aria-live="polite">
  <p className="small">Đã giao <b>{workers.length}/{buildingJobs(city.b[tile])}</b> chỗ làm. {labels.filter(([key])=>counts[key]).map(([key,label])=>`${counts[key]} ${label}`).join(' · ')}{!workers.length&&'Chưa có nông dân.'}</p>
  {!!counts['waiting-storage']&&<p className="err small">Kho đầy: {counts['waiting-storage']} nông dân còn giữ hàng, đang chờ nộp nên chưa quay lại ruộng. Dùng bớt tài nguyên hoặc tăng sức chứa đúng ngăn kho; dân sẽ tự tiếp tục. Bấm “Tìm người” để xem vị trí thực tế.</p>}
  {!!counts.blocked&&<p className="err small">Chưa tới được ruộng. Kiểm tra lối đi từ vị trí nông dân; tường, nhà hoặc núi đá có thể chặn đường.</p>}
 </div>;
}
