import {G,HOUR,idx,newCity,RES,type City} from './engine';
import {initializeMedieval} from './medieval';
import {initializeIndustry} from './industry';
import {initializeModern} from './modern';
export function eraFixture(era=5,at=0):City{
 const c=newCity(at,728193);c.t.fill(G);c.seen.fill(1);c.people=[];c.pop=0;c.herds=[];c.camps=[];c.b={};c.camp=idx(20,20);c.era=era;c.manualWorkforce=true;c.army={};
 c.wildernessAt=at+14*24*HOUR;c.disaster={kind:'flood',at:at+14*24*HOUR,level:0,center:0};
 c.b[idx(19,20)]={k:'hall',lvl:era,doneAt:null};c.b[idx(18,20)]={k:'grandstore',lvl:1,doneAt:null};
 for(const r of RES)c.res[r]=1000;
 initializeMedieval(c,at);initializeIndustry(c,at);initializeModern(c,at);return c;
}
export function eraStaff(c:City,tile:number,n:number){for(let k=0;k<n;k++)c.people.push({id:c.nextId++,name:'Thợ thử',task:{t:'work',at:tile},pos:tile});c.pop=c.people.length;}
