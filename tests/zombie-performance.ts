// Manual PvE-only 14-day fixture; excludes economy, Mongo and network. Run with bun.
import {newCity,idx} from '../lib/engine';
import {stepZombies} from '../lib/zombies';
const c=newCity(0,123);c.era=6;c.t.fill(0);c.seen.fill(1);c.b={};c.army={};c.camps=[];c.herds=[];c.people=Array.from({length:1100},(_,i)=>({id:i,name:'QA',task:{t:'idle' as const},pos:idx(45+i%6,45+Math.floor(i/6)%6)}));c.pop=1100;c.nextId=1100;
const started=performance.now();let batch=performance.now(),maxBatch=0;
for(let t=1000;t<=14*86400000;t+=1000){stepZombies(c,t);if(t%60000===0){maxBatch=Math.max(maxBatch,performance.now()-batch);batch=performance.now();}if(t%86400000===0)console.log(JSON.stringify({days:t/86400000,ms:Math.round(performance.now()-started),maxMinuteMs:Math.round(maxBatch),people:c.people.length,waves:c.zombies!.report.waves}));}
