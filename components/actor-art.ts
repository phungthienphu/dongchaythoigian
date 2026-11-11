/** Shared Canvas art. Coordinates are local pixels at 64px/tile, origin at feet.
 * Drawing only: never changes simulation, hit boxes, attack timing or resources.
 * All entry points restore the caller's complete Canvas state.
 */
export type ActorPose = { time?: number; walking?: boolean; fighting?: boolean; face?: 1 | -1; seed?: number; hostile?: boolean; active?: boolean; graze?: boolean; antlers?: boolean; /** Spell cast (mages, phoenix heal); visual only. */ casting?: boolean; /** Just took a hit: brief warm flash. */ hurt?: boolean; /** Reduced motion: no idle glow flicker. */ still?: boolean };
export type AnimalArt = "buffalo" | "elephant" | "deer" | "boar";
export type SoldierArt = "club" | "sling" | "spear" | "bow" | "sword" | "crossbow" | "cavalry" | "musket" | "cannon" | "infantry" | "armor" | "wagon" | "medic" | "elephant";
export type FutureArt = "tank" | "fighter" | "radar" | "oil" | "coal" | "helicopter" | "drone" | "mech" | "fusion" | "orbital" | "satellite";
type C = CanvasRenderingContext2D;
type Pt = readonly [number, number];
const TAU = Math.PI * 2;
function shape(c: C, points: readonly Pt[], fill: string, edge = "", width = .7) {
  c.beginPath(); points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath();
  c.fillStyle = fill; c.fill(); if (edge) { c.strokeStyle = edge; c.lineWidth = width; c.stroke(); }
}
function ellipse(c: C, x: number, y: number, rx: number, ry: number, fill: string, rotation = 0) {
  c.fillStyle = fill; c.beginPath(); c.ellipse(x, y, rx, ry, rotation, 0, TAU); c.fill();
}
function stroke(c: C, points: readonly Pt[], color: string, width = 1) {
  c.beginPath(); points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.strokeStyle = color; c.lineWidth = width; c.stroke();
}
function curve(c: C, from: Pt, control: Pt, to: Pt, color: string, width: number) {
  c.beginPath(); c.moveTo(...from); c.quadraticCurveTo(...control, ...to); c.strokeStyle = color; c.lineWidth = width; c.stroke();
}
function rect(c: C, x: number, y: number, w: number, h: number, color: string) { c.fillStyle = color; c.fillRect(x, y, w, h); }
/** Shaded isometric block: front bottom left, width, depth and height. */
function block(c: C, x: number, y: number, w: number, d: number, h: number, top: string, front: string, side: string) {
  shape(c, [[x,y-h],[x+w,y-h],[x+w+d,y-h-d*.5],[x+d,y-h-d*.5]], top);
  shape(c, [[x,y],[x+w,y],[x+w,y-h],[x,y-h]], front);
  shape(c, [[x+w,y],[x+w+d,y-d*.5],[x+w+d,y-h-d*.5],[x+w,y-h]], side);
}
function shadow(c: C, rx: number, ry: number) { ellipse(c, 0, 1, rx, ry, "rgba(8,20,17,.24)"); }
function local(c: C, x: number, y: number, scale: number, pose: ActorPose, draw: () => void) {
  c.save();
  try { c.translate(x, y); c.scale(scale * (pose.face ?? 1), scale); c.lineJoin = "round"; c.lineCap = "round"; draw(); }
  finally { c.restore(); }
}

function animalBody(c: C, kind: AnimalArt, p: ActorPose) {
  const time = p.time ?? 0, phase = time / 160 + (p.seed ?? 0) * 11;
  const walk = p.walking ? Math.sin(phase) : 0;
  if (kind === "elephant") {
    shadow(c, 22, 6);
    // Far limbs and belly first; near limbs cross them during a walking cycle.
    for (const x of [-13, 9]) {
      const d = walk * (x < 0 ? -2 : 2);
      shape(c, [[x-3,-17],[x+3,-17],[x+4+d,-2],[x-2+d,-2]], "#596969");
      ellipse(c, x+1+d,-2,3.6,1.8,"#475857");
    }
    curve(c,[-18,-23],[-25,-13],[-22+Math.sin(time/450)*2,-8],"#687b79",1.5);
    stroke(c,[[-22,-9],[-23,-6]],"#344945",2.5);
    shape(c,[[-19,-13],[-21,-26],[-16,-33],[0,-36],[15,-30],[17,-17],[10,-10],[-10,-10]],"#82938e");
    ellipse(c,-5,-23,17,11,"#8e9e96");
    ellipse(c,-9,-27,10,5,"#a0afa4");
    for (const x of [-12, 9]) {
      const d = walk * (x < 0 ? 2 : -2);
      shape(c,[[x-3,-16],[x+3,-15],[x+3+d,-1],[x-3+d,0]],"#81958d");
      ellipse(c,x+d,-1,3.8,1.8,"#71847e");
      for(const off of [-1.5,0,1.5])rect(c,x+d+off-.4,-1.8,.9,1.5,"#d4ceac");
    }
    ellipse(c,16,-27,8,9,"#95a39a");
    shape(c,[[13,-34],[6,-33],[5,-24],[10,-18],[16,-23]],"#6f8780");
    curve(c,[10,-30],[6,-25],[11,-21],"#a7b4a4",1);
    const trunk = Math.sin(time/340)*1.4;
    curve(c,[21,-26],[29,-13],[24+trunk,-7],"#788e85",5.5);
    curve(c,[24+trunk,-7],[21,-6],[22,-10],"#788e85",3);
    for(let i=0;i<3;i++)stroke(c,[[24,-19+i*3],[26,-20+i*3]],"#5e776e",.6);
    curve(c,[20,-22],[31,-17],[29,-23],"#f1e7c4",2);
    ellipse(c,20,-29,.9,.9,"#1e3430"); ellipse(c,20.3,-29.3,.3,.3,"#e8e5cc");
    // Saddle cloth, gold trim, and a timber howdah with a visible mahout.
    shape(c,[[-15,-33],[4,-35],[8,-18],[-11,-17]],"#9e423d");
    stroke(c,[[-11,-18],[7,-19],[4,-34]],"#dfbb6c",1.3);
    for(const x of [-8,-3,2])shape(c,[[x,-26],[x+2,-23],[x,-20],[x-2,-23]],"#dbb25c","",0);
    block(c,-9,-34,13,4,5,"#d5b375","#885b39","#65472f");
    for(const x of [-8,3])stroke(c,[[x,-35],[x,-45]],"#745334",1.4);
    stroke(c,[[-8,-42],[3,-42]],"#e1bb72",1.2);
    rect(c,-4,-45,5,8,"#3d7775");ellipse(c,-1.5,-48,2.3,2.6,"#d6ac7c");
    shape(c,[[-5,-49],[-1,-53],[3,-49]],"#d9c08b");
    stroke(c,[[3,-41],[10,-48]],"#9c773e",1);
    return;
  }
  const buffalo=kind==="buffalo", deer=kind==="deer";
  const body=buffalo?"#566968":deer?"#b9854d":"#78634d";
  const light=buffalo?"#778783":deer?"#d6a56a":"#978267";
  const dark=buffalo?"#364b4b":deer?"#805d3d":"#51483c";
  const height=deer?14:buffalo?11:7, length=buffalo?15:deer?11:12;
  shadow(c,length+2,3.5);
  for(const near of [false,true]) {
    for(const back of [true,false]) {
      const x=back?-length*.63:length*.6, d=walk*(back!==near?2:-2), y=near?0:-2;
      stroke(c,[[x,-height],[x+d*.4,-height*.48],[x+d,y]],near?body:dark,buffalo?3:deer?1.6:2.3);
      stroke(c,[[x+d-.7,y],[x+d+1,y]],"#293b36",deer?1.5:2);
    }
    if(!near){
      ellipse(c,-1,-height-4,length, buffalo?7:deer?5:6,body);
      ellipse(c,-4,-height-6,length*.7,3.6,light);
      shape(c,[[-length,-height-5],[-length-4,-height-3],[-length-2,-height-1]],deer?"#eee4c3":dark);
    }
  }
  const dip=p.graze?5:0;
  curve(c,[length*.55,-height-5],[length*.9,-height-(deer?13:6)+dip],[length+2,-height-(deer?10:3)+dip],body,deer?4:6);
  const hx=length+2,hy=-height-(deer?10:3)+dip;
  ellipse(c,hx,hy,deer?4.5:buffalo?5:5.5,deer?2.8:3.8,body,.2);
  ellipse(c,hx+3,hy+1,2.5,2,buffalo?"#3a5050":deer?"#493d30":"#b39378");
  shape(c,[[hx-3,hy-1],[hx-5,hy-7],[hx,hy-4]],light);
  ellipse(c,hx+1,hy-1,.65,.65,"#182d27");
  if(buffalo){
    curve(c,[hx-1,hy-4],[hx-11,hy-10],[hx-6,hy-15],"#d4c8a0",2);
    curve(c,[hx+1,hy-4],[hx+10,hy-9],[hx+5,hy-14],"#e4d6b1",2.2);
    stroke(c,[[hx-6,hy-15],[hx-6.8,hy-12.5]],"#5d6555",1);
    curve(c,[-length+1,-height-7],[-length-6,-height+1],[-length-5+walk,0],dark,1);
    stroke(c,[[-length-5+walk,-1],[-length-5+walk,1]],dark,2.2);
    curve(c,[-8,-height-4],[-4,-height-1],[2,-height-2],"#94a39a",.7);
  }else if(deer){
    for(const [x,y]of [[-7,-20],[-3,-21],[1,-19],[-5,-17],[0,-16],[4,-18]])ellipse(c,x,y,1,.7,"#ead3a0");
    ellipse(c,2,-height+1,5,1.5,"#debf8b");
    if(p.antlers){
      for(const off of [-2,2]){
        stroke(c,[[hx+off,hy-2],[hx+off-1,hy-9],[hx+off+1,hy-15]],"#dbc99e",1.2);
        stroke(c,[[hx+off-1,hy-8],[hx+off-5,hy-11],[hx+off-6,hy-14]],"#dbc99e",1);
      }
    }
  }else{
    for(let i=0;i<9;i++)stroke(c,[[-9+i*2,-height-8],[-10+i*2,-height-11-(i%2)]],"#4d493c",1);
    curve(c,[hx+4,hy+2],[hx+8,hy+3],[hx+7,hy-2],"#f0dfb4",1.6);
    for(const off of [0,2])ellipse(c,hx+3.5,hy+off*.6,.4,.5,"#5e4c3b");
    curve(c,[-12,-12],[-18,-16],[-16,-10],dark,1);
  }
}
export function drawAnimalArt(c:C,kind:AnimalArt,x:number,y:number,scale:number,pose:ActorPose={}) {
  local(c,x,y,scale,pose,()=>animalBody(c,kind,pose));
}

const cloth:Record<SoldierArt,string>={club:"#a67c4e",sling:"#b59762",spear:"#a77a3b",bow:"#547752",sword:"#6f8590",crossbow:"#4e7974",cavalry:"#a95245",musket:"#66716d",infantry:"#53745b",medic:"#e0d6b2",wagon:"#a8874a",elephant:"#a95245",cannon:"#707c57",armor:"#5f7a58"};
function human(c:C,kind:SoldierArt,p:ActorPose,mounted=false){
  const time=p.time??0,ph=time/140+(p.seed??0)*10,step=p.walking?Math.sin(ph)*2.5:0,bob=p.walking?Math.abs(Math.sin(ph))*.65:Math.sin(time/650)*.15;
  const color=p.hostile?"#8e4940":cloth[kind], metal=kind==="sword"?"#b9c9c5":"#c5a764",skin="#d8ac7f";
  const modern=kind==="infantry",gun=kind==="musket"||modern;
  if(!mounted)shadow(c,6.5,2.5);
  c.save();c.translate(0,-bob);
  for(const [x,d]of [[-2,-step],[2,step]]){
    stroke(c,[[x,-10],[x+d*.4,-5],[x+d,-1]],"#384640",2.6);
    shape(c,[[x+d-1.2,-2],[x+d+1.2,-2],[x+d+2,.4],[x+d-1.3,.4]],"#3d342b");
    stroke(c,[[x+d-1,-1],[x+d+1,-1]],"#bca57c",.5);
  }
  // Coat silhouette, shaded side, belt and hanging tunic panels.
  shape(c,[[-4,-18],[2,-18],[4,-10],[5,-7],[-4,-7]],color);
  shape(c,[[-4,-17],[-1,-17],[0,-7],[-4,-7]],p.hostile?"#663c35":"#374c42","",0);
  rect(c,-3.5,-11,7,1.3,"#675239");rect(c,-.2,-11,1.7,1.5,"#e0bb66");
  if(["sword","spear","crossbow","cavalry"].includes(kind)){
    shape(c,[[-3.6,-18],[2,-18],[3,-12],[-3,-12]],metal);
    for(let y=-16;y<-11;y+=1.5)stroke(c,[[-3,y],[2,y]],"#647266",.55);
    rect(c,-4.7,-18,2.5,3,"#bda775");rect(c,2,-18,2.5,3,"#bda775");
  }
  if(modern){
    shape(c,[[-3,-18],[3,-18],[3,-11],[-3,-11]],"#3c5548");
    for(const x of [-2,1])rect(c,x,-14,2,2.5,"#8c9870");
    block(c,-6,-12,2,1,5,"#9b9d73","#657557","#435d4a");
  }
  ellipse(c,.2,-21,3,3.7,skin);
  shape(c,[[1,-22],[3,-22],[4,-20],[2.5,-19.5]],skin,"",0);
  stroke(c,[[2.7,-21],[3.2,-21]],"#34362c",.7);
  ellipse(c,-1.5,-20,1,1.4,"#bb8c62");
  const primitive=kind==="club"||kind==="sling";
  if(primitive){
    shape(c,[[-3,-22],[-3,-25],[1,-25],[3,-23],[0,-23]],"#493e2e");
    stroke(c,[[-3,-22],[3,-22]],"#cda96d",1);
  }else if(kind==="medic"){
    shape(c,[[-3,-24],[2,-25],[4,-23],[-3,-23]],"#efe9cc");rect(c,-1,-25,1.2,2,"#407267");
  }else{
    shape(c,[[-3.5,-22],[-3,-25],[0,-27],[3,-25],[4,-22]],modern?"#738762":gun?"#434f50":metal);
    stroke(c,[[-3.5,-22],[4,-22]],"#344b43",.9);
    if(!gun){curve(c,[-2,-25],[0,-27],[2,-25],"#e5d09b",.7);stroke(c,[[-2,-26],[-3,-30],[-1,-33]],p.hostile?"#dbc291":"#b04e3c",2);}
    if(kind==="sword")rect(c,-3,-22,1.5,4,"#9aafaa");
  }
  const swing=p.fighting?Math.sin(time/150+(p.seed??0)*8):0;
  // Far arm and hand, separated from the torso by a dark seam.
  stroke(c,[[-3,-17],[-5,-13],[-2,-12]],color,2.7);ellipse(c,-2,-12,1.3,1.2,skin);
  stroke(c,[[3,-17],[5,-14],[8,-14+swing]],color,3);ellipse(c,8,-14+swing,1.3,1.3,skin);
  if(kind==="spear"||kind==="cavalry"){
    stroke(c,[[7,-3],[10,-34+swing*2]],"#795737",1.2);
    shape(c,[[10,-39+swing*2],[7.7,-32+swing*2],[11.5,-32+swing*2]],"#d5d8ba");
    shape(c,[[9,-30],[15,-28],[9,-25]],"#ae5143","",0);
  }else if(kind==="sword"){
    const ax=9+swing*4,ay=-22+swing*6;
    shape(c,[[7,-13],[ax,-30+ay+22],[ax+2,-28+ay+22],[9,-12]],"#dae4d7");
    stroke(c,[[6,-14],[11,-11]],"#c7a45a",1.5);
    shape(c,[[-5,-17],[-.5,-15],[-1,-9],[-4,-6],[-7,-10],[-8,-15]],"#4e7274");
    stroke(c,[[-5,-17],[-.5,-15],[-1,-9],[-4,-6],[-7,-10],[-8,-15],[-5,-17]],"#c4ad6c",.8);
    rect(c,-4.7,-15,1,6,"#bdcaab");
  }else if(kind==="bow"){
    const pull=p.fighting?Math.max(0,swing)*3:0;
    curve(c,[10,-25],[20,-16],[10,-6],"#b08b53",1.4);
    stroke(c,[[10,-25],[8-pull,-15],[10,-6]],"#ecdfb7",.6);
    stroke(c,[[5,-15],[18,-15]],"#c9b07b",.7);shape(c,[[20,-15],[17,-16],[17,-14]],"#d9d9c4","",0);
    stroke(c,[[-5,-17],[-7,-28]],"#6d5138",3);for(const x of [-8,-6])stroke(c,[[x,-25],[x,-30]],"#dccb9b",.6);
  }else if(kind==="crossbow"){
    stroke(c,[[3,-13],[15,-17]],"#795c3b",2.4);stroke(c,[[7,-14],[18,-18]],"#cfccaa",.9);
    curve(c,[11,-23],[17,-16],[16,-10],"#c5a76c",1.4);stroke(c,[[11,-23],[13,-16],[16,-10]],"#e6d7b0",.5);
  }else if(gun){
    stroke(c,[[2,-13],[10,-15]],"#806748",3);
    stroke(c,[[6,-15],[19,-18]],modern?"#283d38":"#a4aaa0",modern?2.1:1.2);
    if(modern){rect(c,10,-16,2,4,"#2b4038");stroke(c,[[10,-17],[13,-17]],"#bac3a4",.7);}
    else stroke(c,[[17,-17],[22,-21]],"#c6caba",.7);
    // Attack flash only follows the renderer's authoritative attacking flag.
    if(p.fighting&&Math.sin(time/150+(p.seed??0))>.82)shape(c,[[19,-18],[23,-21],[22,-18],[27,-17],[22,-16]],"#ffe3a0","",0);
  }else if(kind==="club"){
    stroke(c,[[8,-13],[13+swing*5,-26+swing*5]],"#765339",2.5);
    ellipse(c,13+swing*5,-26+swing*5,2.5,4,"#a0855c",-.3);
    stroke(c,[[11+swing*5,-27+swing*5],[15+swing*5,-27+swing*5]],"#d0bc8a",1);
  }else if(kind==="sling"){
    curve(c,[8,-14],[18,-20-swing*6],[11,-29-swing*2],"#cbb582",.8);ellipse(c,11,-29-swing*2,1.5,1,"#a3a491");
    shape(c,[[-5,-12],[-1,-12],[0,-7],[-5,-7]],"#7f6240");
  }else if(kind==="medic"){
    block(c,5,-6,6,2,5,"#b6c4a0","#527b67","#355d51");
    rect(c,7,-10,1,3,"#f5edcd");rect(c,6,-9,3,1,"#f5edcd");
    stroke(c,[[-3,-19],[4,-10]],"#8d9c7e",1);
  }else if(kind==="wagon"){
    stroke(c,[[-2,-12],[-12,-4]],"#957445",1.4);
    block(c,-27,-4,16,4,6,"#c8a56b","#88613d","#644c31");
    for(const x of [-23,-13]){
      ellipse(c,x,-1,3.5,3.5,"#3b4236");ellipse(c,x,-1,2.5,2.5,"#b3945f");
      const a=p.walking?time/170:0;stroke(c,[[x-Math.cos(a)*2.5,-1-Math.sin(a)*2.5],[x+Math.cos(a)*2.5,-1+Math.sin(a)*2.5]],"#604b31",.8);
      ellipse(c,x,-12,3.5,4.5,"#cbb783");stroke(c,[[x-2,-14],[x+2,-14]],"#8c794b",.6);
    }
  }
  c.restore();
}
function horse(c:C,p:ActorPose){
  shadow(c,20,5);const t=p.time??0,w=p.walking?Math.sin(t/140+(p.seed??0)*10)*3:0;
  for(const [x,d]of [[-10,w],[-6,-w],[8,-w],[12,w]])stroke(c,[[x,-15],[x+d*.6,-8],[x+d,0]],"#664f36",2.5);
  ellipse(c,-2,-18,16,7,"#a57d51");ellipse(c,-6,-21,10,4,"#c39a66");
  shape(c,[[7,-20],[11,-35],[17,-38],[23,-33],[21,-28],[15,-27],[14,-18]],"#a57d51");
  shape(c,[[10,-31],[11,-38],[15,-40],[14,-31]],"#4b4432");
  shape(c,[[16,-36],[16,-43],[19,-38]],"#8b6944");
  curve(c,[-16,-20],[-24,-23],[-23+w*.5,-8],"#4b4432",3);
  ellipse(c,19,-33,.8,.8,"#26362d");
  stroke(c,[[21,-30],[12,-24],[2,-23]],"#dac28b",.9);
  shape(c,[[-9,-24],[3,-25],[7,-15],[-7,-14]],"#9d4941");stroke(c,[[-7,-15],[6,-16]],"#d6b776",1);
}
export function drawSoldierArt(c:C,kind:SoldierArt,x:number,y:number,scale:number,pose:ActorPose={}){
  local(c,x,y,scale,pose,()=>{
    if(kind==="elephant"){animalBody(c,"elephant",pose);return;}
    if(kind==="armor"){vehicle(c,"tank",pose);return;}
    if(kind==="cannon"){cannon(c,pose);return;}
    if(kind==="cavalry"){horse(c,pose);c.save();c.translate(-2,-21);human(c,kind,pose,true);c.restore();return;}
    human(c,kind,pose);
  });
}
function cannon(c:C,p:ActorPose){
  shadow(c,23,5);const recoil=p.fighting?Math.max(0,Math.sin((p.time??0)/150))*2:0;
  stroke(c,[[-20,-3],[7,-10]],"#9c8254",3);
  block(c,-8,-5,11,5,7,"#b19660","#74603f","#4a4e38");
  for(const x of [-4,2]){
    ellipse(c,x,-3,7,7,"#3b4236");ellipse(c,x,-3,5.8,5.8,"#b39a63");
    for(let i=0;i<6;i++){const a=i*TAU/6+(p.walking?(p.time??0)/300:0);stroke(c,[[x,-3],[x+Math.cos(a)*5.8,-3+Math.sin(a)*5.8]],"#665c3f",1);}
    ellipse(c,x,-3,1.5,1.5,"#ddd0a0");
  }
  shape(c,[[-5-recoil,-13],[22-recoil,-21],[24-recoil,-16],[-3-recoil,-9]],"#7c8c71");
  stroke(c,[[0-recoil,-14],[22-recoil,-20]],"#b6bf92",1);
  ellipse(c,23-recoil,-18.5,2.5,3,"#354a3e",-.2);
  if(p.fighting&&Math.sin((p.time??0)/150)>.85)shape(c,[[25,-21],[34,-23],[31,-18],[36,-15],[26,-16]],"#ffdaa0","",0);
}
function vehicle(c:C,kind:FutureArt,p:ActorPose){
  const t=p.time??0,active=p.active!==false;
  if(kind==="tank"){
    shadow(c,29,7);const recoil=p.fighting?Math.max(0,Math.sin(t/150))*2:0;
    block(c,-22,-10,37,9,8,"#6b7e61","#293e36","#233a33");
    // Front and rear track assemblies, moving links and five road wheels.
    for(const [ox,oy]of [[3,-10],[-2,0]]){
      shape(c,[[-23+ox,oy-10],[16+ox,oy-10],[21+ox,oy-6],[17+ox,oy],[-20+ox,oy],[-25+ox,oy-4]],"#293c35");
      for(let i=0;i<6;i++){const x=-18+i*6+ox;ellipse(c,x,oy-5,2.7,3,"#8d9b78");ellipse(c,x,oy-5,1,1.1,"#344c40");}
      for(let i=0;i<11;i++){const x=-20+i*3.6+(p.walking?(t/70)%3.6:0)+ox;stroke(c,[[x,oy-1],[x+1,oy-2]],"#b0b49a",.7);}
    }
    block(c,-24,-9,39,10,8,"#a0aa7c","#6d805a","#435f4c");
    shape(c,[[-18,-17],[4,-17],[8,-21],[-11,-24]],"#6d845d");
    block(c,-9-recoil,-19,17,9,8,"#b0b98b","#768c63","#4e6c52");
    ellipse(c,-1-recoil,-31,4,2,"#506b51");stroke(c,[[-5,-31],[2,-31]],"#ccd1a5",.7);
    shape(c,[[5-recoil,-26],[32-recoil,-32],[34-recoil,-29],[8-recoil,-23]],"#617c5e");
    stroke(c,[[9-recoil,-26],[32-recoil,-31]],"#b4c29a",.9);
    shape(c,[[31-recoil,-33],[36-recoil,-33],[37-recoil,-29],[33-recoil,-28]],"#3d5949");
    rect(c,-15,-14,4,2,"#e6d89c");rect(c,9,-14,4,2,"#e6d89c");
    stroke(c,[[-6,-30],[-10,-43]],"#708e77",.7);
    for(const x of [-15,-8,0,7])stroke(c,[[x,-17],[x+3,-18]],"#c8cba3",.6);
    if(p.fighting&&Math.sin(t/150)>.85)shape(c,[[37,-33],[45,-37],[43,-32],[50,-30],[39,-28]],"#ffe0a0","",0);
    return;
  }
  if(kind==="drone"){
    shadow(c,25,5);c.save();c.translate(0,-22+Math.sin(t/650));
    // Four enclosed rotors distinguish the electric drone from a jet fighter.
    for(const [x,y]of [[-20,-13],[18,-18],[-16,8],[23,3]]){
      stroke(c,[[0,-6],[x,y]],"#88b4a5",3);
      ellipse(c,x,y,9,4.5,"#3d706e");ellipse(c,x,y,7,3.3,"#243f46");
      const a=active?t/65:Math.PI/4;
      stroke(c,[[x-Math.cos(a)*6,y-Math.sin(a)*2.6],[x+Math.cos(a)*6,y+Math.sin(a)*2.6]],"#bedbc5",1);
      ellipse(c,x,y,1,1,"#83d6c1");
    }
    shape(c,[[-9,-13],[3,-16],[12,-9],[9,0],[-3,3],[-10,-3]],"#bed8c3");
    shape(c,[[3,-16],[12,-9],[9,0],[4,-4]],"#77a99e");
    stroke(c,[[-7,-7],[4,-10]],"#e1edcd",1);
    ellipse(c,3,2,4,3,"#427574");ellipse(c,4,2,2,1.7,"#8ce7d5");
    for(const x of [-5,7])stroke(c,[[x,-1],[x,7],[x+4,7]],"#628f82",1);
    c.restore();return;
  }
  if(kind==="fighter"){
    const bob=Math.sin(t/650)*1.5;
    shadow(c,28,5);c.save();c.translate(0,-18+bob);
    // Low swept wings in three-quarter projection, engine pods and twin fins.
    shape(c,[[-12,-6],[-24,-9],[-29,-19],[-12,-15],[5,-12],[8,-7]],"#718e9a");
    shape(c,[[-11,-9],[-29,-7],[-19,-1],[8,-1],[17,-6]],"#acc0bc");
    shape(c,[[-7,-9],[0,-6],[-3,13],[-11,18],[-14,15],[-12,0]],"#adc3c5");
    shape(c,[[-6,-8],[2,-10],[20,-5],[37,-7],[45,-10],[31,-14],[11,-15],[-7,-14],[-23,-21],[-26,-15],[-20,-8]],"#d0dbcf");
    shape(c,[[11,-15],[31,-14],[45,-10],[23,-10]],"#e5e7d4","",0);
    shape(c,[[14,-14],[23,-14],[29,-11],[13,-11]],"#3d7b8b");stroke(c,[[17,-14],[19,-11]],"#a1d4d0",.6);
    shape(c,[[-20,-14],[-22,-27],[-14,-21],[-10,-13]],"#5a7b88");
    shape(c,[[-11,-14],[-8,-24],[-2,-18],[-3,-12]],"#8eafb3");
    ellipse(c,-20,-10,2.5,2,"#293f45");
    if(active){shape(c,[[-22,-12],[-31-Math.sin(t/65)*2,-11],[-22,-9]],"#e9b571","",0);}
    stroke(c,[[4,-5],[-5,9]],"#638591",.8);stroke(c,[[-12,-16],[-22,-19]],"#dae1cd",.7);
    rect(c,0,-10,3,1,"#b77454");ellipse(c,-11,15,1,.8,"#c67058");ellipse(c,-23,-19,1,.8,"#8cd1ac");
    c.restore();return;
  }
  if(kind==="helicopter"){
    shadow(c,29,6);const bob=active?Math.sin(t/300):0;c.save();c.translate(0,-10+bob);
    stroke(c,[[-15,2],[12,2]],"#b0bba0",1.7);stroke(c,[[-8,-5],[-8,2],[8,-5],[8,2]],"#667c6d",1.5);
    shape(c,[[-10,-12],[-31,-15],[-34,-21],[-29,-22],[-26,-17],[-5,-17]],"#829b75");
    ellipse(c,0,-13,15,9,"#8da67f");shape(c,[[3,-21],[13,-18],[17,-11],[3,-12]],"#447982");
    stroke(c,[[8,-20],[8,-12]],"#b5c9ae",.8);block(c,-8,-12,9,3,4,"#b2bf92","#70896b","#496a54");
    stroke(c,[[-2,-21],[-2,-27]],"#506d5d",2);
    const rotor=active?Math.cos(t/45):.7;
    stroke(c,[[-2-35*rotor,-27-rotor*4],[-2+35*rotor,-27+rotor*4]],"#c4d0b0",1.5);
    stroke(c,[[-30,-18],[-30+(active?Math.sin(t/65):.7)*5,-24],[-30-(active?Math.sin(t/65):.7)*5,-12]],"#d1cfac",.9);
    c.restore();return;
  }
  if(kind==="radar"){
    shadow(c,25,7);block(c,-23,1,33,11,4,"#a9b3a0","#6b8272","#425f54");
    block(c,-16,-3,16,9,11,"#8ea38b","#526f60","#3b574d");
    rect(c,-12,-12,6,3,"#293f3d");rect(c,-11,-11,4,1,active?"#8bd5ad":"#536962");
    stroke(c,[[4,-7],[4,-34]],"#9fbaa2",2.8);stroke(c,[[-1,-8],[4,-28],[10,-11]],"#617e6a",1.2);
    c.save();c.translate(4,-37);c.scale(active?.4+Math.abs(Math.sin(t/1800))*.6:.8,1);
    shape(c,[[-17,-5],[-12,6],[0,11],[12,6],[17,-5],[0,-12]],"#729d91");
    for(let x=-12;x<=12;x+=4)curve(c,[x,-8+Math.abs(x)*.2],[x*.8,1],[x*.6,8-Math.abs(x)*.15],"#bad4ba",.6);
    for(const y of [-4,1,5])curve(c,[-15+Math.abs(y),y],[0,y+7],[15-Math.abs(y),y],"#bad4ba",.6);
    stroke(c,[[-13,0],[0,-5],[13,0]],"#dbdfba",1);stroke(c,[[0,-5],[4,-15]],"#dbe2c8",1.3);ellipse(c,4,-15,1.8,1.8,active?"#98dfbc":"#80978b");
    c.restore();return;
  }
  if(kind==="coal"){
    shadow(c,30,8);block(c,-29,2,45,12,3,"#9b9e7d","#72765a","#58624e");
    // Jagged rock face around a timber-reinforced dark shaft.
    shape(c,[[-27,-4],[-26,-24],[-20,-34],[-9,-38],[1,-32],[10,-24],[13,-7]],"#687a70");
    shape(c,[[-24,-24],[-15,-34],[-8,-30],[-3,-16],[-14,-12]],"#8b9882");
    shape(c,[[-20,-4],[-20,-20],[-15,-27],[-7,-27],[0,-20],[0,-4]],"#1e3432");
    stroke(c,[[-23,-3],[-23,-23],[-17,-30],[-6,-30],[3,-23],[3,-4]],"#ac8a57",3.2);
    for(const x of [-22,2]){stroke(c,[[x-2,-11],[x+2,-11]],"#d7b67a",1);stroke(c,[[x-2,-21],[x+2,-21]],"#d7b67a",1);}
    stroke(c,[[-15,-5],[-5,9]],"#b7c4ad",1.2);stroke(c,[[-6,-5],[8,8]],"#b7c4ad",1.2);
    for(let i=0;i<5;i++)stroke(c,[[-14+i*2,-3+i*2.5],[-5+i*3,-4+i*2.5]],"#755d3e",1.8);
    const move=active?Math.sin(t/1000)*1.5:0;
    block(c,-8+move,4,13,5,6,"#879a91","#536d68","#324e4a");
    for(const x of [-5,4])ellipse(c,x+move,4,1.8,1.8,"#263e37");
    for(const [x,y]of [[-5,-5],[0,-6],[4,-5],[-1,-9]])shape(c,[[x-3+move,y+2],[x-2+move,y-2],[x+1+move,y-3],[x+4+move,y+1]],"#2e4540");
    for(const [x,y]of [[19,-5],[25,-1],[20,3]])shape(c,[[x-5,y],[x-2,y-6],[x+3,y-5],[x+6,y]],"#394c43");
    ellipse(c,-10,-24,1.6,1.3,active?"#f2d186":"#877a58");return;
  }
  if(kind==="oil"){
    shadow(c,31,8);block(c,-28,2,44,13,3,"#bcb38c","#8b8d71","#596e5b");
    // Derrick cross-bracing, wellhead, pipes, storage tank and moving pump beam.
    for(const x of [-18,0])stroke(c,[[x,-3],[-9,-52]],"#b6b697",2);
    for(const y of [-12,-23,-34,-43]){
      const w=9*(y+52)/49;stroke(c,[[-9-w,y],[-9+w,y]],"#7f9986",1.3);
      stroke(c,[[-9-w,y],[-9+w*.7,y-9],[-9+w,y]],"#8da58c",.8);
    }
    rect(c,-13,-55,8,4,"#d9bb78");ellipse(c,-9,-57,1,1,active?"#e7b46f":"#927a59");
    block(c,-15,-1,11,4,6,"#b3a872","#827349","#5a6348");
    stroke(c,[[-8,-4],[12,-4],[12,-11]],"#7a9e8d",2);
    block(c,12,-1,12,5,16,"#a8bcb0","#7e9b8e","#516e65");
    ellipse(c,20,-19,7,2,"#d0d3b3");stroke(c,[[13,-8],[24,-8]],"#bac8ac",1);
    c.save();c.translate(0,-20);c.rotate(active?Math.sin(t/700)*.16:0);
    shape(c,[[-8,-2],[18,-2],[21,5],[15,7],[14,1],[-8,1]],"#d4b166");stroke(c,[[17,6],[17,15]],"#9bb4a3",.8);c.restore();
    stroke(c,[[0,-4],[3,-22],[9,-4]],"#658877",2);return;
  }
  if(kind==="mech"){
    shadow(c,22,6);const w=p.walking?Math.sin(t/190)*3:0;
    for(const [x,d]of [[-10,w],[10,-w]]){
      stroke(c,[[x*.6,-25],[x,-13],[x+d,-3]],"#557b78",6);
      block(c,x-5+d,0,8,3,4,"#abcac1","#557c79","#355d60");
      block(c,x-3,-12,6,2,8,"#a6c1b3","#5b8b81","#3d6160");
      ellipse(c,x,-17,2.5,2.5,"#8bd8cb");
    }
    block(c,-12,-24,22,7,16,"#b3cbb9","#5e9088","#385f64");
    shape(c,[[-6,-40],[7,-41],[11,-34],[1,-30],[-8,-34]],"#b7d9c8");
    stroke(c,[[-4,-36],[5,-36]],"#70e5d7",2);
    block(c,-21,-23,8,4,13,"#a8beab","#688a75","#3f6660");
    block(c,14,-21,6,4,15,"#a8beab","#688a75","#3f6660");
    stroke(c,[[17,-23],[22,-12]],"#607f76",4);ellipse(c,23,-11,3,2,"#91ded1");
    stroke(c,[[-15,-37],[-18,-48]],"#9bbab0",1);return;
  }
  if(kind==="fusion"){
    shadow(c,33,9);block(c,-28,3,42,16,7,"#b9cfc1","#6a9687","#416966");
    ellipse(c,0,-22,23,12,"#315f61");ellipse(c,0,-25,23,12,"#abcaba");ellipse(c,0,-25,17,8,"#356f72");ellipse(c,0,-25,12,5,active?"#8ee5d3":"#597e75");
    for(let i=0;i<8;i++){const a=i*TAU/8;block(c,Math.cos(a)*22-2,-23+Math.sin(a)*10,4,2,8,"#d4dfbf","#769f8c","#467672");}
    block(c,-5,-24,8,3,19,"#bfd6bf","#629b91","#3c6e70");
    ellipse(c,0,-45,4,2,active?"#aff4dd":"#75968a");
    for(let i=0;i<3&&active;i++){const y=-45-((t/90+i*5)%15);ellipse(c,Math.sin(i*3)*3,y,.7,.7,"#adf0d6");}return;
  }
  if(kind==="satellite"){
    shadow(c,22,5);c.save();c.translate(0,-20+Math.sin(t/700));
    for(const x of [-29,10]){
      shape(c,[[x,-15],[x+18,-19],[x+22,-4],[x+4,0]],"#345e83");
      for(let i=1;i<4;i++)stroke(c,[[x+i*4.5,-15-i],[x+4+i*4.5,-i]],"#8fc1cb",.6);
      stroke(c,[[x+2,-8],[x+20,-12]],"#8fc1cb",.6);
    }
    block(c,-7,-6,12,7,15,"#e3c885","#a68f54","#796f45");
    shape(c,[[-5,-22],[6,-25],[11,-17],[0,-14]],"#e8dfb7");
    ellipse(c,8,-10,5,7,"#bad3c2",-.5);stroke(c,[[8,-10],[15,-15]],"#d8e9d2",1);ellipse(c,15,-15,1,1,"#83d9c6");
    c.restore();return;
  }
  // Orbital launch pad and reusable launch vehicle, kept visual-only.
  shadow(c,31,8);block(c,-28,3,43,14,5,"#b2c8b5","#62877c","#3d6660");
  block(c,-21,-2,6,5,62,"#a6bca8","#658b7e","#365d59");
  for(let i=0;i<6;i++)stroke(c,[[-21,-7-i*9],[-15,-15-i*9],[-21,-15-i*9]],"#c8d8b7",.6);
  shape(c,[[-7,-3],[-7,-46],[-3,-59],[1,-65],[5,-57],[9,-45],[9,-3]],"#e2e3cd");
  shape(c,[[4,-60],[9,-45],[9,-3],[4,-3]],"#97b8a9","",0);
  rect(c,-7,-26,16,5,"#547d7b");rect(c,-3,-40,4,6,"#3e787e");
  shape(c,[[-7,-18],[-14,-4],[-7,-6]],"#b1c8b6");shape(c,[[9,-18],[15,-4],[9,-6]],"#6c978a");
  stroke(c,[[-15,-44],[-7,-44]],"#b6cbb7",2);
  if(active)ellipse(c,1,-3,4,1,"#8fe1c3");
}
export function drawFutureArt(c:C,kind:FutureArt,x:number,y:number,scale:number,pose:ActorPose={}){
  local(c,x,y,scale,pose,()=>vehicle(c,kind,pose));
}

/* ---------- eras 7–9: mages, golem, spirit beasts and the spirit-wood carrier ---------- */
export type MagicArt = "firemage" | "watermage" | "golem" | "spiritdeer" | "dragon" | "tortoise" | "phoenix" | "treant";
export const MAGIC_ART: readonly MagicArt[] = ["firemage", "watermage", "golem", "spiritdeer", "dragon", "tortoise", "phoenix", "treant"];
/** Height above the feet at which flying beasts are drawn; shadows stay on the ground. */
export const FLIGHT_HEIGHT: Partial<Record<MagicArt, number>> = { dragon: 30, phoenix: 34 };
function glowDot(c: C, x: number, y: number, r: number, color: string, alpha = 1) {
  if (alpha <= 0 || r <= 0) return;
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color); g.addColorStop(1, color.slice(0, 7) + "00");
  c.save(); c.globalAlpha *= Math.min(1, alpha); c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); c.restore();
}
const MAGE = {
  firemage: { robe: "#a3412f", dark: "#6e2820", trim: "#e8b75a", glow: "#ffa64a", core: "#fff0b8" },
  watermage: { robe: "#2f6c8c", dark: "#1f4a60", trim: "#c4e6df", glow: "#7fd8ff", core: "#effcff" },
} as const;
function mageArt(c: C, kind: "firemage" | "watermage", p: ActorPose) {
  const e = MAGE[kind], time = p.time ?? 0, ph = time / 150 + (p.seed ?? 0) * 10, still = p.still;
  const step = p.walking ? Math.sin(ph) * 2.2 : 0, bob = p.walking ? Math.abs(Math.sin(ph)) * .6 : still ? 0 : Math.sin(time / 700) * .2;
  const swing = p.fighting ? Math.max(0, Math.sin(time / 160 + (p.seed ?? 0) * 8)) : 0, cast = p.casting ? 1 : 0;
  shadow(c, 6.5, 2.5);
  if (cast) {
    // Rune circle under the caster.
    c.save(); c.strokeStyle = e.glow; c.globalAlpha = .75; c.lineWidth = .9; c.beginPath(); c.ellipse(0, 0, 11, 4.2, 0, 0, TAU); c.stroke();
    for (let i = 0; i < 6; i++) { const a = i * TAU / 6 + (still ? 0 : time / 700); stroke(c, [[Math.cos(a) * 11, Math.sin(a) * 4.2 - 1], [Math.cos(a) * 11, Math.sin(a) * 4.2 + 1]], e.core, .8); }
    c.restore();
  }
  c.save(); c.translate(0, -bob);
  for (const [x, d] of [[-2, -step], [2, step]]) shape(c, [[x + d - 1.3, -1.8], [x + d + 1.4, -1.8], [x + d + 2.1, .4], [x + d - 1.3, .4]], "#3a2f28");
  // Long robe with a flared hem, shaded far side, sash and a chest rune.
  shape(c, [[-4, -18], [2.6, -18], [4.4, -9], [6, -1.4], [-5.8, -1.4], [-4.6, -9]], p.hurt ? "#d0705c" : e.robe);
  shape(c, [[-4, -18], [-1.6, -18], [-2.2, -1.4], [-5.8, -1.4], [-4.6, -9]], "rgba(18,26,34,.3)", "", 0);
  stroke(c, [[-5.6, -2], [5.8, -2]], e.trim, 1);
  stroke(c, [[1.2, -17.5], [1.8, -2.3]], e.trim, .6);
  rect(c, -4.4, -11.5, 8.4, 1.4, e.trim);
  shape(c, [[-.3, -16], [.8, -14.6], [-.3, -13.2], [-1.4, -14.6]], e.core, "", 0);
  glowDot(c, -.3, -14.6, 3, e.glow + "cc", still ? .5 : .5 + .3 * Math.sin(time / 300));
  shape(c, [[-4.6, -18.6], [3.2, -18.6], [4.2, -15.2], [-5, -15.2]], e.dark);
  ellipse(c, .2, -21, 2.9, 3.5, "#d8ac7f");
  shape(c, [[1, -22], [3, -22], [3.9, -20], [2.5, -19.5]], "#d8ac7f", "", 0);
  stroke(c, [[2.6, -21.2], [3.1, -21.2]], "#34362c", .7);
  if (kind === "firemage") {
    // Tall pointed hat with a wide brim and a short ember-coloured beard.
    shape(c, [[-5.4, -22.6], [5.4, -22.8], [3.3, -21.4], [-3.4, -21.4]], e.dark);
    shape(c, [[-3.2, -22.6], [3.3, -22.7], [-.6 + swing * .8, -32]], e.robe);
    stroke(c, [[-3, -23.4], [3.1, -23.5]], e.trim, .8);
    shape(c, [[.6, -19.4], [3.2, -19.6], [2, -16.4]], "#e0d6c0", "", 0);
  } else {
    // Hood folded back over the shoulders, with a pale river-shell clasp.
    shape(c, [[-3.8, -18.6], [-4.3, -23], [-1.2, -26.2], [3, -25.4], [3.9, -22.4], [2, -22.6], [-1.6, -23.6], [-2, -18.8]], e.robe);
    stroke(c, [[-1.2, -26], [3, -25.2]], e.trim, .6);
    ellipse(c, 2.6, -18, 1, .8, e.core);
  }
  // Far arm, then the staff hand: idle low, thrust forward when attacking, raised when casting.
  stroke(c, [[-3, -17], [-5, -13], [-3, -11]], e.dark, 2.6); ellipse(c, -3, -11, 1.2, 1.1, "#d8ac7f");
  const hx = cast ? 6.5 : 6 + swing * 3, hy = cast ? -20 : -12.5 - swing * 3;
  const top: Pt = [hx + 1.2, hy - 13 + cast * 2], foot: Pt = [hx - 1, hy + 11 - cast * 4];
  stroke(c, [foot, top], "#6f4f33", 1.5);
  stroke(c, [[top[0] - 1.5, top[1] + 1.5], [top[0] + 1.5, top[1] - .5]], e.trim, .7);
  const power = .55 + swing * .5 + cast * .6, flick = still ? 0 : Math.sin(time / 90 + (p.seed ?? 0) * 4);
  glowDot(c, top[0], top[1] - 2, 5 + power * 4, e.glow + "dd", power);
  if (kind === "firemage") {
    shape(c, [[top[0] - 2, top[1]], [top[0] + flick * .7, top[1] - 6 - power * 2], [top[0] + 2, top[1]], [top[0], top[1] + 1.2]], "#f0722e", "", 0);
    shape(c, [[top[0] - 1, top[1]], [top[0] + flick * .4, top[1] - 3.8 - power], [top[0] + 1, top[1]]], e.core, "", 0);
  } else {
    ellipse(c, top[0], top[1] - 2.2, 2.3, 2.6, "#59b9dc");
    ellipse(c, top[0] - .6, top[1] - 3, .8, .9, e.core);
    if (power > .9) for (let i = 0; i < 3; i++) { const a = i * TAU / 3 + (still ? 0 : time / 260); ellipse(c, top[0] + Math.cos(a) * 4.5, top[1] - 2 + Math.sin(a) * 2, .8, .8, e.core); }
  }
  stroke(c, [[3, -17], [5, -14.5], [hx, hy]], p.hurt ? "#d0705c" : e.robe, 2.8); ellipse(c, hx, hy, 1.3, 1.3, "#d8ac7f");
  c.restore();
}
const STONE = { top: "#b9b4a2", front: "#8f8b7c", side: "#6d6b60", moss: "#6f8f4f", rune: "#f2bd5c" };
function golemArt(c: C, p: ActorPose) {
  const t = p.time ?? 0, ph = t / 260 + (p.seed ?? 0) * 7, w = p.walking ? Math.sin(ph) : 0, still = p.still;
  const slam = p.fighting ? Math.max(0, Math.sin(t / 240 + (p.seed ?? 0) * 3)) : 0;
  const top = p.hurt ? "#d4a491" : STONE.top, front = p.hurt ? "#a8786a" : STONE.front;
  shadow(c, 13, 3.8);
  c.save(); c.translate(0, -(p.walking ? Math.abs(w) * .9 : 0));
  // Stacked river boulders, held together by glowing seams of earth light.
  block(c, -8 + w * 1.6, 0, 5.5, 3, 10, top, front, STONE.side);
  block(c, 2 - w * 1.6, 0, 5.5, 3, 10, top, front, STONE.side);
  stroke(c, [[-11, -21], [-14, -14 + slam * 2], [-13, -7 + slam * 2]], STONE.side, 4);
  ellipse(c, -13, -6 + slam * 2, 3.2, 2.8, STONE.side);
  block(c, -8, -9, 14, 4, 3.5, top, front, STONE.side);
  block(c, -10, -12, 17, 5, 13, top, front, STONE.side);
  stroke(c, [[-8, -21], [-5, -17], [-1, -19], [2, -15], [6, -18]], STONE.rune, .9);
  stroke(c, [[-6, -14], [-2, -15], [1, -13]], STONE.rune, .7);
  glowDot(c, -1, -18, 4.5, STONE.rune + "cc", still ? .55 : .5 + .3 * Math.sin(t / 420));
  shape(c, [[-10, -25], [-6, -25.5], [-4, -24], [-9, -23.5]], STONE.moss, "", 0);
  block(c, -3.5, -25, 7, 3.5, 5, top, front, STONE.side);
  rect(c, .8, -22.5, 1.6, 1.1, STONE.rune); rect(c, -2.2, -22.5, 1.4, 1.1, STONE.rune);
  // Near arm: hangs, then rises and slams on the authoritative attack flag.
  const a = -1.2 + slam * -1.4 + (1 - slam) * 1.25, sx = 8, sy = -21, ex = sx + Math.cos(a) * 7, ey = sy + Math.sin(a) * 7;
  stroke(c, [[sx, sy], [ex, ey]], front, 4.4);
  const fx = ex + Math.cos(a + .5) * 5, fy = ey + Math.sin(a + .5) * 5;
  stroke(c, [[ex, ey], [fx, fy]], front, 4);
  ellipse(c, fx, fy, 3.8, 3.3, top); stroke(c, [[fx - 2, fy], [fx + 1.5, fy - 1]], STONE.side, .6);
  if (slam > .92) for (const d of [-6, 0, 6]) stroke(c, [[fx + d, 1], [fx + d * 1.4, -2]], "#d8cdb0", .8);
  c.restore();
}
function spiritDeerArt(c: C, p: ActorPose) {
  const t = p.time ?? 0, ph = t / 130 + (p.seed ?? 0) * 11, walk = p.walking ? Math.sin(ph) : 0, still = p.still;
  const lunge = p.fighting ? Math.max(0, Math.sin(t / 180)) : 0, body = p.hurt ? "#e3b7a5" : "#d9ead9", shade = "#a9c8b8", glow = "#a6f3c8";
  shadow(c, 14, 3.5);
  if (!still) for (let i = 0; i < 4; i++) { const q = ((t / 1400 + i / 4 + (p.seed ?? 0)) % 1); glowDot(c, -14 - q * 8, -18 - q * 10, 2.5, glow + "aa", 1 - q); }
  for (const [x, d] of [[-9, walk], [6, -walk]]) stroke(c, [[x, -13], [x + d * 1.5, -6], [x + d * 2.4, 0]], shade, 1.8);
  ellipse(c, -2, -16, 11, 5.2, body); ellipse(c, -4, -18, 7, 2.6, "#f2faf0");
  for (const [x, d] of [[-7, -walk], [8, walk]]) { stroke(c, [[x, -13], [x + d * 1.5, -6], [x + d * 2.4, 0]], body, 2); ellipse(c, x + d * 2.4, 0, 1.4, .7, "#5c6a5f"); }
  for (const [x, y] of [[-6, -17], [-2, -15], [2, -17], [-9, -15]]) ellipse(c, x, y, .9, .7, glow);
  const hx = 11 + lunge * 3, hy = -27 + lunge * 6;
  shape(c, [[5, -19], [8, -26 + lunge * 4], [12 + lunge * 2, -27 + lunge * 6], [12, -20], [8, -16]], body);
  ellipse(c, hx + 1, hy + 1, 4, 2.6, body, .3);
  shape(c, [[hx + 3, hy], [hx + 7, hy + 2.4], [hx + 3, hy + 3]], "#c7dccf");
  ellipse(c, hx + 1.8, hy - .2, .7, .7, "#24403a");
  shape(c, [[hx - 2, hy - 2], [hx - 4, hy - 5], [hx - 1, hy - 3]], shade);
  // Branching antlers grow leaves and glow; brighter while charging.
  const g = lunge > .3 ? 1 : .6;
  for (const side of [-1, 1]) {
    const bx = hx + side * .8, by = hy - 2;
    curve(c, [bx, by], [bx - 4 + side, by - 6], [bx - 1 + side * 2, by - 11], "#e6d8a8", 1.1);
    stroke(c, [[bx - 2.4 + side, by - 5], [bx - 5 + side, by - 7]], "#e6d8a8", .8);
    stroke(c, [[bx - .8 + side * 1.5, by - 8.5], [bx + 2 + side, by - 10]], "#e6d8a8", .8);
    ellipse(c, bx - 1 + side * 2, by - 11.5, 1.4, .8, "#9fe09a", .5);
  }
  glowDot(c, hx - 1, hy - 8, 7, glow + "cc", still ? .45 : g * (.45 + .2 * Math.sin(t / 380)));
  curve(c, [-13, -18], [-16, -20], [-15, -15], body, 2);
}
function dragonArt(c: C, p: ActorPose) {
  const t = p.time ?? 0, still = p.still, alt = FLIGHT_HEIGHT.dragon! + (still ? 0 : Math.sin(t / 600 + (p.seed ?? 0) * 5) * 2.5);
  const roar = p.fighting ? Math.max(0, Math.sin(t / 200)) : 0, scale = p.hurt ? "#c98b72" : "#3f9a78", belly = "#e8dcae", fin = "#d8a64a";
  ellipse(c, -6, 1, 24, 4, "rgba(8,20,17,.17)");
  c.save(); c.translate(0, -alt);
  const n = 16, pts: Pt[] = [];
  for (let i = 0; i <= n; i++) { const s = i / n; pts.push([16 - s * 46, Math.sin(s * TAU * 1.15 - (still ? 0 : t / (p.walking ? 170 : 320))) * 5.5 * (.35 + s)]); }
  // Cloud wisps the beast swims through.
  for (const [x, y, r] of [[-26, 6, 5], [-12, 8, 4], [-34, 1, 4]] as const) ellipse(c, x, y, r * 1.6, r * .7, "rgba(236,244,238,.55)");
  for (let i = n; i > 0; i--) {
    const w = 1.5 + (1 - i / n) * 6.5, [x0, y0] = pts[i], [x1, y1] = pts[i - 1];
    stroke(c, [[x0, y0], [x1, y1]], scale, w);
    stroke(c, [[x0, y0 + w * .3], [x1, y1 + w * .3]], belly, w * .35);
    if (i % 2 === 0 && i < n) shape(c, [[x0, y0 - w * .45], [x0 - 2, y0 - w * .45 - 2.6], [x1, y1 - w * .45]], fin, "", 0);
  }
  const [tx, ty] = pts[n]; shape(c, [[tx, ty], [tx - 5, ty - 3], [tx - 3, ty + 1], [tx - 5, ty + 3]], fin);
  for (const k of [4, 10]) { const [lx, ly] = pts[k]; stroke(c, [[lx, ly + 2], [lx + 1.5, ly + 6], [lx + 3.5, ly + 6.5]], scale, 1.3); stroke(c, [[lx + 3.5, ly + 6.5], [lx + 4.5, ly + 5.6]], "#f3e9c6", .6); }
  const [hx, hy] = pts[0];
  // Long-snouted head with antler horns, flowing whiskers and a pearl of light.
  ellipse(c, hx + 2, hy - 1, 6, 3.6, scale, -.1);
  shape(c, [[hx + 5, hy - 2.6], [hx + 11, hy - 1.6 - roar], [hx + 11, hy + .4], [hx + 5, hy + 1]], scale);
  shape(c, [[hx + 5, hy + 1], [hx + 10.5, hy + 1 + roar * 2.4], [hx + 5, hy + 2.6]], belly);
  ellipse(c, hx + 4, hy - 2.4, .9, .8, "#fff2a8");
  for (const d of [0, 1.5]) curve(c, [hx - 1 + d, hy - 3], [hx - 4 + d, hy - 9], [hx - 7 + d, hy - 10], "#e3cf8c", .9);
  curve(c, [hx + 10, hy], [hx + 15, hy + 3], [hx + 12, hy + 8 + (still ? 0 : Math.sin(t / 240) * 1.5)], "#f0dc9c", .5);
  curve(c, [hx + 10, hy - 1], [hx + 14, hy - 4], [hx + 18, hy - 2], "#f0dc9c", .5);
  for (let i = 0; i < 4; i++) shape(c, [[hx - 2 - i * 1.6, hy - 2.8], [hx - 4 - i * 1.6, hy - 6], [hx - 3.5 - i * 1.6, hy - 1.5]], "#2c6f58", "", 0);
  if (roar > 0) glowDot(c, hx + 14, hy, 5 + roar * 5, "#b9f5ff", roar);
  c.restore();
}
function tortoiseArt(c: C, p: ActorPose) {
  const t = p.time ?? 0, walk = p.walking ? Math.sin(t / 330 + (p.seed ?? 0) * 5) : 0, still = p.still;
  const snap = p.fighting ? Math.max(0, Math.sin(t / 260)) : 0, shell = p.hurt ? "#7d5a4c" : "#36564e", rim = "#c9a557", skin = "#6f8f7d";
  shadow(c, 22, 6);
  for (const [x, d] of [[-14, walk], [8, -walk]]) { shape(c, [[x - 3, -8], [x + 3, -8], [x + 3.5 + d, 0], [x - 3 + d, 0]], darkSkin(skin)); }
  // Snake-like tail of the Black Tortoise.
  curve(c, [-20, -8], [-28, -6], [-26 + (still ? 0 : Math.sin(t / 500) * 2), -14], skin, 2.4);
  ellipse(c, -2, -9, 21, 6, "#4b5e52");
  shape(c, [[-21, -10], [-16, -21], [-6, -27], [6, -27], [15, -21], [18, -10]], shell);
  shape(c, [[-21, -10], [-16, -21], [-6, -27], [-4, -27], [-12, -18], [-15, -10]], "rgba(12,24,22,.28)", "", 0);
  stroke(c, [[-21, -10], [18, -10]], rim, 1.6);
  // Hexagon scutes carry faint protective runes.
  for (const [x, y] of [[-8, -19], [2, -21], [11, -16], [-15, -14], [-1, -14], [8, -12.5]] as const) {
    const pts: Pt[] = Array.from({ length: 6 }, (_, i) => [x + Math.cos(i * TAU / 6) * 3.6, y + Math.sin(i * TAU / 6) * 2.4] as Pt);
    shape(c, pts, "#476f63", "#2a4640", .6);
  }
  const lit = still ? .5 : .45 + .25 * Math.sin(t / 700);
  glowDot(c, 2, -21, 9, "#8ee0d0aa", lit); stroke(c, [[0, -22], [2, -19.5], [4, -22]], "#a8efe0", .7);
  const hx = 21 + snap * 4, hy = -11 - snap * 1.5;
  stroke(c, [[15, -11], [hx - 2, hy]], skin, 4.6);
  ellipse(c, hx, hy, 4.2, 3.1, skin);
  shape(c, [[hx + 2, hy + .5], [hx + 5 + snap, hy + 1 + snap], [hx + 2, hy + 2]], "#4d6b5a");
  ellipse(c, hx + 1.3, hy - 1, .8, .8, "#f0d86a");
  for (const [x, d] of [[-10, -walk], [12, walk]]) { shape(c, [[x - 3.5, -9], [x + 3.5, -9], [x + 4 + d, 0], [x - 3.5 + d, 0]], skin); for (const o of [-2, 0, 2]) rect(c, x + d + o - .4, -1.2, .8, 1.2, "#d9d0b0"); }
}
function darkSkin(hex: string) { return hex === "#6f8f7d" ? "#56705f" : hex; }
function phoenixArt(c: C, p: ActorPose) {
  const t = p.time ?? 0, still = p.still, alt = FLIGHT_HEIGHT.phoenix! + (still ? 0 : Math.sin(t / 520 + (p.seed ?? 0) * 3) * 3);
  const flap = still ? .3 : Math.sin(t / (p.walking ? 120 : 190)), spread = p.fighting || p.casting ? 1 : 0;
  const body = p.hurt ? "#f0a090" : "#d8452f", gold = "#f2c35a", flame = "#ff8a3a";
  ellipse(c, -4, 1, 16, 3.2, "rgba(8,20,17,.16)");
  c.save(); c.translate(0, -alt);
  if (p.casting) glowDot(c, 0, 0, 22, "#ffd88acc", .55);
  // Streaming flame tail feathers, flickering behind the body.
  for (let i = 0; i < 5; i++) {
    const wave = still ? 0 : Math.sin(t / 150 + i * 1.3) * 2, end: Pt = [-24 - i * 3, 4 + i * 2.4 + wave];
    curve(c, [-6, 0], [-14 - i * 2, -1 + i * 1.5 + wave * .5], end, i % 2 ? gold : flame, 2.2 - i * .25);
    glowDot(c, end[0], end[1], 3.2, "#ffd27acc", .7);
  }
  // Far wing, body, crest and near wing.
  const wy = -8 - flap * 9 - spread * 3;
  shape(c, [[-2, -3], [-9, wy - 2], [-16, wy + 2], [-6, 0]], "#a8321f");
  ellipse(c, -1, -1, 8, 3.8, body, -.15);
  ellipse(c, 0, 0, 5, 2.2, gold, -.15);
  stroke(c, [[5, -3], [8, -7]], body, 2.8);
  ellipse(c, 9, -8, 2.6, 2.2, body);
  shape(c, [[11, -8.4], [14.5, -7.4], [11, -6.8]], gold);
  ellipse(c, 9.6, -8.6, .6, .6, "#2a1c16");
  for (let i = 0; i < 3; i++) curve(c, [8, -10], [6 - i * 1.5, -14 - i], [4 - i * 2.5, -13 - i * 2], i ? gold : flame, .9);
  const ny = -6 - flap * 10 - spread * 5;
  shape(c, [[0, -2], [4, ny - 4], [-3, ny - 6], [-12, ny], [-6, 0]], flame);
  for (let i = 0; i < 4; i++) stroke(c, [[-1 - i * 2.5, -1 - i * .3], [1 - i * 3, ny - 3 + i * 1.2]], gold, .8);
  if (p.fighting) glowDot(c, 15, -7, 6, "#ffe6a0dd", .9);
  c.restore();
}
function treantArt(c: C, p: ActorPose) {
  const t = p.time ?? 0, ph = t / 210 + (p.seed ?? 0) * 9, walk = p.walking ? Math.sin(ph) : 0, still = p.still;
  const bark = p.hurt ? "#a56b56" : "#7a5634", barkDark = "#5b3f27", leaf = "#5e9a48", glow = "#b8f27a";
  shadow(c, 8, 2.6);
  c.save(); c.translate(0, -(p.walking ? Math.abs(walk) * .6 : 0));
  // Root legs splay and shuffle; the trunk body sways a little.
  for (const [x, d] of [[-3, -walk], [3, walk]]) { curve(c, [x * .6, -8], [x + d * 2, -4], [x + d * 3, 0], barkDark, 2.4); stroke(c, [[x + d * 3, 0], [x + d * 3 + 2, .5]], barkDark, 1.2); }
  shape(c, [[-4, -9], [4, -9], [3, -21], [-3, -21]], bark);
  shape(c, [[-4, -9], [-1.5, -9], [-1.2, -21], [-3, -21]], barkDark, "", 0);
  for (const y of [-12, -16]) stroke(c, [[-2.5, y], [2, y - 1]], "#9b7448", .6);
  ellipse(c, -.5, -16, 1, 1.3, "#2f2418"); ellipse(c, 1.8, -16.2, .8, 1.1, "#2f2418");
  glowDot(c, .6, -16, 3, glow + "bb", still ? .4 : .4 + .2 * Math.sin(t / 400));
  for (const [x, y, r] of [[-4, -24, 5], [3, -25, 5.5], [0, -29, 5], [-6, -27, 3.5], [6, -28, 3.5]] as const) ellipse(c, x, y, r, r * .85, leaf);
  for (const [x, y] of [[-3, -27], [3, -29], [1, -24]] as const) ellipse(c, x, y, 1.6, 1.2, "#86c25e");
  if (!still) for (let i = 0; i < 3; i++) { const q = (t / 1600 + i / 3) % 1; glowDot(c, -6 + i * 6, -30 - q * 8, 1.8, glow + "cc", 1 - q); }
  // Branch arms carry a bundle while delivering to a spell buffer.
  stroke(c, [[-3, -18], [-7, -14], [-6, -11]], bark, 1.8);
  if (p.active) {
    block(c, 2, -9, 8, 3, 6, "#c4a06a", "#8c6a40", "#6a4f30");
    stroke(c, [[2, -12], [10, -12]], "#e4cf98", .5);
    stroke(c, [[3, -18], [6, -16], [5, -14]], bark, 1.8);
  } else stroke(c, [[3, -18], [7, -15], [8, -11]], bark, 1.8);
  c.restore();
}
export function drawMagicArt(c: C, kind: MagicArt, x: number, y: number, scale: number, pose: ActorPose = {}) {
  local(c, x, y, scale, pose, () => {
    if (kind === "firemage" || kind === "watermage") mageArt(c, kind, pose);
    else if (kind === "golem") golemArt(c, pose);
    else if (kind === "spiritdeer") spiritDeerArt(c, pose);
    else if (kind === "dragon") dragonArt(c, pose);
    else if (kind === "tortoise") tortoiseArt(c, pose);
    else if (kind === "phoenix") phoenixArt(c, pose);
    else treantArt(c, pose);
  });
}
export const isMagicArt = (k: string): k is MagicArt => (MAGIC_ART as readonly string[]).includes(k);
