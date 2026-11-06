import { MIN, troopSpace, type City, type Troops } from './engine';
/** Round-trip food plus a five-minute combat reserve. Elephants use five places. */
export function marchSupplies(troops: Troops, oneWayMs: number) {
  const minutes=(2*Math.max(MIN,oneWayMs))/MIN+5;
  return { food: Math.ceil(troopSpace(troops)*minutes/10), minutes };
}
/** Called inside the same transaction that reserves troops; failure changes nothing. */
export function reserveMarchFood(c: City, troops: Troops, oneWayMs: number) {
  const {food}=marchSupplies(troops,oneWayMs);
  if(c.res.food<food)throw new Error(`Cần ${food} lương thực dự trữ cho cả đi và về; hiện có ${Math.floor(c.res.food)}.`);
  c.res.food-=food;
  return food;
}
