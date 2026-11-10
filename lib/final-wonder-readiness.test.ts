import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyAction,HOUR,idx,R,RES} from './engine';
import {eraFixture,eraStaff} from './era-fixtures.test-utils';
import {finalWonderError,finalWonderRequirements} from './modern';
import {finalWonderReadiness} from './final-wonder-readiness';
function fixture(){
 const c=eraFixture(6);eraStaff(c,c.camp,400);for(const r of RES)c.res[r]=100_000;
 for(let n=0;n<2;n++){const tile=idx(22+n,22);c.b[tile]={k:'hydro',lvl:1,doneAt:null};eraStaff(c,tile,3);}
 for(let n=0;n<4;n++)c.b[idx(22+n,23)]={k:'park',lvl:1,doneAt:null};
 c.modern!.supply=100;c.modern!.clean=80;c.industry!.pollution=20;c.industry!.cleanSince=0;c.last=12*HOUR;return c;
}
test('readiness lists all concurrent missing prerequisites from the reported village scenario',()=>{
 const c=fixture();c.b[idx(19,20)].lvl=5;c.people=c.people.filter(p=>p.pos!==idx(23,22));c.modern!.supply=285;c.modern!.clean=125;c.industry!.pollution=57.66;delete c.industry!.cleanSince;
 const dam=finalWonderReadiness(c,'dam',c.last),green=finalWonderReadiness(c,'green',c.last);
 assert.deepEqual(dam.requirements.filter(r=>!r.met).map(r=>r.id),['hall','hydro']);assert.deepEqual(green.requirements.filter(r=>!r.met).map(r=>r.id),['hall','power','pollution','cleanTime']);
 assert.match(green.requirements.find(r=>r.id==='power')!.detail,/43.9%/);assert.equal(dam.ready,false);assert.equal(green.ready,false);assert.equal(finalWonderError(c,'dam',c.last),dam.requirements.find(r=>!r.met)!.error);
 assert.equal(dam.requirements.find(r=>r.id==='hydro')!.tile,idx(23,22));
});
test('server rejection stays ordered and skips population scans after a missing hall',()=>{
 const c=fixture();c.b[idx(19,20)].lvl=5;Object.defineProperty(c,'people',{get(){throw new Error('Should not inspect workers after blocked hall');}});
 assert.match(finalWonderError(c,'dam',c.last)!,/cấp 6/);assert.match(finalWonderError(c,'green',c.last)!,/cấp 6/);
});
test('clean-time progress needs actual clean pollution and reaches the boundary exactly at twelve hours',()=>{
 const c=fixture();assert.equal(finalWonderReadiness(c,'green',12*HOUR-1).ready,false);assert.equal(finalWonderReadiness(c,'green',12*HOUR).ready,true);
 c.industry!.pollution=20.01;const r=finalWonderReadiness(c,'green',12*HOUR);assert.equal(r.requirements.find(r=>r.id==='cleanTime')!.met,false);assert.match(r.requirements.find(r=>r.id==='cleanTime')!.detail,/0.00\/12/);
});
test('materials and builder availability are included without mutating the village',()=>{
 const c=fixture();c.res.gold=0;const before=structuredClone(c),r=finalWonderReadiness(c,'dam',c.last);assert.equal(r.ready,false);assert.equal(r.cost.find(r=>r.resource==='gold')!.missing,6000);assert.deepEqual(c,before);
 for(let n=0;n<7;n++)c.b[idx(30+n,30)]={k:'hut',lvl:0,doneAt:c.last+HOUR};c.res.gold=100_000;assert.equal(finalWonderReadiness(c,'dam',c.last).freeBuilders,0);assert.equal(finalWonderReadiness(c,'dam',c.last).ready,false);
});
test('checklist eligibility matches authoritative construction and cannot unlock both branches',()=>{
 const c=fixture();c.t[idx(26,21)]=R;const x=26,y=22;
 assert.equal(finalWonderReadiness(c,'dam',c.last).ready,true);
 assert.equal(applyAction(c,{type:'build',k:'dam',x,y,confirmFinal:true},c.last),null);
 assert.equal(c.b[idx(x,y)].lvl,0);assert.equal(c.res.gold,94_000);assert.match(finalWonderError(c,'green',c.last)!,/một kỳ quan/);
 const clean=fixture();clean.t[idx(26,21)]=R;assert.equal(applyAction(clean,{type:'build',k:'green',x,y,confirmFinal:true},clean.last),null);
});
test('destroyed and understaffed prerequisites fail; ordinary buildings are unaffected',()=>{
 const c=fixture();c.b[idx(22,22)].flooded=true;assert.match(finalWonderError(c,'dam',c.last)!,/2 thủy điện/);assert.equal(finalWonderReadiness(c,'dam',c.last).ready,false);
 c.b[idx(22,23)].burned=true;assert.match(finalWonderError(c,'green',c.last)!,/4 công viên/);assert.deepEqual([...finalWonderRequirements(c,'hut',c.last)],[]);assert.equal(finalWonderError(c,'hut',c.last),null);
});
