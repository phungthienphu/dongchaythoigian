import {MAGIC_EXPANSION} from './building-expansion';
import type { Action, BKey, UKey } from './engine';

// Exhaustive typed tables keep the JSON boundary in sync with engine keys,
// without a runtime engine import (the engine itself invokes this guard).
const BUILDINGS: Record<BKey, true> = {
  ...Object.fromEntries(Object.keys(MAGIC_EXPANSION).map(k=>[k,true])) as Record<keyof typeof MAGIC_EXPANSION,true>,
  relocationoffice:true,recyclingworks:true,hydroponics:true,
  refuge:true,healer:true,warningbell:true,thermal:true,hydro:true,solar:true,apartment:true,complex:true,hospital:true,university:true,park:true,retention:true,dam:true,green:true,
  coalmine:true,charcoal:true,machine:true,factory:true,transport:true,tenement:true,treatment:true,nursery:true,ironbridge:true,bridgehead:true,
  grandstore:true, tilehouse:true, well:true, reservoir:true, estate:true, school:true, artisan:true, academy:true,
  dock: true, builderhouse: true, hut: true, gather: true, wood: true, quarry: true, storehouse: true,
  fire: true, farm: true, canal: true, levee: true, house: true,
  smelter: true, market: true, stonehouse: true, forge: true, wheel: true,
  hall: true, envoy: true, barracks: true, wall: true, gate: true,
  watchtower: true, temple: true, logistics: true, infirmary: true,
  aetherwell:true, manarelay:true, crystalworks:true, runeworks:true, mageacademy:true, manaspire:true, rivershrine:true, wardcircle:true, spiritgarden:true, awakeningtower:true,
  essenceforge:true, firealtar:true, watertemple:true, woodgrove:true, earthtemple:true, golemworks:true, spiritstable:true, harmonizer:true, fourspirits:true,
  celestialforge:true, observatory:true, spiritgate:true, covenantaltar:true, worldmatrix:true, teleportdock:true, riverpalace:true,
};
const UNITS: Record<UKey, true> = {firemage:true,watermage:true,golem:true,spiritdeer:true,dragon:true,tortoise:true,phoenix:true,crossbow:true,cavalry:true,musket:true,cannon:true,infantry:true,armor:true, club: true, sling: true, spear: true, bow: true, sword: true, elephant: true, wagon: true, medic: true };
const RESOURCES = ['food', 'wood', 'stone', 'copper', 'gold', 'diamond','coal'] as const;
/** Magic goods are optional in workforce/mix payloads so older clients stay valid. */
const MAGIC_RESOURCES = ['aetherCrystal','rune','essence','celestialStone'] as const;
const ELEMENTS = ['fire','water','wood','earth'];
const RESEARCH = ['conduction','warcraft','lifecraft','elements','pact','gatecraft','dragonPact','tortoisePact','phoenixPact'];
const CONTRACTS = ['dragon','tortoise','phoenix'];
const DOMAINS = ['river','citadel','crafts'];
const PACKAGES = ['thunder','sanctuary'];
const STOCK = ['food','wood','stone','copper','gold','diamond','coal','aetherCrystal','rune','essence','celestialStone'];
const MAP_SIDE = 96;
const own = (object: object, key: PropertyKey) => Object.prototype.hasOwnProperty.call(object, key);
const record = (value: unknown): value is Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};
const integer = (value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
const tile = (value: unknown) => integer(value, 0, MAP_SIDE * MAP_SIDE - 1);
const point = (value: unknown) => record(value) && integer(value.x, 0, MAP_SIDE - 1) && integer(value.y, 0, MAP_SIDE - 1);
const known = (table: object, value: unknown) => typeof value === 'string' && own(table, value);
const orientation=(value:unknown)=>value==='auto'||value==='x'||value==='y';
const soldierId=(value:unknown)=>typeof value==='string'&&/^(club|sling|spear|bow|sword|elephant|wagon|medic|crossbow|cavalry|musket|cannon|infantry|armor|firemage|watermage|golem|spiritdeer|dragon|tortoise|phoenix):\d{1,3}$/.test(value);
function task(value: unknown) {
  if (!record(value) || !own(value, 't')) return false;
  switch (value.t) {
    case 'idle': return true;
    case 'move': case 'explore': return tile(value.to);
    case 'work': case 'chop': case 'mine': return tile(value.at);
    case 'hunt': return integer(value.herd, 1);
    default: return false;
  }
}
function positions(value: unknown) {
  if (value === undefined) return true;
  if (!record(value)) return false;
  const entries = Object.entries(value);
  return entries.length <= 10_000 && entries.every(([id, at]) => /^[1-9]\d*$/.test(id) && integer(Number(id), 1) && tile(at));
}
function troops(value: unknown) {
  if (!record(value)) return false;
  const entries = Object.entries(value);
  return entries.every(([unit, count]) => known(UNITS, unit) && integer(count, 0, 300)) && entries.reduce((sum, [, count]) => sum + (count as number), 0) <= 300;
}
/** Runtime JSON validation before any settlement, payment, or troop reservation.
 * Game-state requirements (known people, free jobs, stock, explored land) remain
 * the engine's responsibility. Additional action metadata is harmless and kept. */
export function isActionInput(value: unknown): value is Action {
  if (!record(value) || !own(value, 'type')) return false;
  switch (value.type) {
    case 'setPowerPriority': return Array.isArray(value.priority)&&value.priority.length===3&&new Set(value.priority).size===3&&value.priority.every(p=>['essential','housing','production'].includes(p));
    case 'activateZombies': case 'zombieSurvivors': case 'advance': case 'alarm': return true;
    case 'ambulanceAuto': return point(value)&&typeof value.on==='boolean';
    case 'zombiePatrol': return typeof value.on==='boolean';
    case 'build': return known(BUILDINGS, value.k) && point(value) && (!own(value,'confirmFinal')||typeof value.confirmFinal==='boolean') && (!own(value,'orientation')||(value.k==='wall'||value.k==='gate')&&orientation(value.orientation));
    case 'orientDefense': return point(value)&&orientation(value.orientation);
    case 'upgradeStorage': return point(value) && ([...RESOURCES,...MAGIC_RESOURCES] as string[]).includes(value.resource as string);
    case 'magicResearch': return typeof value.key==='string'&&RESEARCH.includes(value.key);
    case 'cancelMagicResearch': return true;
    case 'magicSpecialize': return typeof value.element==='string'&&ELEMENTS.includes(value.element);
    case 'magicHarmonize': return point(value)&&Array.isArray(value.elements)&&value.elements.length===2&&value.elements.every(e=>typeof e==='string'&&ELEMENTS.includes(e))&&value.elements[0]!==value.elements[1];
    case 'magicTreant': return point(value);
    case 'magicContract': return typeof value.contract==='string'&&CONTRACTS.includes(value.contract);
    case 'magicPrepare': return typeof value.spell==='string'&&PACKAGES.includes(value.spell);
    case 'magicDockPair': return point(value)&&tile(value.to);
    case 'magicTeleport': return point(value)&&typeof value.resource==='string'&&STOCK.includes(value.resource)&&integer(value.amount,1,60);
    case 'magicDomain': return typeof value.domain==='string'&&DOMAINS.includes(value.domain);
    case 'plantTree': case 'toggleBuilding': case 'buildShip': case 'upgrade': case 'repair': case 'demolish': case 'tendFarm': case 'tendFarmGroup': case 'speedBuild': return point(value);
    case 'relocateBuilding': case 'relocateDock': case 'connectBridge': return point(value) && tile(value.to);
    case 'moveSoldier': return soldierId(value.id) && point(value);
    case 'moveSoldiers': return Array.isArray(value.ids)&&value.ids.length>0&&value.ids.length<=360&&value.ids.every(soldierId)&&new Set(value.ids).size===value.ids.length&&point(value);
    case 'train': return known(UNITS, value.u) && integer(value.n, 1, 50);
    case 'releaseTroops': return troops(value.units) && (value.mode==='demobilize'||value.mode==='expel');
    case 'recall': return integer(value.exp, 1);
    case 'attack': return integer(value.camp, 1) && troops(value.units);
    case 'assign': return Array.isArray(value.ids) && value.ids.length <= 10_000 && value.ids.every(id => integer(id, 1)) && new Set(value.ids).size === value.ids.length && task(value.task) && positions(value.pos);
    case 'assignN': return integer(value.n, 1, 10_000) && task(value.task) && positions(value.pos);
    case 'setWorkforce': {
      if(!record(value.counts)||!integer(value.scouts,0,10_000))return false;
      const counts=value.counts;
      const optional=MAGIC_RESOURCES.filter(r=>own(counts,r));
      return [6,7].includes(Object.keys(counts).length-optional.length) && optional.every(r=>integer(counts[r],0,10_000)) && RESOURCES.every(r=>r==='coal'&&!own(counts,r)||own(counts,r)&&integer(counts[r],0,10_000));
    }
    case 'setGuardPosts': return Array.isArray(value.posts) && value.posts.length <= 20 && value.posts.every(point);
    case 'auto': {
      if (typeof value.on !== 'boolean' || !record(value.mix)) return false;
      const mix = value.mix;
      const optional=MAGIC_RESOURCES.filter(r=>own(mix,r));
      return [4,6,7].includes(Object.keys(mix).length-optional.length) && optional.every(r=>typeof mix[r]==='number'&&Number.isFinite(mix[r])&&mix[r]>=0&&mix[r]<=100) && Object.keys(mix).every(key => ([...RESOURCES,...MAGIC_RESOURCES] as string[]).includes(key)) && RESOURCES.every(key => (key==='gold'||key==='diamond'||key==='coal')&&!own(mix,key) || own(mix,key) && typeof mix[key] === 'number' && Number.isFinite(mix[key]) && mix[key] >= 0 && mix[key] <= 100);
    }
    default: return false;
  }
}
