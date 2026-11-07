import {notFound} from 'next/navigation';
import EraHarness from './era-harness';
export default function Page(){if(process.env.NODE_ENV==='production')notFound();return <EraHarness/>;}
