import test from 'node:test';
import assert from 'node:assert/strict';
import {unseenMarketOrders} from './market-notices';
import type {MarketData,MarketOrder} from './market-types';
const order=(id:string,seller:string,createdAt:number,status:MarketOrder['status']='open'):MarketOrder=>({_id:id,seller,sellerName:seller,createdAt,status,resource:'wood',amount:10,currency:'gold',price:2,escorts:{}});
test('new goods badge excludes own, read, cancelled and sold listings and survives refresh',()=>{
 const data:MarketData={orders:[order('mine','me',30),order('read','other',10),order('new','other',20),order('sold','other',30,'sold'),order('cancel','other',30,'cancelled')],caravans:[],playerId:'me',enabled:true,serverNow:40};
 assert.equal(unseenMarketOrders(data,10),1);assert.equal(unseenMarketOrders(structuredClone(data),10),1);
 assert.equal(unseenMarketOrders(data,40),0);assert.equal(unseenMarketOrders(null,0),0);
 data.orders=data.orders.filter(o=>o._id!=='new');assert.equal(unseenMarketOrders(data,10),0);
});
