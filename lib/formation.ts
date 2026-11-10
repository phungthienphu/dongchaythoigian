type Actor = {id:string;x:number;y:number};

/** Bounded, deterministic guard slots connected to the clicked tile. Occupied
 * slots can be crossed, but are never assigned to another group. */
export function formationSlots(width:number,height:number,target:number,count:number,stand:(tile:number)=>boolean,traverse=stand,reserved:ReadonlySet<number>=new Set()):number[]|null {
  if(count<1||target<0||target>=width*height||!stand(target))return null;
  const radius=Math.min(40,Math.max(3,Math.ceil(Math.sqrt(count))*2)),cx=target%width,cy=Math.floor(target/width);
  const queue=[target],seen=new Set(queue),slots:number[]=[];
  for(let head=0;head<queue.length;head++){
    const tile=queue[head],x=tile%width,y=Math.floor(tile/width);
    if(stand(tile)&&!reserved.has(tile))slots.push(tile);
    for(const [dx,dy] of [[0,-1],[-1,0],[1,0],[0,1]]){
      const nx=x+dx,ny=y+dy,next=ny*width+nx;
      if(nx<0||nx>=width||ny<0||ny>=height||Math.abs(nx-cx)+Math.abs(ny-cy)>radius||seen.has(next)||!traverse(next))continue;
      seen.add(next);queue.push(next);
    }
    // BFS layers make the first count slots the nearest connected positions.
    if(slots.length===count)return slots;
  }
  return null;
}

/** Give each slot to its nearest remaining actor; ID breaks ties independently
 * of the order IDs arrived over the network. */
export function assignFormation(actors:Actor[],slots:number[],width:number):Map<string,number> {
  const remaining=new Map(actors.map(a=>[a.id,a])),assigned=new Map<string,number>();
  for(const tile of slots){
    const x=tile%width+.5,y=Math.floor(tile/width)+.5;
    let best:Actor|undefined,score=Infinity;
    for(const a of remaining.values()){
      const d=(a.x-x)**2+(a.y-y)**2;
      if(d<score||d===score&&a.id<(best?.id??a.id)){best=a;score=d;}
    }
    if(best){assigned.set(best.id,tile);remaining.delete(best.id);}
  }
  return assigned;
}
