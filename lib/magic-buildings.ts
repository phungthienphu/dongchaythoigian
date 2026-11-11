/** Era 7 engine definitions derived from magic-data. Data-only (type imports
 * from the engine are erased) so engine initialization stays acyclic in ESM. */
import {MAGIC_BUILDINGS,MAGIC_UNITS} from './magic-data';
import type {Def,Unit} from './engine';
type Goods=Def['cost'];
const b=MAGIC_BUILDINGS,u=MAGIC_UNITS;
const base=(k:keyof typeof b,d:string,extra:Partial<Def>={}):Def=>{const m=b[k] as typeof b[keyof typeof b]&{jobs:number;max?:number;upgrade?:boolean};return {n:m.name,era:m.era,cost:m.cost as Goods,sec:m.seconds,...(m.jobs?{jobs:m.jobs}:{}),...(m.max?{max:m.max}:{}),...(m.upgrade?{up:true}:{}),d,...extra};};
export const MAGIC_ERA7_BUILDINGS={
 aetherwell:base('aetherwell','Nguồn mana: 2 thợ thu 240 mana/giờ, trữ 1.200 (cấp 2/3 ×1,6/2,4). Phủ 6 ô, cấp mana cho 4/6/8 nhà nhận. Phép Linh quang: mỗi 10 giây, zombie trong 4 ô nhận 10 sát thương và chậm 40%, tốn 2 mana. Tối đa 3.'),
 manarelay:base('manarelay','Cột dẫn linh nối nguồn mana tới nhà nhận trong 6 ô, tối đa 3 cột liên tiếp. Không phát, không trữ mana; không vượt sông thiếu cầu. Tối đa 18.'),
 crystalworks:base('crystalworks','4 thợ: 120 đồng + 40 vàng/giờ → 24 tinh thạch/giờ. Cần Xưởng dụng cụ hoạt động trong 6 ô. Không cần mana; hàng phải mang về kho.',{prod:{aetherCrystal:24},input:{copper:120,gold:40}}),
 runeworks:base('runeworks','4 thợ: 120 gỗ + 12 tinh thạch/giờ → 12 phù văn/giờ. Cần Xưởng thủ công hoặc Xưởng cơ khí hoạt động trong 6 ô. Không cần mana.',{prod:{rune:12},input:{wood:120,aetherCrystal:12}}),
 mageacademy:base('mageacademy','4 thợ: 6 phù văn + 20 mana/giờ → 24 tri thức ma pháp (trần 5.000). Tuyển pháp sư, mở 12 chỗ quân. Mọi nghiên cứu thời 7 cần học viện. Tối đa 2.'),
 manaspire:base('manaspire','Nguồn mana: 2 thợ chuyển 6 tinh thạch/giờ → 480 mana/giờ, trữ 2.400. Cần nghiên cứu Dẫn linh. Tối đa 4.'),
 rivershrine:base('rivershrine','Nhà nhận mana bên sông (hoặc trong 4 ô hồ có nước). Với Hộ sinh: Thanh tẩy chữa bệnh zombie tối đa 4 dân trong 8 ô (60 mana, 20 phút/làng); Thủy hồi cho quân gần đền. Tối đa 2.'),
 wardcircle:base('wardcircle','Nhà nhận mana. Hỏa trận thụ động: mỗi 2 giây đốt tối đa 6 zombie trong 6 ô, 40 sát thương/con, 1 mana mỗi lần trúng; không hại quân hay nhà. Với Chiến pháp: Trói rễ làm chậm 30%. Không sửa tường. Tối đa 4.'),
 spiritgarden:base('spiritgarden','3 thợ, 20 mana/giờ: tối đa 2 lều cứu thương/bệnh viện trong 6 ô rút ca chữa 30 → 20 phút; phí ca giữ nguyên. Cần Hộ sinh.'),
 awakeningtower:base('awakeningtower','Kỳ quan thời 7: mọi nguồn mana đang hoạt động +1 chỗ cấp. Khởi công cần Đình 7, 550 dân, Dẫn linh, học viện hoạt động và ít nhất 2 nguồn mana. Không tự tạo mana.'),
} satisfies Record<string,Def>;
const station=(k:'firealtar'|'watertemple'|'woodgrove'|'earthtemple',what:string)=>base(k,`3 thợ, duy trì 2 tinh chất + 10 mana/giờ: cấp ấn ${what} cho tối đa 3 nhà trong 6 ô. Cần Tứ nguyên; tối đa 2. Thiếu mana/tinh chất/thợ thì ấn tắt.`);
export const MAGIC_ERA8_BUILDINGS={
 essenceforge:base('essenceforge','5 thợ: 24 tinh thạch + 60 than + 30 mana/giờ → 12 tinh chất/giờ. Cần Xưởng cơ khí hoạt động trong 6 ô, có đường nối; hàng mang về kho.',{prod:{essence:12},input:{aetherCrystal:24,coal:60}}),
 firealtar:station('firealtar','Hỏa; mở Bão lửa (120 mana + 2 tinh chất, 3 phút/làng)'),
 watertemple:station('watertemple','Thủy; mở Tịnh hóa (100 mana + 2 tinh chất, 30 phút), nối Điện thờ Sông Mẹ để Thanh tẩy phủ 10 ô'),
 woodgrove:station('woodgrove','Mộc; mở Mưa sinh trưởng và tạo Linh mộc vận tải'),
 earthtemple:station('earthtemple','Thổ; mở Thạch bích và tuyển golem'),
 golemworks:base('golemworks','Tuyển golem đá, cần ấn Thổ và Khế ước. Mở 24 chỗ quân ma pháp. Tối đa 1.'),
 spiritstable:base('spiritstable','Thuần dưỡng linh lộc, cần ấn Mộc và Thủy cùng Khế ước. Mở 12 chỗ quân ma pháp. Tối đa 1.'),
 harmonizer:base('harmonizer','4 thợ, 2 tinh chất + 20 mana/giờ, cần hai ấn khác loại đã chọn: giảm 8 ô nhiễm/giờ và thêm 1 chỗ cấp cho mỗi nguồn mana trong 6 ô (không cộng nhiều đài trên một nguồn).'),
 fourspirits:base('fourspirits','Kỳ quan thời 8: nguồn mana +20% sức chứa, mở thời 9. Khởi công cần Đình 8 và đủ bốn ấn trong 6 ô.'),
} satisfies Record<string,Def>;
export type MagicEra7Building=keyof typeof MAGIC_ERA7_BUILDINGS;
export const MAGIC_ERA7_KINDS=Object.keys(MAGIC_ERA7_BUILDINGS) as MagicEra7Building[];
/** Unit `atk` is damage per second, as everywhere in the engine: per-hit damage
 * from the spec divided by its attack interval (12 per 2 s → 6). */
const mage=(k:'firemage'|'watermage'|'golem'|'spiritdeer',d:string,extra:Partial<Unit>={}):Unit=>{const m=u[k];return {n:m.name,era:m.era,cost:m.cost as Goods,sec:m.seconds,atk:m.damage*1000/m.attackMs,hp:m.hp,space:m.space,range:m.range,attackMs:m.attackMs,speed:m.speed,shot:'arrow',building:m.building,mana:m.mana,research:m.research,d,...extra};};
export const MAGIC_ERA7_UNITS={
 firemage:mage('firemage','Bắn phép 12 sát thương/2 giây, tầm 6. Hỏa cầu (30 mana, 20 giây): 60 sát thương mục tiêu, 30 trong 1,5 ô, tối đa 5. Yếu khi bị áp sát. Cần Chiến pháp; 40 mana khi tuyển.'),
 watermage:mage('watermage','Bắn phép 6 sát thương/2 giây, tầm 5. Thủy hồi (25 mana, 25 giây): hồi 50 HP tối đa 3 quân trong 2 ô. Cần lính che chắn và Hộ sinh; 40 mana khi tuyển.'),
} satisfies Record<string,Unit>;
export const MAGIC_ERA8_UNITS={
 golem:mage('golem','Đánh 50/2,5 giây, cận chiến, chậm. Chặn đường, sát thương nhà ×1,5; không đánh quân bay. Cần ấn Thổ và Khế ước; 120 mana khi tuyển. Chuyên tu Thổ: +10% HP cho golem tuyển sau khi chọn.',{shot:'melee',buildingAtk:1.5}),
 spiritdeer:mage('spiritdeer','Đánh 18/1,8 giây, tầm 2, nhanh. Hộ tống: tối đa 4 quân đồng minh trong 3 ô giảm 10% sát thương (không cộng nhiều linh lộc). Cần ấn Mộc + Thủy và Khế ước; 80 mana khi tuyển.',{shot:'melee'}),
} satisfies Record<string,Unit>;
