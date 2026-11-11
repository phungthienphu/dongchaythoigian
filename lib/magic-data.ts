/** Shared data for the unreleased era 7–9 simulation. No engine imports: safe in native ESM/Workers. */
export const MAGIC_RESOURCES=['aetherCrystal','rune','essence','celestialStone'] as const;
export type MagicResource=typeof MAGIC_RESOURCES[number];
export const isMagicResource=(r:string):r is MagicResource=>(MAGIC_RESOURCES as readonly string[]).includes(r);
/** Each magic good opens (store compartment, market, raids) with its own era. */
export const magicResourceEra=(r:MagicResource)=>r==='essence'?8:r==='celestialStone'?9:7;
export type MagicGoods=Partial<Record<MagicResource|'food'|'wood'|'stone'|'copper'|'gold'|'coal',number>>;
export type Element='fire'|'water'|'wood'|'earth';
export type Contract='dragon'|'tortoise'|'phoenix';
export type Research='conduction'|'warcraft'|'lifecraft'|'elements'|'pact'|'gatecraft';
export type MagicBuildingDef={name:string;era:7|8|9;cost:MagicGoods;seconds:number;jobs:number;max?:number;upgrade?:boolean;source?:{perHour:number;capacity:number};relay?:boolean;mana?:number;input?:MagicGoods;output?:MagicGoods;knowledge?:number;research?:Research;support?:string[];elements?:Element[];seal?:Element;armySpace?:number;wonder?:boolean;priority?:'health'|'defense'|'input'|'output'|'other'};
export const MAGIC_BUILDINGS={
 aetherwell:{name:'Giếng linh mạch',era:7,cost:{stone:4000,copper:1500,gold:500},seconds:3600,jobs:2,max:3,upgrade:true,source:{perHour:240,capacity:1200}},
 manarelay:{name:'Cột dẫn linh',era:7,cost:{stone:1000,copper:300},seconds:1800,jobs:0,max:18,relay:true},
 crystalworks:{name:'Xưởng kết tinh',era:7,cost:{stone:5000,copper:2000,gold:800},seconds:7200,jobs:4,upgrade:true,input:{copper:120,gold:40},output:{aetherCrystal:24},support:['forge'],priority:'input'},
 runeworks:{name:'Xưởng phù văn',era:7,cost:{stone:3000,wood:1000,gold:600},seconds:7200,jobs:4,upgrade:true,input:{wood:120,aetherCrystal:12},output:{rune:12},support:['artisan','machine'],priority:'input'},
 mageacademy:{name:'Học viện pháp thuật',era:7,cost:{stone:6000,copper:2000,rune:60},seconds:10800,jobs:4,max:2,input:{rune:6},mana:20,knowledge:24,armySpace:12,priority:'other'},
 manaspire:{name:'Tháp tụ linh',era:7,cost:{stone:4000,copper:1500,aetherCrystal:40,rune:20},seconds:7200,jobs:2,max:4,upgrade:true,input:{aetherCrystal:6},source:{perHour:480,capacity:2400},research:'conduction'},
 rivershrine:{name:'Điện thờ Sông Mẹ',era:7,cost:{stone:5000,wood:1000,rune:60},seconds:10800,jobs:3,max:2,mana:0,priority:'health'},
 wardcircle:{name:'Pháp trận hộ thành',era:7,cost:{stone:3000,copper:1000,rune:40},seconds:7200,jobs:0,max:4,mana:0,priority:'defense'},
 spiritgarden:{name:'Vườn linh dược',era:7,cost:{wood:2000,stone:3000,aetherCrystal:30},seconds:7200,jobs:3,mana:20,research:'lifecraft',priority:'health'},
 awakeningtower:{name:'Tháp Khai Nguyên',era:7,cost:{stone:40000,copper:15000,gold:8000,aetherCrystal:600,rune:400},seconds:64800,jobs:0,max:1,wonder:true,research:'conduction'},
 essenceforge:{name:'Lò tinh chất',era:8,cost:{stone:8000,copper:3000,rune:100},seconds:10800,jobs:5,upgrade:true,input:{aetherCrystal:24,coal:60},output:{essence:12},mana:30,support:['machine'],priority:'input'},
 firealtar:{name:'Hỏa đàn',era:8,cost:{stone:6000,copper:2000,rune:80,essence:40},seconds:10800,jobs:3,max:2,input:{essence:2},mana:10,research:'elements',seal:'fire',priority:'defense'},
 watertemple:{name:'Thủy điện thờ',era:8,cost:{stone:6000,wood:1000,rune:80,essence:40},seconds:10800,jobs:3,max:2,input:{essence:2},mana:10,research:'elements',seal:'water',priority:'health'},
 woodgrove:{name:'Mộc linh viên',era:8,cost:{wood:4000,stone:4000,rune:80,essence:40},seconds:10800,jobs:3,max:2,input:{essence:2},mana:10,research:'elements',seal:'wood',priority:'output'},
 earthtemple:{name:'Thổ điện',era:8,cost:{stone:8000,copper:2000,rune:80,essence:40},seconds:10800,jobs:3,max:2,input:{essence:2},mana:10,research:'elements',seal:'earth',priority:'defense'},
 golemworks:{name:'Xưởng tượng linh',era:8,cost:{stone:10000,copper:4000,rune:150,essence:80},seconds:18000,jobs:5,max:1,mana:0,research:'pact',elements:['earth'],armySpace:24,priority:'defense'},
 spiritstable:{name:'Vườn linh thú',era:8,cost:{wood:5000,stone:8000,rune:150,essence:80},seconds:18000,jobs:4,max:1,mana:0,research:'pact',elements:['wood','water'],armySpace:12,priority:'defense'},
 harmonizer:{name:'Đài điều hòa',era:8,cost:{stone:8000,copper:3000,rune:120,essence:60},seconds:14400,jobs:4,mana:20,input:{essence:2},research:'elements',priority:'other'},
 fourspirits:{name:'Đại Trận Tứ Linh',era:8,cost:{stone:60000,copper:20000,gold:12000,rune:600,essence:400},seconds:86400,jobs:0,max:1,wonder:true,elements:['fire','water','wood','earth']},
 celestialforge:{name:'Lò thiên luyện',era:9,cost:{stone:15000,copper:7000,rune:200,essence:100},seconds:21600,jobs:8,upgrade:true,input:{copper:180,essence:12,rune:12},output:{celestialStone:24},mana:60,support:['complex'],priority:'input'},
 observatory:{name:'Đài thiên văn',era:9,cost:{stone:12000,copper:5000,rune:150,celestialStone:100},seconds:18000,jobs:4,max:1,mana:0,priority:'defense'},
 spiritgate:{name:'Cổng Linh giới',era:9,cost:{stone:18000,copper:8000,rune:200,celestialStone:200},seconds:28800,jobs:6,max:1,mana:0,research:'gatecraft',elements:['water','earth'],armySpace:24,priority:'defense'},
 covenantaltar:{name:'Đài khế ước',era:9,cost:{stone:10000,copper:4000,rune:120,celestialStone:100},seconds:18000,jobs:4,max:1,mana:0,research:'gatecraft',priority:'defense'},
 worldmatrix:{name:'Trận đồ thiên địa',era:9,cost:{stone:15000,copper:5000,rune:150,celestialStone:150},seconds:21600,jobs:4,max:1,mana:0,research:'gatecraft',priority:'defense'},
 teleportdock:{name:'Bến dịch chuyển',era:9,cost:{stone:10000,copper:3000,rune:100,celestialStone:80},seconds:14400,jobs:3,max:4,mana:0,research:'gatecraft',priority:'output'},
 riverpalace:{name:'Thiên Cung Sông Mẹ',era:9,cost:{stone:100000,copper:35000,gold:25000,rune:1000,essence:800,celestialStone:1000},seconds:129600,jobs:0,max:1,wonder:true},
} satisfies Record<string,MagicBuildingDef>;
export type MagicBuilding=keyof typeof MAGIC_BUILDINGS;
export const magicDef=(kind:MagicBuilding):MagicBuildingDef=>MAGIC_BUILDINGS[kind];
export const MAGIC_RESEARCH:Record<Research,{era:number;requires:Research[];goods:MagicGoods;knowledge:number;seconds:number}>={
 conduction:{era:7,requires:[],goods:{rune:30},knowledge:120,seconds:7200},
 warcraft:{era:7,requires:['conduction'],goods:{rune:50},knowledge:180,seconds:10800},
 lifecraft:{era:7,requires:['conduction'],goods:{rune:40},knowledge:180,seconds:10800},
 elements:{era:8,requires:['conduction','warcraft','lifecraft'],goods:{essence:100,rune:100},knowledge:360,seconds:14400},
 pact:{era:8,requires:['elements'],goods:{essence:80},knowledge:300,seconds:10800},
 gatecraft:{era:9,requires:['pact'],goods:{celestialStone:100},knowledge:600,seconds:21600},
};
export const MAGIC_ERA_REQUIREMENTS={
 7:{population:450,hall:6,wonders:['dam','green'],goods:{food:120000,wood:35000,stone:60000,copper:18000,gold:8000,coal:8000}},
 8:{population:650,hall:7,wonders:['awakeningtower'],goods:{food:180000,wood:45000,stone:80000,copper:24000,gold:12000,aetherCrystal:800,rune:500}},
 9:{population:850,hall:8,wonders:['fourspirits'],goods:{food:250000,wood:60000,stone:110000,copper:32000,gold:18000,rune:800,essence:600}},
} as const;
export const MAGIC_HALL_UPGRADES={7:{goods:{stone:25000,copper:10000,gold:4000},seconds:28800},8:{goods:{stone:40000,copper:15000,gold:6000,rune:200},seconds:43200},9:{goods:{stone:60000,copper:20000,gold:10000,essence:200},seconds:64800}} as const;
export const MAGIC_UNITS={
 firemage:{name:'Hỏa thuật sư',era:7,hp:110,damage:12,attackMs:2000,range:6,speed:.6,space:2,beastSlots:0,cost:{food:200,aetherCrystal:20,rune:10},mana:40,seconds:600,building:'mageacademy',research:'warcraft'},
 watermage:{name:'Thủy thuật sư',era:7,hp:130,damage:6,attackMs:2000,range:5,speed:.6,space:2,beastSlots:0,cost:{food:200,aetherCrystal:20,rune:10},mana:40,seconds:600,building:'mageacademy',research:'lifecraft'},
 golem:{name:'Golem đá',era:8,hp:900,damage:50,attackMs:2500,range:1,speed:.35,space:6,beastSlots:0,cost:{food:500,stone:600,rune:40,essence:30},mana:120,seconds:1800,building:'golemworks',research:'pact',elements:['earth']},
 spiritdeer:{name:'Linh lộc',era:8,hp:350,damage:18,attackMs:1800,range:2,speed:1,space:3,beastSlots:0,cost:{food:300,rune:30,essence:25},mana:80,seconds:1200,building:'spiritstable',research:'pact',elements:['wood','water']},
 dragon:{name:'Thanh Long',era:9,hp:1000,damage:45,attackMs:2000,range:5,speed:1.1,space:12,beastSlots:2,cost:{food:1200,rune:100,essence:80,celestialStone:100},mana:300,seconds:7200,building:'spiritgate',contract:'dragon',flying:true},
 tortoise:{name:'Huyền Quy',era:9,hp:1600,damage:35,attackMs:3000,range:1,speed:.3,space:12,beastSlots:2,cost:{food:1200,rune:100,essence:80,celestialStone:100},mana:300,seconds:7200,building:'spiritgate',contract:'tortoise'},
 phoenix:{name:'Phượng Hoàng',era:9,hp:800,damage:25,attackMs:2000,range:5,speed:1,space:12,beastSlots:2,cost:{food:1200,rune:100,essence:80,celestialStone:100},mana:300,seconds:7200,building:'spiritgate',contract:'phoenix',flying:true},
} satisfies Record<string,{name:string;era:number;hp:number;damage:number;attackMs:number;range:number;speed:number;space:number;beastSlots:number;cost:MagicGoods;mana:number;seconds:number;building:MagicBuilding;research?:Research;elements?:Element[];contract?:Contract;flying?:boolean}>;
export type MagicUnit=keyof typeof MAGIC_UNITS;
export const MAGIC_SPELLS={
 fireball:{name:'Hỏa cầu',era:7,mana:30,cooldown:20000,radius:1.5,targets:5,damage:60,splash:30,buildingScale:.5,research:'warcraft'},
 waterheal:{name:'Thủy hồi',era:7,mana:25,cooldown:25000,radius:2,targets:3,heal:50,research:'lifecraft'},
 roots:{name:'Trói rễ',era:7,mana:40,cooldown:45000,radius:3,targets:6,duration:6000,slow:.3,research:'warcraft',building:'wardcircle'},
 lightpulse:{name:'Linh quang',era:7,mana:2,cooldown:10000,radius:4,targets:300,damage:10,slow:.4,duration:4000,building:'aetherwell'},
 firecircle:{name:'Hỏa trận',era:7,mana:1,cooldown:2000,radius:6,targets:6,damage:40,building:'wardcircle'},
 purify:{name:'Thanh tẩy',era:7,mana:60,cooldown:1200000,radius:8,targets:4,research:'lifecraft',building:'rivershrine'},
 firestorm:{name:'Bão lửa',era:8,mana:120,goods:{essence:2},cooldown:180000,radius:3,targets:8,duration:8000,damage:10,buildingScale:.25,building:'firealtar'},
 cleanse:{name:'Tịnh hóa',era:8,mana:100,goods:{essence:2},cooldown:1800000,radius:10,targets:8,building:'watertemple'},
 growthrain:{name:'Mưa sinh trưởng',era:8,mana:80,goods:{essence:2},cooldown:7200000,radius:6,targets:4,duration:3600000,building:'woodgrove'},
 stonewall:{name:'Thạch bích',era:8,mana:100,goods:{essence:2},cooldown:180000,radius:6,targets:3,duration:30000,building:'earthtemple'},
 thunder:{name:'Thiên lôi',era:9,mana:300,goods:{celestialStone:10},cooldown:0,radius:2,targets:6,damage:180,buildingScale:.25,windup:5000,building:'worldmatrix',elements:['fire','water'],package:true},
 sanctuary:{name:'Hộ giới',era:9,mana:250,goods:{celestialStone:8},cooldown:0,radius:4,targets:300,duration:15000,reduction:.25,building:'worldmatrix',elements:['wood','earth'],package:true},
} satisfies Record<string,{name:string;era:number;mana:number;goods?:MagicGoods;cooldown:number;radius:number;targets:number;damage?:number;splash?:number;heal?:number;buildingScale?:number;duration?:number;slow?:number;reduction?:number;windup?:number;building?:MagicBuilding;research?:Research;elements?:Element[];package?:boolean}>;
export type MagicSpell=keyof typeof MAGIC_SPELLS;
