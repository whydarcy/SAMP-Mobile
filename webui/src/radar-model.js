export const RADAR_WORLD_SIZE=12000;
export const RADAR_TILE_WORLD=500;
export function visibleRadarTiles(x,y,range){
 if(![x,y,range].every(Number.isFinite)||range<=0||range>2000)return [];
 const result=[];
 for(let row=Math.max(0,Math.floor((6000-y-range)/500));row<=Math.min(23,Math.floor((6000-y+range)/500));row++)
  for(let col=Math.max(0,Math.floor((x+6000-range)/500));col<=Math.min(23,Math.floor((x+6000+range)/500));col++)result.push({col,row,x:col*500-6000,y:6000-row*500});
 return result;
}
export function radarScreenPoint(point,player,size,range){return {x:size/2+(point.x-player.x)*size/(2*range),y:size/2+(player.y-point.y)*size/(2*range)};}

export function rotateRadarPoint(point,size,heading){const angle=heading*Math.PI/180,dx=point.x-size/2,dy=point.y-size/2;return {x:size/2+dx*Math.cos(angle)-dy*Math.sin(angle),y:size/2+dx*Math.sin(angle)+dy*Math.cos(angle)};}
