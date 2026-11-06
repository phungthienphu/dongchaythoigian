import type { BattleResult, BattleSide } from './battle';
export function battleReport(result:BattleResult, side:BattleSide, opponent:string){
 const won=result.winner===side;
 const loss=side==='attacker'?result.attackerCasualties:result.defenderCasualties;
 const enemyLoss=side==='attacker'?result.defenderCasualties:result.attackerCasualties;
 const title=side==='attacker'?`Tấn công ${opponent}: ${won?'THÀNH CÔNG':'THẤT BẠI'}.`:`Làng vừa bị ${opponent} tấn công: ${won?'PHÒNG THỦ THÀNH CÔNG':'PHÒNG THỦ THẤT BẠI'}.`;
 return `${title} Mất ${loss} quân; đối phương mất ${enemyLoss} quân. ${result.burnedTiles.length} công trình bị phá; ${result.populationLoss} dân thiệt mạng.`;
}
