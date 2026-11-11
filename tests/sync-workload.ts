import { G, HOUR, idx, newCity, derive, stats, type City, type Action } from '../lib/engine';

/** Synthetic, deterministic villages; never loads an account or a database. */
export function syncFixture(pop = 50, blocked = false): City {
  const c = newCity(0, 123);
  c.t.fill(G); c.seen.fill(1); c.camp = idx(20,20); c.b = {}; c.era = 3;
  c.manualWorkforce = true; c.herds = []; c.camps = []; c.exps = []; c.shift = null; c.raid = null;
  c.wildernessAt = 1000 * HOUR; c.disaster = { kind:'flood', at:1000*HOUR, level:1, center:0 };
  c.upkeepStartsAt = 0; c.wheelFuelStartsAt = 0; c.gatherFoodStartsAt = 0;
  c.b[idx(20,20)] = { k:'hall', lvl:3, doneAt:null };
  for (let n=0;n<Math.ceil(pop/2);n++) c.b[idx(25+n%12,25+Math.floor(n/12))] = { k:'gather', lvl:3, doneAt:null };
  for (let n=0;n<25;n++) c.b[idx(42+n%5,25+Math.floor(n/5))] = { k:'storehouse', lvl:3, doneAt:null };
  c.people = Array.from({length:pop},(_,n)=>({ id:n+1, name:'Fixture', task:{t:'work' as const,at:idx(25+Math.floor(n/2)%12,25+Math.floor(Math.floor(n/2)/12))}, pos:c.camp }));
  c.pop = pop; c.nextId = pop+1;
  c.res = { food:blocked?75000:5000, wood:5000, stone:1000, copper:1000, gold:0, diamond:0, coal:0,aetherCrystal:0,rune:0 };
  if (blocked) c.res.food = stats(c, derive(c), 0).storage.food;
  return c;
}
export function syncCommands(count = 20): { at:number; action:Action }[] {
  return Array.from({length:count},(_,n)=>({at:500+n*450,action:{type:'assign',ids:[1],task:n%2?{t:'work',at:idx(25,25)}:{t:'idle'}}}));
}
