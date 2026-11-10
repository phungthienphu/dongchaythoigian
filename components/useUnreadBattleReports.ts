'use client';
import {useEffect,useState} from 'react';
import type {WarSummary} from './useWars';
/** Shares the legacy read key; reading the inbox never changes battle state. */
export function useUnreadBattleReports(wars:WarSummary[],playerId:string|undefined,viewed:boolean){
  const key=playerId?`dong-battle-reports:${playerId}`:'';
  const [read,setRead]=useState({key:'',ids:[] as string[]});
  useEffect(()=>{let ids:string[]=[];try{const value=JSON.parse(localStorage.getItem(key)||'[]');if(Array.isArray(value))ids=value.filter((v):v is string=>typeof v==='string').slice(-100);}catch{}setRead({key,ids});},[key]);
  const reports=wars.filter(w=>w.result),signature=reports.map(w=>w._id).join('|');
  useEffect(()=>{if(!viewed||!key||read.key!==key)return;const ids=[...new Set([...read.ids,...reports.map(w=>w._id)])].slice(-100);if(ids.join('|')===read.ids.join('|'))return;setRead({key,ids});try{localStorage.setItem(key,JSON.stringify(ids));}catch{}},[viewed,key,read,signature]);
  return read.key===key?reports.filter(w=>!read.ids.includes(w._id)).length:0;
}
