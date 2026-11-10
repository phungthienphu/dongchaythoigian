'use client';
import {useEffect,useRef} from 'react';
import {drawSoldier} from './battle-actors';
import type {UKey} from '@/lib/engine';

/** Static portrait reuses the map actor art; it does not run an animation loop. */
export default function UnitPortrait({unit}:{unit:UKey}){
  const canvas=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{const ctx=canvas.current?.getContext('2d');if(!ctx)return;ctx.setTransform(2,0,0,2,0,0);ctx.clearRect(0,0,80,80);drawSoldier(ctx,{id:'portrait',side:'attacker',u:unit,count:1,initial:1,hp:1,x:0,y:0,order:{type:'guard',x:0,y:0}},40,65,1.4,0,false);},[unit]);
  return <canvas ref={canvas} width={160} height={160} className="unit-portrait" aria-hidden="true"/>;
}
