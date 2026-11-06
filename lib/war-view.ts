import type { City } from './engine';
import type { BattleDoc } from './war';
import { knowsNation } from './world-discovery';
export type WarView = Omit<BattleDoc,'snapshot'|'from'|'to'|'depart'|'duration'|'createdAt'|'back'|'suppliesFood'> & {
  createdAt?: Date; back?: number; suppliesFood?: number;
  from?: BattleDoc['from']; to?: BattleDoc['to']; depart?: number; duration?: number;
};
/** Incoming raids cannot reveal the hidden origin through routes or travel duration. */
export function warView(w: BattleDoc, pid: string, city: City): WarView {
  const {snapshot: _snapshot, from, to, depart, duration, createdAt, back, suppliesFood, ...rest}=w;
  const originKnown=w.attackerId===pid||knowsNation(city,w.attackerId);
  const destinationKnown=w.defenderId===pid||knowsNation(city,w.defenderId);
  return {...rest,...(originKnown?{from}:{}),...(destinationKnown?{to}:{}),
    ...(originKnown&&destinationKnown?{depart,duration,createdAt,...(suppliesFood!==undefined?{suppliesFood}:{}),...(back!==undefined?{back}:{})}:{})};
}
