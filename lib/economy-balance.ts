import type {BKey,City,Res} from './engine';

/** Saved activation time preserves historical offline production on old saves. */
const PREVIOUS_OUTPUT:Partial<Record<BKey,Partial<Res>>>= {
 gather:{food:60},wheel:{food:150},
 coalmine:{coal:240},charcoal:{coal:60},machine:{copper:120},factory:{gold:30},complex:{gold:60},
};
export function buildingOutput(c:City,key:BKey,current:Partial<Res>,at:number):Partial<Res>{
 return at<(c.economyBalanceStartsAt??Infinity)?PREVIOUS_OUTPUT[key]??current:current;
}
