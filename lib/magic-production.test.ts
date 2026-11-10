import test from 'node:test';
import assert from 'node:assert/strict';
import {manaNetwork,type ManaSite} from './mana-network';
import {reconcileMagicFactories,deliverMagicInput,collectMagicOutput,stepMagicProduction,type MagicProduction,type MagicFactory} from './magic-production';
const hour=3600000;
function factory(id:string,kind:MagicFactory['kind'],workers:number):Omit<MagicFactory,'input'|'output'>{return {id,kind,workers,level:1,enabled:true,activeSince:0};}
function setup(){const state:MagicProduction={minuteAt:0,knowledge:0,mana:{},factories:{}};const factories=[factory('well','aetherwell',2),factory('crystal','crystalworks',4),factory('rune','runeworks',4),factory('academy','mageacademy',4)];reconcileMagicFactories(state,factories);const sites:ManaSite[]=factories.map((f,i)=>({id:f.id,kind:f.kind,tile:960+10+i,level:1,enabled:true}));const network=manaNetwork(sites,()=>true);return {state,network,factories};}
const near=(actual:number,expected:number)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} != ${expected}`);
test('one-hour recipes conserve their own buffers and mana without consuming village stock',()=>{
 const {state,network}=setup();deliverMagicInput(state,'crystal','copper',120);deliverMagicInput(state,'crystal','gold',40);deliverMagicInput(state,'rune','wood',120);deliverMagicInput(state,'rune','aetherCrystal',12);deliverMagicInput(state,'academy','rune',6);stepMagicProduction(state,network,hour);
 near(state.factories.crystal.output.aetherCrystal!,24);near(state.factories.rune.output.rune!,12);near(state.knowledge,24);near(state.mana.well,40);near(collectMagicOutput(state,'crystal','aetherCrystal',100),24);near(collectMagicOutput(state,'crystal','aetherCrystal',100),0);
});
test('full output buffers stop before paying inputs; late activation earns no earlier production',()=>{
 const {state,network}=setup();state.factories.crystal.activeSince=30000;deliverMagicInput(state,'crystal','copper',500);deliverMagicInput(state,'crystal','gold',500);stepMagicProduction(state,network,3*hour);near(state.factories.crystal.output.aetherCrystal!,48);near(state.factories.crystal.input.copper!,0);near(state.factories.crystal.input.gold!,0);assert.ok(state.factories.crystal.blocked);
});
test('missing linked industry stops production and resuming cannot recover stopped hours',()=>{
 const {state,network}=setup();deliverMagicInput(state,'crystal','copper',240);deliverMagicInput(state,'crystal','gold',80);stepMagicProduction(state,network,hour,f=>f.id==='crystal'?'Lò rèn đã mất điện.':undefined);near(state.factories.crystal.input.copper!,240);stepMagicProduction(state,network,2*hour);near(state.factories.crystal.output.aetherCrystal!,24);
});
test('request chunking and reload match a single settlement at absolute minute boundaries',()=>{
 const a=setup();deliverMagicInput(a.state,'academy','rune',12);let state=structuredClone(a.state),network=structuredClone(a.network);stepMagicProduction(a.state,a.network,2*hour+351);
 for(let at=777;at<2*hour+351;at+=14731){stepMagicProduction(state,network,at);state=JSON.parse(JSON.stringify(state));network=JSON.parse(JSON.stringify(network));}stepMagicProduction(state,network,2*hour+351);assert.deepEqual(state,a.state);assert.deepEqual(network,a.network);
});
test('destroying and rebuilding the same kind cannot inherit old buffers or mana',()=>{
 const {state,factories}=setup();deliverMagicInput(state,'crystal','copper',100);state.mana.well=200;reconcileMagicFactories(state,factories.filter(f=>!['crystal','well'].includes(f.id)));reconcileMagicFactories(state,[factory('well-new','aetherwell',2),factory('crystal-new','crystalworks',4)]);assert.equal(state.mana.well,undefined);assert.equal(state.mana['well-new'],0);assert.deepEqual(state.factories['crystal-new'].input,{});assert.equal(deliverMagicInput(state,'crystal','copper',100),0);
});
