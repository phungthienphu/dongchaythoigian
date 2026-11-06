import type {MarketData} from './market-types';
/** Count currently purchasable offers from other villages, never our own listings. */
export function unseenMarketOrders(data:MarketData|null,seenAt:number){
 return data?.orders.filter(o=>o.status==='open'&&o.seller!==data.playerId&&o.createdAt>seenAt).length??0;
}
