/** Shared wagon silhouette for the village and world map. No simulation here. */
export function drawCaravanActor(c:CanvasRenderingContext2D,x:number,y:number,s:number,anim:number,moving:boolean,face:1|-1=1){
 c.save();c.translate(x,y);c.scale(s*face,s);const bob=moving?Math.sin(anim/110):0;
 c.strokeStyle='#292c28';c.lineWidth=2;for(const wx of [-9,9]){c.fillStyle='#62432b';c.beginPath();c.arc(wx,1,4,0,Math.PI*2);c.fill();c.stroke();const a=moving?anim/180:0;c.beginPath();c.moveTo(wx-Math.cos(a)*3,1-Math.sin(a)*3);c.lineTo(wx+Math.cos(a)*3,1+Math.sin(a)*3);c.stroke();}
 c.fillStyle='#946336';c.fillRect(-15,-11+bob,29,10);c.fillStyle='#dbc18a';c.beginPath();c.moveTo(-15,-11+bob);c.lineTo(-11,-23+bob);c.quadraticCurveTo(0,-29+bob,11,-23+bob);c.lineTo(15,-11+bob);c.fill();
 c.strokeStyle='#a38852';c.lineWidth=1;for(const wx of [-9,0,9]){c.beginPath();c.moveTo(wx,-12+bob);c.lineTo(wx*.75,-24+bob);c.stroke();}
 c.strokeStyle='#9a713d';c.lineWidth=2;c.beginPath();c.moveTo(14,-7);c.lineTo(25,-4);c.stroke();
 c.fillStyle='#c79c72';c.beginPath();c.arc(25,-18+bob,3,0,Math.PI*2);c.fill();c.fillStyle='#7b985c';c.fillRect(22,-15+bob,6,9);c.strokeStyle='#554733';c.beginPath();c.moveTo(24,-6);c.lineTo(22+(moving?Math.sin(anim/130)*3:0),1);c.moveTo(27,-6);c.lineTo(29-(moving?Math.sin(anim/130)*3:0),1);c.stroke();c.restore();
}
export function drawRaiderActor(c:CanvasRenderingContext2D,x:number,y:number,anim:number,fighting=false,count=3,color='#bd5b4b'){
 for(let n=0;n<Math.min(3,count);n++){const xx=x+(n-1)*8,yy=y+(n%2)*5,bob=Math.sin(anim/130+n)*2;c.fillStyle='#d3aa7b';c.beginPath();c.arc(xx,yy-17+bob,3,0,Math.PI*2);c.fill();c.fillStyle=color;c.fillRect(xx-3,yy-14+bob,6,9);c.strokeStyle='#e6d8ad';c.lineWidth=1.5;c.beginPath();c.moveTo(xx+5,yy-2);c.lineTo(xx+5+(fighting?Math.sin(anim/80)*8:0),yy-24);c.stroke();c.strokeStyle='#3e382c';c.beginPath();c.moveTo(xx-1,yy-5);c.lineTo(xx-3+bob,yy+1);c.moveTo(xx+1,yy-5);c.lineTo(xx+3-bob,yy+1);c.stroke();}
}
