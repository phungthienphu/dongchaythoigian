import type { City } from './engine';

/** Terrain and visibility are flat numeric arrays. Native slice avoids walking
 * their 18,432 elements through the general structured-clone serializer on every
 * optimistic action/tick. All arrays remain independently owned; nested gameplay
 * data still uses structuredClone so rollback and ACK replay cannot share state. */
export function cloneCity(city: City): City {
  const copy = structuredClone({ ...city, t: undefined, seen: undefined });
  return { ...copy, t: city.t.slice(), seen: city.seen.slice() };
}
