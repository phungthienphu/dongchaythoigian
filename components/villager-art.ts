/** Shared, outline-free villager artwork. Coordinates are anchored at the feet. */
export type VillagerArtPose = {
  time:number; seed:number; face:1|-1; era:number; job:string;
  walking:boolean; running:boolean; working:boolean; swing:number;
  carrying:boolean; resource:string|null; skin:string; shirt:string; band:string;
};
const poly=(c:CanvasRenderingContext2D,p:number[][],color:string)=>{c.fillStyle=color;c.beginPath();p.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.fill();};
const oval=(c:CanvasRenderingContext2D,x:number,y:number,rx:number,ry:number,color:string)=>{c.fillStyle=color;c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);c.fill();};
const line=(c:CanvasRenderingContext2D,p:number[][],color:string,w:number)=>{c.strokeStyle=color;c.lineWidth=w;c.lineCap='round';c.beginPath();p.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.stroke();};
export function drawVillagerArt(c:CanvasRenderingContext2D,x:number,y:number,scale:number,p:VillagerArtPose){
 c.save();c.translate(x,y);c.scale(scale*p.face,scale);
 const work=p.working&&!p.walking&&!p.carrying;
 const phase=p.time/(p.running?78:145)+p.seed*10;
 const stride=p.walking?Math.sin(phase)*(p.running?4.3:2.8):0;
 const bob=p.walking?Math.abs(Math.cos(phase))*.7:Math.sin(p.time/650+p.seed*8)*.12;
 const cycle=(Math.sin(p.time/280+p.seed*9)+1)/2;
 const bend=work&&(p.job==='farm'||p.job==='gather')?cycle*2:0;
 const lean=p.running?2:p.carrying?1:0;
 oval(c,0,0,4.5,1.5,'#152b242d');c.translate(0,-bob);
 // Jointed trousers, cuffs and shoes; rear limb is shaded.
 for(const side of [-1,1]){
  const foot=side*stride, hip=side*1.3;
  line(c,[[hip,-7],[hip+foot*.5,-3.6],[hip+foot,0]],side<0?'#3d5154':'#53686a',2.3);
  oval(c,hip+foot+.6,-.1,1.65,.7,side<0?'#5d4835':'#795c40');
 }
 const hx=lean+bend*.65, hy=-19+bend;
 if(p.job==='explore') {oval(c,-3+lean,-11,2.6,4,'#826c45');line(c,[[-4,-13],[-1,-13]],'#bcaa76',.6);}
 // Sleeved tunic with a lit shoulder and shaded side panel.
 poly(c,[[-3,-7],[3,-7],[hx+2.7,-15+bend*.6],[hx-2.6,-15+bend*.6]],p.shirt);
 poly(c,[[-3,-7],[-1.6,-7],[hx-1.2,-15+bend*.6],[hx-2.6,-15+bend*.6]],'#203d443b');
 line(c,[[hx-1.4,-14+bend*.6],[hx+.2,-12+bend*.6]],'#ffffff38',.65);
 const industrial=p.era>=5&&['smith','quarry','build','wood'].includes(p.job);
 if(['smith','build'].includes(p.job)){
  poly(c,[[-1.8,-13],[1.8,-13],[2.3,-6.7],[-2.2,-6.7]],industrial?'#426b82':'#9a7151');
  line(c,[[-1.3,-14],[-1.3,-10],[1.2,-10],[1.2,-14]],industrial?'#b8cfbe':'#d0ab77',.65);
  poly(c,[[-1.2,-9],[1.3,-9],[1.3,-7.5],[-1.2,-7.5]],'#233f493f');
 }
 if(industrial){line(c,[[hx-2,-14],[hx-2,-9]],'#ecd18a',.9);line(c,[[hx+2,-14],[hx+2,-9]],'#ecd18a',.9);}
 line(c,[[-2.6,-7],[2.6,-7]],p.band,.85);
 // Back arm, then the face and headwear.
 const armSwing=p.walking?-stride*.7:.4;
 line(c,[[hx-2,-14+bend*.6],[-3+armSwing,-10],[-2+armSwing,-8]],p.skin,1.5);
 oval(c,hx,hy+2,1,1.6,p.skin);oval(c,hx,hy,2.5,2.9,p.skin);
 oval(c,hx+2.15,hy+.35,.85,.8,p.skin);
 poly(c,[[hx-2.5,hy],[hx-2.4,hy-2],[hx-.6,hy-3],[hx+1.9,hy-2.3],[hx+2,hy-1],[hx-.8,hy-1.7],[hx-1.6,hy+.6]],'#493a2e');
 oval(c,hx+1.25,hy-.1,.25,.32,'#493c34');oval(c,hx+1.25,hy+1.1,.65,.35,'#ce896d66');
 if(['farm','gather'].includes(p.job)){
  oval(c,hx,hy-1,5,.8,'#b99658');
  poly(c,[[hx-4.8,hy-1.2],[hx-.5,hy-5.8],[hx+4.8,hy-1.2]],'#e6cc8c');
  poly(c,[[hx-.5,hy-5.8],[hx+4.8,hy-1.2],[hx+.8,hy-1.2]],'#c9ac68');
  line(c,[[hx-2.5,hy-1.6],[hx+.3,hy-1.6]],'#f4dea6',.45);
 }else if(industrial){
  oval(c,hx,hy-2.2,2.9,1.8,'#ddb657');line(c,[[hx-3.1,hy-1],[hx+3.3,hy-1]],'#efcc71',1.2);
  line(c,[[hx-.4,hy-3.6],[hx-.4,hy-2.1]],'#f8dd92',.7);
 }else if(p.job==='explore'||p.era>=4){
  oval(c,hx,hy-2.3,2.7,1.2,p.band);line(c,[[hx-2.5,hy-1.5],[hx+3,hy-1.5]],p.band,1);
 }else line(c,[[hx-2.4,hy-1.5],[hx+2.1,hy-1.5]],p.band,.8);
 let handX=3+armSwing,handY=-8;
 if(p.carrying&&p.resource){
  handX=4;handY=-10;
  // Goods remain visible even when a warehouse is full and the carrier waits.
  poly(c,[[1,-12],[7,-12],[6.6,-8],[1.5,-8]],'#ad8350');
  line(c,[[1,-11],[7,-11]],'#dfbd7c',.55);
  const colors:Record<string,string>={stone:'#aab6b2',coal:'#465458',copper:'#c58657',gold:'#e7c56a',diamond:'#b2e3df',food:'#b4c66b',wood:'#976b43'};
  for(let i=0;i<3;i++)poly(c,[[1.4+i*1.6,-12],[2+i*1.6,-14-i%2],[3+i*1.6,-13.3],[3+i*1.6,-11.8]],colors[p.resource]??'#bdac7e');
  if(p.resource==='wood')line(c,[[1,-13],[7,-15]],'#d0a672',1.4);
 }else if(work&&['wood','quarry','smith','build'].includes(p.job)){
  const a=-1.5+p.swing*2.5;
  handX=hx+2+Math.cos(a)*3;handY=-13+Math.sin(a)*3;
  const tx=handX+Math.cos(a)*5,ty=handY+Math.sin(a)*5;
  line(c,[[handX-Math.cos(a),handY-Math.sin(a)],[tx,ty]],'#a58053',1);
  c.save();c.translate(tx,ty);c.rotate(a);
  if(p.job==='quarry')line(c,[[0,-3],[1,-1],[0,3]],'#a9bec2',1);
  else poly(c,[[-1,-2],[1.7,-2.3],[2.2,1.4],[-1,1.5]],p.job==='wood'?'#b9c9c3':'#80969d');
  c.restore();
 }else if(work&&p.job==='farm'){
  handX=4+cycle;handY=-11+cycle*2;
  line(c,[[handX-2,handY-4],[7+cycle*2,-1]],'#a78756',1);
  poly(c,[[6+cycle*2,-2],[10+cycle*2,-1],[9+cycle*2,.2],[6+cycle*2,-.7]],'#91a9a8');
  line(c,[[hx-1,-13],[1,-10],[handX-1,handY-1]],p.skin,1.5);
 }else if(work&&p.job==='gather'){
  handX=5;handY=-5-cycle*3;oval(c,handX,handY,.8,.7,'#bc775b');
  oval(c,-4,-2,2.6,1.7,'#b38c55');line(c,[[-6,-2],[-5,-5],[-3,-5],[-2,-2]],'#d3ae72',.6);
 }else if(p.job==='hunt'){
  const thrown=work&&p.swing>.4;handX=thrown?6:3;handY=thrown?-14:-17;
  if(!thrown){line(c,[[-3,-16],[9,-20]],'#a1885b',.9);poly(c,[[9,-20],[12,-21.2],[10,-18.7]],'#c1ccc0');}
 }else if(p.job==='explore'){
  handX=4;handY=-11;line(c,[[4,-16],[5+stride*.2,0]],'#b39a6b',1);
 }else if(work&&p.job==='trade'){
  handX=4;handY=-12;poly(c,[[1,-13],[6,-12],[5,-9],[1,-10]],'#e0d3ab');line(c,[[2,-12],[4,-11.5]],'#95876b',.4);
 }else if(work&&p.job==='other'){handX=4;handY=-12+cycle;}
 line(c,[[hx+2,-14+bend*.6],[hx+2.5,-11+bend],[handX,handY]],p.skin,1.65);
 oval(c,handX,handY,.85,.85,p.skin);
 c.restore();
}
