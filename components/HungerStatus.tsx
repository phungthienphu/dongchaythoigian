import {hungerSpeech,rulerTitle,villagersHungry} from '@/lib/villager-mood';
import type {City,Person} from '@/lib/engine';
export function HungryVillager({city,person}:{city:City;person:Person}){
 if(!villagersHungry(city))return null;
 const mood=hungerSpeech(city.era,person.id);
 return <small className="hunger-person">Đói · “{mood.cry} {mood.complaint}”</small>;
}
export function HungerNotice({city,onFindFood}:{city:City;onFindFood:()=>void}){
 if(!city.people.length||!villagersHungry(city))return null;
 return <div className="hunger-notice" role="status"><div><b>Dân đang đói!</b><span>Kho hết lương thực. Dân than: “{rulerTitle(city.era)} không cho ăn, đói quá!”</span><small>Giao dân hái lượm, làm ruộng hoặc săn; mang thức ăn về nộp để hết đói. Đói kéo dài sẽ có dân bỏ làng.</small></div><button onClick={onFindFood}>Giao việc kiếm ăn</button></div>;
}
