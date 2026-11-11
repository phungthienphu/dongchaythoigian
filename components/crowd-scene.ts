import type {Villager} from './villagers';

export type CrowdGroup={key:string;members:Villager[];x:number;y:number;selected:number;carrying:number;left:number;top:number;width:number;height:number};
export type CrowdScene={actors:Villager[];groups:CrowdGroup[];active:Set<string>;units:number;signature:string;source:Villager[]};
type Point={actor:Villager;x:number;y:number};
type Projection={TW:number;TH:number;ox:number;oy:number;rotation?:number;width:number;height:number};
export const crowdViewKey=(v:Projection)=>[v.TW,v.TH,v.ox,v.oy,v.rotation??0,v.width,v.height].join(':');

/** Only presentation is reduced. The source list and every real person ID remain intact. */
export function planCrowd(points:Point[],view:Projection,picked:ReadonlySet<number>,focused:number|null,source:Villager[],previous?:CrowdScene|null):CrowdScene{
  let units=previous?.units??(view.TW<33?2:view.TW>90?.5:1);
  if(units===2&&view.TW>36)units=1;
  else if(units===.5&&view.TW<84)units=1;
  else if(units===1)units=view.TW<30?2:view.TW>96?.5:1;
  const buckets=new Map<string,Point[]>(),actors:Villager[]=[],groups:CrowdGroup[]=[],active=new Set<string>();
  for(const p of points){
    const a=p.actor;
    if(a.id===null||a.id===focused||a.fleeing||a.health&&(a.health.down||a.health.infected||a.health.hp<100)){actors.push(a);continue;}
    // Translation is removed so panning never changes membership. Pose/cargo
    // classes prevent a walking carrier being replaced by an idle empty worker.
    const key=`${view.rotation??0}:${units}:${Math.floor((p.x-view.ox)/(view.TW*units))}:${Math.floor((p.y-view.oy)/(view.TH*units))}:${a.job}:${a.state}:${a.moving}:${a.carrying?a.carry:'empty'}`;
    const bucket=buckets.get(key);if(bucket)bucket.push(p);else buckets.set(key,[p]);
  }
  for(const [key,bucket]of buckets){
    if(bucket.length<(previous?.active.has(key)?5:9)){actors.push(...bucket.map(p=>p.actor));continue;}
    active.add(key);
    // Three stable IDs represent the group, independent of array order.
    const representatives:Villager[]=[];let x=0,y=0,selected=0,carrying=0;
    for(const p of bucket){
      x+=p.x;y+=p.y;selected+=Number(picked.has(p.actor.id!));carrying+=Number(p.actor.carrying);
      representatives.push(p.actor);representatives.sort((a,b)=>a.id!-b.id!);if(representatives.length>3)representatives.pop();
    }
    actors.push(...representatives);
    const cx=x/bucket.length,cy=y/bucket.length;
    const anchor=bucket.filter(p=>representatives.includes(p.actor)).reduce((best,p)=>Math.hypot(p.x-cx,p.y-cy)<Math.hypot(best.x-cx,best.y-cy)?p:best);
    groups.push({key,members:bucket.map(p=>p.actor),x:anchor.x,y:anchor.y,selected,carrying,left:0,top:0,width:0,height:0});
  }
  return {actors,groups,active,units,signature:crowdViewKey(view),source};
}

/** Badges are tested against their actual last-painted rectangles. */
export function pickCrowdGroup(scene:CrowdScene|null,view:Projection,source:Villager[],x:number,y:number){
  if(!scene||scene.signature!==crowdViewKey(view)||scene.source!==source)return null;
  for(let i=scene.groups.length-1;i>=0;i--){const g=scene.groups[i];if(g.width>0&&x>=g.left&&x<=g.left+g.width&&y>=g.top&&y<=g.top+g.height)return g;}
  return null;
}
