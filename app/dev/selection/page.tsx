import {notFound} from 'next/navigation';
import SelectionHarness from './selection-harness';
export default function Page(){if(process.env.NODE_ENV==='production')notFound();return <SelectionHarness/>;}
