import {hungerSpeech,rulerTitle,villagersHungry} from '@/lib/villager-mood';
import {hungerLevel} from '@/lib/hunger';
import type {City,Person} from '@/lib/engine';
export function HungryVillager({city,person}:{city:City;person:Person}){
 if(!villagersHungry(city))return null;
 const mood=hungerSpeech(city.era,person.id);
 return <small className="hunger-person">Đói · “{mood.cry} {mood.complaint}”</small>;
}
export function HungerNotice({city,onFindFood}:{city:City;onFindFood:()=>void}){
 const stress=city.hunger?.stressMs??0,level=hungerLevel(stress);
 if(!city.people.length||(!villagersHungry(city)&&!stress))return null;
 return <div className="hunger-notice" role="status"><div><b>{level>=3?'Đói nguy kịch!':stress&&city.res.food>0?'Dân đang hồi phục':'Dân đang đói!'}</b><span>{city.res.food<=0?`Kho hết lương thực. Dân than: “${rulerTitle(city.era)} không cho ăn, đói quá!”`:`Đã có thức ăn; cần duy trì nguồn cung để qua cơn đói.`}</span><small>Giao dân hái lượm, làm ruộng hoặc săn; mang thức ăn về nộp để hết đói. Thiếu ăn tích lũy: {Math.floor(stress/60000)} phút. Cứ 10 phút thiếu ăn mất 1 dân: trước mức 30 phút họ bỏ làng, từ 30 phút có thể chết đói. Khi ăn đủ, mức đói giảm gấp đôi tốc độ tăng.</small></div><button onClick={onFindFood}>Giao việc kiếm ăn</button></div>;
}
