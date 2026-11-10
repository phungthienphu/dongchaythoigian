// Data-only definitions keep engine initialization acyclic in native ESM.
export const ZOMBIE_BUILDINGS={
 refuge:{n:'Lều trú dân',era:1,cost:{wood:60,stone:20},sec:60,up:true,d:'6/10/14 chỗ trú, vùng 6 ô. Dân tự chạy khi thấy zombie; vẫn cần lính bảo vệ.'},
 healer:{n:'Lều cứu thương',era:1,cost:{wood:50,stone:20},sec:60,jobs:1,up:true,d:'1 thợ y tế, 2/3/4 giường, cứu hộ trong 6 ô. 40 thực/ca, chữa 30 phút. Không cần điện.'},
 warningbell:{n:'Mõ báo động',era:1,cost:{wood:20,stone:10},sec:30,max:4,d:'Báo ổ zombie trong 8 ô và gọi lực lượng bảo vệ. Không gây sát thương.'},
} as const;
