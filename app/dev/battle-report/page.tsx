"use client";
import {useState} from 'react';
import BattleReports from '@/components/BattleReports';
import type {WarSummary} from '@/components/useWars';
const wars:WarSummary[]=[{
 _id:'demo-defend',attackerId:'other',defenderId:'me',attackerName:'Làng Đồi',defenderName:'Làng Sông',side:'defender',status:'completed',arrive:1000,endedAt:2000,troops:{club:4},
 result:{winner:'defender',attackerSurvivors:{},defenderSurvivors:{club:2},attackerCasualties:4,defenderCasualties:1,populationLoss:0,burnedTiles:[],loot:{food:0,wood:0,stone:0,copper:0, gold: 0, diamond:0,coal:0},devastation:0}
},{
 _id:'demo-attack',attackerId:'me',defenderId:'other',attackerName:'Làng Sông',defenderName:'Làng Đồi',side:'attacker',status:'returning',arrive:3000,endedAt:4000,troops:{club:4},
 result:{winner:'attacker',attackerSurvivors:{club:3},defenderSurvivors:{},attackerCasualties:1,defenderCasualties:4,populationLoss:2,burnedTiles:[100],loot:{food:5,wood:5,stone:0,copper:0, gold: 0, diamond:0,coal:0},devastation:.5}
}];
export default function Page(){
 const [version,setVersion]=useState(0);
 return <main style={{padding:24}}><h1>Báo cáo trận đánh — bản thử độc lập</h1><p>Không dùng tài khoản hay thao tác với trận thật.</p><button onClick={()=>{localStorage.removeItem('dong-battle-reports:demo');setVersion(v=>v+1);}}>Đánh dấu chưa đọc để thử lại</button><BattleReports key={version} wars={wars} playerId="demo"/><h2>Lịch sử trong Thông báo</h2><BattleReports wars={wars} playerId="demo" history/></main>;
}
