import type {ResKey,Troops} from './engine';
import type {RoadFight} from './road-combat';
export type Point={x:number;y:number};
export type MarketOrder={_id:string;seller:string;sellerName:string;resource:ResKey;amount:number;currency:ResKey;price:number;escorts:Troops;status:'open'|'sold'|'cancelled';createdAt:number};
export type CaravanRaid={by:string;name:string;requestId:string;from:Point;to:Point;depart:number;meetAt:number;units:Troops;initial:Troops;fight?:RoadFight;won?:boolean;backAt?:number;returned?:boolean};
export type Caravan={_id:string;orderId:string;seller:string;buyer:string;sellerName:string;buyerName:string;resource:ResKey;amount:number;currency:ResKey;price:number;from:Point;to:Point;depart:number;arrive:number;back:number;escorts:Troops;initialEscorts:Troops;goodsDelivered?:boolean;paymentDelivered?:boolean;escortsReturned?:boolean;raid?:CaravanRaid;robbed?:boolean;status:'travelling'|'fighting'|'waiting'|'returning'|'completed';createdAt:number;reconciledAt?:number};
export type CaravanView=Omit<Caravan,'from'|'to'|'raid'> & {from?:Point;to?:Point;mine:boolean;canRaid:boolean;raid?:Omit<CaravanRaid,'from'|'to'|'requestId'> & {from?:Point;to?:Point}};
export type MarketData={socket?:string|null;orders:MarketOrder[];caravans:CaravanView[];playerId:string;enabled:boolean;serverNow:number};
export type MarketAction={type:'create';resource:ResKey;amount:number;currency:ResKey;price:number;escorts:Troops;requestId:string}|{type:'buy'|'cancel'|'raid';id:string;units?:Troops;requestId:string};
