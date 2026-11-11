import {notFound} from 'next/navigation';
import ExpansionGallery from './gallery';
export default function Page(){if(process.env.NODE_ENV==='production')notFound();return <ExpansionGallery/>;}
