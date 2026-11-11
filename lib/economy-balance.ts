import type {BKey,City,Res} from './engine';
import type {MagicBuildingDef} from './magic-data';

/** Saved activation time preserves historical offline production on old saves. */
const PREVIOUS_OUTPUT:Partial<Record<BKey,Partial<Res>>>= {
 gather:{food:60},wheel:{food:150},
 coalmine:{coal:240},charcoal:{coal:60},machine:{copper:120},factory:{gold:30},complex:{gold:60},
};
const EXPANSION_PREVIOUS_OUTPUT:Partial<Record<BKey,Partial<Res>>>={recyclingworks:{copper:240},emberkiln:{coal:180}};
const EXPANSION_PREVIOUS_INPUT:Partial<Record<BKey,Partial<Res>>>={recyclingworks:{stone:480,coal:120},emberkiln:{wood:360,essence:1}};
export function buildingInput(c:City,key:BKey,current:Partial<Res>|undefined,at:number){
 return at<(c.expansionBalanceStartsAt??Infinity)?EXPANSION_PREVIOUS_INPUT[key]??current:current;
}
export function buildingOutput(c:City,key:BKey,current:Partial<Res>,at:number):Partial<Res>{
 if(at<(c.expansionBalanceStartsAt??Infinity)&&EXPANSION_PREVIOUS_OUTPUT[key])return EXPANSION_PREVIOUS_OUTPUT[key]!;
 return at<(c.economyBalanceStartsAt??Infinity)?PREVIOUS_OUTPUT[key]??current:current;
}

const PREVIOUS_DEFENSE:Partial<Record<BKey,MagicBuildingDef['defense']>>={
 wardbastion:{range:7,damage:70,cooldown:4000,mana:5,targets:1},
 elementbastion:{range:8,damage:45,cooldown:3000,mana:5,targets:3},
 celestialbastion:{range:10,damage:150,cooldown:5000,mana:18,targets:2},
};
export function buildingDefense(c:City,key:BKey,current:MagicBuildingDef['defense'],at:number){
 return at<(c.expansionBalanceStartsAt??Infinity)?PREVIOUS_DEFENSE[key]??current:current;
}
