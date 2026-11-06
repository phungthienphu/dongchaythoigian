import type {City} from './engine';

export const RULER_TITLES=['','Tù trưởng','Thủ lĩnh','Đức vua'] as const;
export const rulerTitle=(era:number)=>RULER_TITLES[Math.min(3,Math.max(1,Math.floor(era)))]??'Người cai trị';
export const villagersHungry=(city:Pick<City,'res'>)=>city.res.food<=0;
export function hungerSpeech(era:number,id:number){
 const ruler=rulerTitle(era);
 const complaints=[`${ruler} tham ô hết gạo rồi!`,`${ruler} giữ gạo, dân lấy gì ăn?`,`${ruler} ơi, cho dân ăn với!`];
 return {status:'Đói',cry:'Đói quá!',complaint:complaints[Math.abs(id)%complaints.length]};
}
