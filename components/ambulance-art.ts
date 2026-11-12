/** Feet-centered ambulance. The projected route heading rotates the whole vehicle. */
export function drawAmbulance(c:CanvasRenderingContext2D,x:number,y:number,scale:number,heading:number,aid:boolean){
 c.save();c.translate(x,y);c.scale(scale,scale);c.rotate(heading);
 c.fillStyle='#12291f44';c.beginPath();c.ellipse(0,3,17,8,0,0,Math.PI*2);c.fill();
 c.fillStyle='#263e46';for(const [wx,wy]of [[-9,-7],[9,-7],[-9,7],[9,7]]){c.beginPath();c.ellipse(wx,wy,4,2.8,0,0,Math.PI*2);c.fill();}
 c.fillStyle='#ccd9d1';c.fillRect(-16,-7,31,13);c.fillStyle='#f9f5de';c.fillRect(-14,-10,21,13);
 c.fillStyle='#eae8d8';c.beginPath();c.moveTo(7,-8);c.lineTo(15,-5);c.lineTo(15,5);c.lineTo(7,3);c.closePath();c.fill();
 c.fillStyle='#629db2';c.fillRect(8,-5,5,5);c.fillStyle='#bd473d';c.fillRect(-7,-8,3,9);c.fillRect(-10,-5,9,3);c.fillRect(-15,4,28,2);
 c.fillStyle=aid?'#f6d871':'#78d0ed';c.fillRect(3,-11,4,3);c.fillStyle='#fff5bb';c.fillRect(14,-4,2,2);c.fillRect(14,3,2,2);c.restore();
}
