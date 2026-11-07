import {notFound} from 'next/navigation';
import RiverHarness from './river-harness';
export default function Page(){if(process.env.NODE_ENV==='production')notFound();return <RiverHarness/>;}
