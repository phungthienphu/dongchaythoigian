/** A single bitmap per turn; the renderer only paints the live scene once/frame. */
export type MapTurn = { image: HTMLCanvasElement; started: number };
export const MAP_TURN_MS=260;
export function captureMapTurn(canvas:HTMLCanvasElement):MapTurn|null {
  if(matchMedia('(prefers-reduced-motion: reduce)').matches)return null;
  const image=document.createElement('canvas');image.width=canvas.width;image.height=canvas.height;
  const c=image.getContext('2d');if(!c)return null;c.drawImage(canvas,0,0);
  return {image,started:performance.now()};
}
export function paintMapTurn(c:CanvasRenderingContext2D,turn:MapTurn,time:number,width:number,height:number):boolean {
  const p=Math.min(1,Math.max(0,(time-turn.started)/MAP_TURN_MS));
  if(p>=1)return false;
  // Smoothstep has zero velocity at both ends, avoiding an abrupt flash.
  const eased=p*p*(3-2*p);
  c.save();c.globalAlpha=1-eased;c.drawImage(turn.image,0,0,width,height);c.restore();
  return true;
}
