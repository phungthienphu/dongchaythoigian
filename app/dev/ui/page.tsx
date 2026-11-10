import {notFound} from 'next/navigation';
import UIHarness from './ui-harness';
export default function Page(){if(process.env.NODE_ENV==='production')notFound();return <UIHarness/>;}
