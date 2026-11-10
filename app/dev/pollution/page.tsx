import {notFound} from 'next/navigation';
import PollutionHarness from './pollution-harness';
export default function Page(){if(process.env.NODE_ENV==='production')notFound();return <PollutionHarness/>;}
