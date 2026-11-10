'use client';
import {useEffect,useState,type Dispatch,type SetStateAction} from 'react';
/** Small UI preferences only. Never stores a city, orders or credentials. */
export function useViewPreference<T>(key:string,initial:T,valid:(value:unknown)=>value is T):[T,Dispatch<SetStateAction<T>>]{
  const [value,setValue]=useState<T>(()=>{if(typeof window!=='undefined')try{const saved:unknown=JSON.parse(sessionStorage.getItem(`dong-ui:${key}`)??'null');if(valid(saved))return saved;}catch{}return initial;});
  useEffect(()=>{try{sessionStorage.setItem(`dong-ui:${key}`,JSON.stringify(value));}catch{}},[key,value]);
  return [value,setValue];
}
