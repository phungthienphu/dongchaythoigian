import {notFound} from 'next/navigation';
import WallsHarness from './walls-harness';
export default function Page(){if(process.env.NODE_ENV==='production')notFound();return <WallsHarness/>;}
