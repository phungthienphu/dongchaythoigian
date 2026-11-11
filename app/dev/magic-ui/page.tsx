import {notFound} from 'next/navigation';
import MagicUIHarness from './magic-harness';
export default function Page(){if(process.env.NODE_ENV==='production')notFound();return <MagicUIHarness/>;}
