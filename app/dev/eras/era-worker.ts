import {settle,type City} from '@/lib/engine';
// Large synthetic catch-ups must not block canvas input or browser controls.
self.onmessage=(event:MessageEvent<{city:City;now:number}>)=>{
 try{const {city,now}=event.data;settle(city,now);self.postMessage({city});}
 catch(error){self.postMessage({error:error instanceof Error?error.message:'Không mô phỏng được.'});}
};
