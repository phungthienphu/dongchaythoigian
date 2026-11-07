import {notFound} from 'next/navigation';
import PopulationHarness from './population-harness';
export default function Page(){if(process.env.NODE_ENV==='production')notFound();return <PopulationHarness/>;}
