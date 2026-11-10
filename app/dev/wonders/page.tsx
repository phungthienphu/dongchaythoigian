import {notFound} from 'next/navigation';
import WonderHarness from './wonder-harness';
export default function Page(){if(process.env.NODE_ENV==='production')notFound();return <WonderHarness/>;}
