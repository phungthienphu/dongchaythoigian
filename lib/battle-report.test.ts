import {test} from 'node:test';
import assert from 'node:assert/strict';
import {battleReport} from './battle-report';
import type {BattleResult} from './battle';
const r:BattleResult={winner:'defender',attackerSurvivors:{},defenderSurvivors:{},attackerCasualties:4,defenderCasualties:2,populationLoss:0,burnedTiles:[],loot:{food:0,wood:0,stone:0,copper:0, gold: 0, diamond:0,coal:0,aetherCrystal:0,rune:0},devastation:0};
test('report explains outcomes and correct casualties for each participant',()=>{
 assert.match(battleReport(r,'attacker','Làng B'),/Tấn công Làng B: THẤT BẠI.*Mất 4 quân; đối phương mất 2/);
 assert.match(battleReport(r,'defender','Làng A'),/bị Làng A tấn công: PHÒNG THỦ THÀNH CÔNG.*Mất 2 quân; đối phương mất 4/);
 assert.match(battleReport({...r,winner:'attacker'},'defender','Làng A'),/PHÒNG THỦ THẤT BẠI/);
 assert.match(battleReport({...r,winner:'attacker'},'attacker','Làng B'),/THÀNH CÔNG/);
});
