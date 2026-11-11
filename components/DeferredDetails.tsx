'use client';
import {useState,type ReactNode} from 'react';

/** Closed disclosures should not compute or mount their potentially large body. */
export default function DeferredDetails({summary,children}:{summary:ReactNode;children:()=>ReactNode}){
  const [open,setOpen]=useState(false);
  return <details className="ui-details" onToggle={event=>{
    if(event.target===event.currentTarget)setOpen(event.currentTarget.open);
  }}><summary>{summary}</summary>{open&&children()}</details>;
}
