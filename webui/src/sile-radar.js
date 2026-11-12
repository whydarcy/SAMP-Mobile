import {visibleRadarTiles,radarScreenPoint,rotateRadarPoint} from './radar-model.js';
export function createSileRadar({bridge,openMap,refreshHitRegions}){
 let state={},root=null,canvas=null,zoom=1,ready=false,draws=0,loadedTiles=0,lastFrame=0,bearing=0;
 const images=new Map(),icons=new Map();
 function image(key,url,map=images){if(map.has(key))return map.get(key);const img=new Image();img.decoding='async';img.src=url;map.set(key,img);img.onload=()=>{if(map===images)loadedTiles++;};if(map.size>96)map.delete(map.keys().next().value);return img;}
 function mount(){
  const target=document.querySelector('.hud-hassle-radar__map:not(.hud-hassle-radar__map_hidden) .hud-hassle-map')||document.querySelector('.hud-hassle-map');if(!target)return false;if(target===root&&canvas?.isConnected)return true;
  root=target;root.classList.add('gta-cef-map');root.dataset.gtaHit='';for(const node of root.querySelectorAll('.gta-cef-map-open,.gta-cef-map-controls'))node.remove();
  const open=document.createElement('button');open.className='gta-cef-map-open';open.setAttribute('aria-label','Открыть карту');canvas=document.createElement('canvas');canvas.className='gta-cef-map-canvas';open.append(canvas);open.onclick=e=>{e.stopPropagation();openMap();};root.append(open);
  requestAnimationFrame(refreshHitRegions);return true;
 }
 function screen(point,size,range){return rotateRadarPoint(radarScreenPoint(point,state.position,size,range),size,bearing);}
 function marker(ctx,m,size,range){
  const p=screen(m,size,range);if(Math.hypot(p.x-size/2,p.y-size/2)>size*.45)return;
  if(m.icon>0&&m.icon<149){const img=image(m.icon,'/assets/sile-cache/images/gps/'+m.icon+'.png',icons);if(img.complete&&img.naturalWidth){ctx.drawImage(img,p.x-7,p.y-7,14,14);return;}}
  ctx.beginPath();ctx.arc(p.x,p.y,3.5,0,Math.PI*2);ctx.fillStyle='#ffd362';ctx.fill();ctx.strokeStyle='#15151a';ctx.lineWidth=1.5;ctx.stroke();
 }
 function destination(ctx,m,width,range){const p=screen(m,width,range),dx=p.x-width/2,dy=p.y-width/2,d=Math.hypot(dx,dy),r=width*.42,x=width/2+dx*Math.min(1,r/Math.max(1,d)),y=width/2+dy*Math.min(1,r/Math.max(1,d));ctx.beginPath();ctx.arc(x,y,6,0,Math.PI*2);ctx.lineWidth=2;ctx.strokeStyle='#111';ctx.fillStyle='#f4bf19';ctx.fill();ctx.stroke();}
 function draw(time){
  requestAnimationFrame(draw);if(time-lastFrame<33)return;lastFrame=time;
  if(!state.connected||!state.playerReady||!state.position||!document.body.classList.contains('gta-active')||document.body.classList.contains('gta-modal')||!mount())return;
  const width=root.getBoundingClientRect().width;if(width<10)return;
  const target=Number(state.heading)||0;bearing+=(((target-bearing)%360+540)%360-180)*.4;
  const ratio=Math.min(2,devicePixelRatio||1),pixels=Math.round(width*ratio);if(canvas.width!==pixels){canvas.width=pixels;canvas.height=pixels;}
  const ctx=canvas.getContext('2d'),range=(state.inVehicle?Math.min(420,240+(state.speed||0)):200)*zoom;
  ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,width,width);ctx.save();ctx.beginPath();ctx.arc(width/2,width/2,width/2,0,Math.PI*2);ctx.clip();ctx.fillStyle='#183f53';ctx.fillRect(0,0,width,width);ctx.save();ctx.translate(width/2,width/2);ctx.rotate(bearing*Math.PI/180);ctx.translate(-width/2,-width/2);
  let tiles=0;
  if(!state.interior)for(const tile of visibleRadarTiles(state.position.x,state.position.y,range)){
   const img=image(tile.col+'_'+tile.row,'/assets/sile-cache/images/hud/map/'+tile.col+'_'+tile.row+'.png');if(img.complete&&img.naturalWidth){const p=radarScreenPoint(tile,state.position,width,range),span=500*width/(2*range);ctx.drawImage(img,p.x,p.y,span+.5,span+.5);tiles++;}
  }
  ctx.restore();for(const m of state.markers||[])marker(ctx,m,width,range);if(state.checkpoint)destination(ctx,state.checkpoint,width,range);if(state.waypoint)destination(ctx,state.waypoint,width,range);
  ctx.save();ctx.translate(width/2,width/2);ctx.beginPath();ctx.moveTo(0,-10);ctx.lineTo(7,8);ctx.lineTo(0,4);ctx.lineTo(-7,8);ctx.closePath();ctx.fillStyle='#fff';ctx.fill();ctx.strokeStyle='#182027';ctx.lineWidth=1.5;ctx.stroke();ctx.restore();
  const north=rotateRadarPoint({x:width/2,y:width*.1},width,bearing);ctx.font='bold 10px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineWidth=3;ctx.strokeStyle='#182027';ctx.strokeText('N',north.x,north.y);ctx.fillStyle='#eee9d8';ctx.fillText('N',north.x,north.y);ctx.restore();draws++;
  if(!ready&&(tiles>0||state.interior)){ready=true;bridge.emit('Ui.RadarReady',{active:true});}
 }
 requestAnimationFrame(draw);
 return {update(value){state=value;},getState(){return {ready,draws,loadedTiles,zoom,markers:(state.markers||[]).length,visible:!!canvas?.isConnected&&!!state.playerReady,source:'pc-radar',bearing,shape:'circle'};}};
}
