import {notFound} from 'next/navigation';
import RecruitmentHarness from './recruitment-harness';
export default function Page(){if(process.env.NODE_ENV==='production')notFound();return <RecruitmentHarness/>;}
