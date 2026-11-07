import type {Unit,UKey} from './engine';
/** Local playtest baseline. atk is nominal damage/second; volleys retain this DPS. */
export const ERA_UNITS={
 crossbow:{n:'Lính nỏ',era:4,cost:{food:250,wood:100,copper:80,gold:10},sec:240,atk:24,hp:90,space:1,range:7,attackMs:1300,speed:.9,shot:'arrow',d:'Nỏ bắn xa 7 ô, nhịp 1,3 giây. Khi địch áp sát trong 1,5 ô chỉ còn 60% sát thương.'},
 cavalry:{n:'Kỵ binh',era:4,cost:{food:500,wood:140,copper:180,gold:30},sec:420,atk:46,hp:180,space:2,range:1.5,attackMs:1000,speed:1.6,shot:'melee',d:'Cơ động, chiếm 2 chỗ. Giáo binh gây 1,8 lần sát thương lên kỵ binh.'},
 musket:{n:'Lính súng',era:5,cost:{food:380,copper:130,gold:35},sec:360,atk:32,hp:120,space:1,range:8,attackMs:1800,speed:.9,shot:'bullet',d:'Tầm 8 ô, nạp đạn 1,8 giây. +20% sát thương lên kỵ binh; yếu trước thiết giáp.'},
 cannon:{n:'Pháo dã chiến',era:5,cost:{food:900,wood:300,copper:700,gold:180,coal:100},sec:900,atk:62,hp:260,space:4,range:10,attackMs:2800,speed:.5,shot:'shell',buildingAtk:3,d:'Tầm 10 ô, chiếm 4 chỗ. Sát thương công trình ×3; khi bị áp sát còn 45% sát thương.'},
 infantry:{n:'Bộ binh hiện đại',era:6,cost:{food:600,copper:220,gold:70},sec:480,atk:43,hp:165,space:1,range:8,attackMs:800,speed:1.1,shot:'bullet',d:'Tầm 8 ô, nhịp 0,8 giây. Khắc chế kỵ binh; trước thiết giáp còn 60% sát thương.'},
 armor:{n:'Xe thiết giáp',era:6,cost:{food:1600,copper:1800,gold:500,coal:300},sec:1500,atk:100,hp:850,space:5,range:7,attackMs:2000,speed:.65,shot:'shell',buildingAtk:1.5,d:'Chiếm 5 chỗ, chậm và cần hậu cần. Kháng vũ khí đời cũ; pháo dã chiến gây ×1,4 sát thương.'},
} satisfies Record<string,Unit>;
export const unitCounter=(u:UKey,target:UKey)=>target==='cavalry'?(u==='spear'?1.8:u==='musket'?1.2:u==='infantry'?1.4:1):target==='armor'?(u==='cannon'?1.4:u==='armor'?1:u==='infantry'?.6:u==='musket'?.45:.3):1;
