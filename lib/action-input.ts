import type { Action, BKey, UKey } from './engine';

// Exhaustive typed tables keep the JSON boundary in sync with engine keys,
// without a runtime engine import (the engine itself invokes this guard).
const BUILDINGS: Record<BKey, true> = {
  builderhouse: true, hut: true, gather: true, wood: true, quarry: true, storehouse: true,
  fire: true, farm: true, canal: true, levee: true, house: true,
  smelter: true, market: true, stonehouse: true, forge: true, wheel: true,
  hall: true, envoy: true, barracks: true, wall: true, gate: true,
  watchtower: true, temple: true, logistics: true, infirmary: true,
};
const UNITS: Record<UKey, true> = { club: true, sling: true, spear: true, bow: true, sword: true, elephant: true, wagon: true, medic: true };
const RESOURCES = ['food', 'wood', 'stone', 'copper', 'gold', 'diamond'] as const;
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
    case 'advance': case 'alarm': return true;
    case 'build': return known(BUILDINGS, value.k) && point(value);
    case 'upgradeStorage': return point(value) && RESOURCES.includes(value.resource as typeof RESOURCES[number]);
    case 'upgrade': case 'repair': case 'demolish': case 'tendFarm': case 'speedBuild': return point(value);
    case 'moveSoldier': return typeof value.id === 'string' && /^(club|sling|spear|bow|sword|elephant|wagon|medic):\d{1,3}$/.test(value.id) && point(value);
    case 'train': return known(UNITS, value.u) && integer(value.n, 1, 50);
    case 'recall': return integer(value.exp, 1);
    case 'attack': return integer(value.camp, 1) && troops(value.units);
    case 'assign': return Array.isArray(value.ids) && value.ids.length <= 10_000 && value.ids.every(id => integer(id, 1)) && new Set(value.ids).size === value.ids.length && task(value.task) && positions(value.pos);
    case 'assignN': return integer(value.n, 1, 50) && task(value.task) && positions(value.pos);
    case 'setGuardPosts': return Array.isArray(value.posts) && value.posts.length <= 20 && value.posts.every(point);
    case 'auto': {
      if (typeof value.on !== 'boolean' || !record(value.mix)) return false;
      const mix = value.mix;
      return [4,6].includes(Object.keys(mix).length) && Object.keys(mix).every(key => RESOURCES.includes(key as typeof RESOURCES[number])) && RESOURCES.every(key => (key==='gold'||key==='diamond')&&!own(mix,key) || own(mix,key) && typeof mix[key] === 'number' && Number.isFinite(mix[key]) && mix[key] >= 0 && mix[key] <= 100);
    }
    default: return false;
  }
}
