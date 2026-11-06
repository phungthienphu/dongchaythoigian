import type { City } from './engine';
import type { Nation } from './world';
/** Only the viewer's own trips with a known destination may disclose a route. */
export function envoyWorldRoutes(city:Pick<City,'trips'>,nations:Pick<Nation,'id'|'me'|'x'|'y'|'name'>[],now:number) {
 const from=nations.find(n=>n.me);if(!from)return [];
 return (city.trips??[]).flatMap(tr=>{
  const to=nations.find(n=>n.id===tr.target);
  if(!to || now<tr.depart || now>=tr.back || tr.arrive<=tr.depart || tr.back<=tr.arrive)return [];
  const returning=now>=tr.arrive;
  const progress=returning?1-(now-tr.arrive)/(tr.back-tr.arrive):(now-tr.depart)/(tr.arrive-tr.depart);
  const q=Math.max(0,Math.min(1,progress));
  return [{id:tr.id,from,to,x:from.x+(to.x-from.x)*q,y:from.y+(to.y-from.y)*q,returning}];
 });
}
