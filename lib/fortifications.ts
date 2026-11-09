import type {Building,City} from './engine';

export type DefenseOrientation='auto'|'x'|'y';
export type DefensePreview={tile:number;building:Building};
type Village=Pick<City,'b'>;
export const WALL_N=1,WALL_E=2,WALL_S=4,WALL_W=8;
const SIDE=96;
const DIRECTIONS=[[0,-1,WALL_N,WALL_S],[1,0,WALL_E,WALL_W],[0,1,WALL_S,WALL_N],[-1,0,WALL_W,WALL_E]] as const;
const at=(c:Village,tile:number,preview?:DefensePreview)=>preview?.tile===tile?preview.building:c.b[tile];
export const isFortification=(b:Building|undefined)=>!!b&&(b.k==='wall'||b.k==='gate');
const linkable=(b:Building|undefined)=>isFortification(b)&&!b!.burned;
const axisPorts=(axis:'x'|'y')=>axis==='x'?WALL_E|WALL_W:WALL_N|WALL_S;

/** Old saves infer their gate axis from nearby fortifications. Explicit choices win. */
export function defenseAxis(c:Village,tile:number,preview?:DefensePreview):'x'|'y'{
 const b=at(c,tile,preview);if(b?.orientation==='x'||b?.orientation==='y')return b.orientation;
 const x=tile%SIDE,y=Math.floor(tile/SIDE);let horizontal=0,vertical=0;
 for(const [dx,dy,,opposite]of DIRECTIONS){
  if(x+dx<0||x+dx>=SIDE||y+dy<0||y+dy>=SIDE)continue;
  const neighbor=at(c,(y+dy)*SIDE+x+dx,preview);if(!linkable(neighbor))continue;
  if(neighbor!.orientation&&!(axisPorts(neighbor!.orientation)&opposite))continue;
  if(dx)horizontal++;else vertical++;
 }
 return vertical>horizontal?'y':'x';
}
function ports(c:Village,tile:number,b:Building,preview?:DefensePreview){
 return b.k==='gate'||b.orientation?axisPorts(defenseAxis(c,tile,preview)):15;
}
/** Four local lookups; no map scan, cache or simulation tick needed. */
export function wallConnections(c:Village,tile:number,preview?:DefensePreview){
 const b=at(c,tile,preview);if(!linkable(b))return 0;
 const x=tile%SIDE,y=Math.floor(tile/SIDE),allowed=ports(c,tile,b!,preview);let mask=0;
 for(const [dx,dy,bit,opposite]of DIRECTIONS){
  if(!(allowed&bit)||x+dx<0||x+dx>=SIDE||y+dy<0||y+dy>=SIDE)continue;
  const next=(y+dy)*SIDE+x+dx,neighbor=at(c,next,preview);
  if(linkable(neighbor)&&(ports(c,next,neighbor!,preview)&opposite))mask|=bit;
 }
 return mask;
}
export function wallMask(c:Village,tile:number,preview?:DefensePreview){
 const b=at(c,tile,preview);
 return b?.orientation?axisPorts(b.orientation):wallConnections(c,tile,preview)||axisPorts('x');
}
export type WallRect=[number,number,number,number];
/** Non-overlapping arms share their central pier, for drawing and mouse picking. */
export function wallFootprints(mask:number,width=.12):WallRect[]{
 const rects:WallRect[]=[[-width,-width,width,width]];
 if(mask&WALL_N)rects.push([-width,-.5,width,-width]);
 if(mask&WALL_E)rects.push([width,-width,.5,width]);
 if(mask&WALL_S)rects.push([-width,width,width,.5]);
 if(mask&WALL_W)rects.push([-.5,-width,-width,width]);
 return rects;
}
/** Clockwise boundary of the same union, avoiding internal faces at L/T/X joins. */
export function wallOutline(mask:number,width=.12):[number,number][]{
 const out:[number,number][]=[[-width,-width]];
 if(mask&WALL_N)out.push([-width,-.5],[width,-.5]);
 out.push([width,-width]);
 if(mask&WALL_E)out.push([.5,-width],[.5,width]);
 out.push([width,width]);
 if(mask&WALL_S)out.push([width,.5],[-width,.5]);
 out.push([-width,width]);
 if(mask&WALL_W)out.push([-.5,width],[-.5,-width]);
 return out;
}
export function wallHeight(era:number,level:number){return era>=4?16+level*2:(era===1?14:18)*(1+.2*Math.max(0,level-1));}
