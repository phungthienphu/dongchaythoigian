import {notFound} from 'next/navigation';
import RuntimeHarness from './runtime-harness';
export default function Page(){if(process.env.NODE_ENV==='production')notFound();return <RuntimeHarness/>;}
