/** Synthetic medical QA only. No account or database access. */
import {newCity,B,idx,type City} from '@/lib/engine';
import {initializeIndustry} from '@/lib/industry';
import {initializeModern,stepPower} from '@/lib/modern';
export function medicalFixture(at:number):City{
 const c=newCity(at,123);c.era=6;c.t.fill(0);c.seen.fill(1);c.b={};c.people=[];c.camp=idx(20,20);c.army={};c.camps=[];c.herds=[];c.manualWorkforce=true;c.raid=null;c.disaster=undefined;c.wildernessAt=at+86400000;
 const hospital=idx(22,20),power=idx(20,23);c.b[hospital]={k:'hospital',lvl:3,doneAt:null,uid:7};c.b[power]={k:'thermal',lvl:1,doneAt:null};c.b[idx(18,22)]={k:'grandstore',lvl:3,doneAt:null};c.b[idx(19,19)]={k:'apartment',lvl:3,doneAt:null};
 c.res.food=10000;c.res.gold=10000;c.res.coal=10000;c.res.wood=10000;
 for(let i=0;i<8;i++){const tile=i<4?hospital:power;c.people.push({id:i+1,name:i<4?`Nhân viên y tế ${i+1}`:`Thợ điện ${i-3}`,pos:tile,task:{t:'work',at:tile}});}
 for(let i=0;i<3;i++){const tile=idx(40+i*2,20);c.people.push({id:9+i,name:`Người cần cứu ${i+1}`,pos:tile,task:{t:'idle'},vital:{hp:0,downAt:at,last:at,paused:true,x:tile%96+.5,y:Math.floor(tile/96)+.5}});}
 c.nextId=12;c.pop=c.people.length;initializeIndustry(c,at);initializeModern(c,at);stepPower(c,at,at,B);c.zombies!.nextAt=at+86400000;c.zombies!.actors=[];c.log=[];return c;
}
