import {B, type BKey} from './engine';

export const PANEL_LABELS = {
  shop:'Xây dựng', people:'Dân làng', army:'Quân đội', worldmenu:'Thế giới', manage:'Quản lý',
  era:'Phát triển & vận hành', log:'Thông báo', rank:'Xếp hạng', control:'Đình làng',
  friends:'Bạn bè & tài khoản', market:'Chợ', resources:'Tài nguyên & thu chi', attention:'Cần chú ý',
} as const;
export type GamePanelKey = keyof typeof PANEL_LABELS;
export function panelGroup(panel:GamePanelKey|null){
  if(panel==='friends'||panel==='market')return 'worldmenu';
  if(panel==='era'||panel==='log'||panel==='rank'||panel==='control'||panel==='resources'||panel==='attention')return 'manage';
  return panel;
}
export const BUILD_GROUPS = ['Tất cả','Nhà ở','Lương thực','Khai thác','Quân sự','Hạ tầng','Văn hóa'] as const;
export type BuildGroup = typeof BUILD_GROUPS[number];
export function buildingGroup(k:BKey):BuildGroup{
  if(['barracks','wall','gate','watchtower','logistics','infirmary'].includes(k))return 'Quân sự';
  if(['gather','farm','estate','wheel','fire'].includes(k))return 'Lương thực';
  if(B[k].house&&k!=='hall')return 'Nhà ở';
  if(B[k].prod||['wood','quarry','forge','charcoal','coalmine'].includes(k))return 'Khai thác';
  if(['temple','academy','hall','dam','green','university','envoy'].includes(k))return 'Văn hóa';
  return 'Hạ tầng';
}
export const searchText=(text:string)=>text.toLocaleLowerCase('vi').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d');
