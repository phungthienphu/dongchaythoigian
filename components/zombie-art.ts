import type {ZombieKind} from '@/lib/zombies';
export type ZombiePose={time:number;walking?:boolean;attacking?:boolean;face?:1|-1;emerging?:number;hurt?:boolean;gore?:boolean};
/** Shared procedural art; modest blood details, no textures/requests or frame state. */
export function drawZombieArt(c:CanvasRenderingContext2D,kind:ZombieKind,x:number,y:number,scale:number,p:ZombiePose){
 c.save();try{c.translate(x,y);c.scale(scale*(p.face??1),scale);const big=kind==='breaker',fast=kind==='super',k=big?1.38:fast?1.2:1;c.scale(k,k);const phase=p.time/(fast?85:160),walk=p.walking?Math.sin(phase):0,attack=p.attacking?Math.sin(p.time/70):0,emerge=p.emerging??1;
 const oval=(x:number,y:number,rx:number,ry:number,color:string)=>{c.fillStyle=color;c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);c.fill();};
 const line=(x:number,y:number,x2:number,y2:number,color:string,w:number)=>{c.strokeStyle=color;c.lineWidth=w;c.lineCap='round';c.beginPath();c.moveTo(x,y);c.lineTo(x2,y2);c.stroke();};
 oval(0,1,9,3,'#111e1b55');if(emerge<1){oval(0,0,12,5,'#493b32');for(let i=0;i<4;i++)line(-10+i*6,2,-8+i*6,7,'#837159',1);c.translate(0,(1-emerge)*25);c.globalAlpha=.6+.4*emerge;}
 const skin=p.hurt?'#b96e60':fast?'#81977b':big?'#747e63':'#91a58c',cloth=big?'#725044':fast?'#4a6670':'#716657';
 line(-4,-13,-5+walk*3,0,'#3f5048',3.4);line(4,-13,5-walk*3,0,'#596657',3.5);line(-5+walk*3,-1,-2+walk*3,0,'#403c35',3);line(5-walk*3,-1,8-walk*3,0,'#403c35',3);
 c.fillStyle=cloth;c.beginPath();c.moveTo(-7,-28);c.lineTo(5,-29);c.lineTo(big?10:7,-12);c.lineTo(2,-14);c.lineTo(-1,-11);c.lineTo(-7,-14);c.closePath();c.fill();oval(-2,-23,5,4,skin);
 line(-5,-25,-11,-17,skin,big?5:3);line(-11,-17,-4+attack*2,-14,skin,big?4:2.7);line(5,-26,11+attack*3,-23,skin,big?5:3);line(11+attack*3,-23,16+attack*4,-17,skin,big?5:2.7);
 for(let i=0;i<3;i++)line(15+attack*4,-17+i*.8,18+attack*4,-16+i*.9,'#c2baa0',.7);
 oval(fast?3:1,-33,5.8,7,skin);oval(2,-37,5,3,'#687560');line(-2,-31,0,-29,'#51634f',1);oval(3,-34,1.1,1,'#dbba75');oval(-.8,-34,.8,.9,'#282e29');line(1,-29,6,-28,'#493a34',1.6);line(3,-29,3,-27,'#d4c7a8',.8);
 if(p.gore!==false){line(4,-28,6,-25,'#8e2928',1.7);line(-4,-23,-1,-18,'#7b302b',2.3);line(-3,-21,0,-19,'#b64b3b',.8);oval(8,-17,1.8,1,'#862e2a');if(big){line(-4,-16,2,-13,'#923b32',2);oval(-7,-27,2,2,'#9b4436');}}
 if(fast){line(-5,-27,-9,-31,'#9aab87',1.3);line(5,-32,8,-34,'#b7bf98',.8);}if(big){oval(-8,-24,3.5,5,skin);line(9,-16,13,-10,skin,5);}
 }finally{c.restore();}
}
