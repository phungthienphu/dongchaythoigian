export type ScreenPoint = { x: number; y: number };
export type SelectionDrag = { pointerId: number; start: ScreenPoint; end: ScreenPoint; additive: boolean };
export const selectionMoved = (box: SelectionDrag) => Math.hypot(box.end.x-box.start.x,box.end.y-box.start.y)>=6;
export function inSelection(box: SelectionDrag, point: ScreenPoint) {
  return point.x>=Math.min(box.start.x,box.end.x)&&point.x<=Math.max(box.start.x,box.end.x)
    &&point.y>=Math.min(box.start.y,box.end.y)&&point.y<=Math.max(box.start.y,box.end.y);
}
export function drawSelectionBox(ctx: CanvasRenderingContext2D, box: SelectionDrag | null) {
  if(!box||!selectionMoved(box))return;
  const x=Math.min(box.start.x,box.end.x),y=Math.min(box.start.y,box.end.y),w=Math.abs(box.end.x-box.start.x),h=Math.abs(box.end.y-box.start.y);
  ctx.save();ctx.fillStyle='rgba(78,177,198,.16)';ctx.strokeStyle='#a4e5ee';ctx.lineWidth=1.5;
  ctx.fillRect(x,y,w,h);ctx.setLineDash([6,3]);ctx.strokeRect(x+.5,y+.5,w,h);ctx.restore();
}
