import test from 'node:test';
import assert from 'node:assert/strict';
import {visibleRadarTiles,radarScreenPoint} from '../src/radar-model.js';
test('world origin maps to the junction of the four central Sile tiles',()=>{assert.deepEqual(visibleRadarTiles(0,0,200).map(t=>[t.col,t.row]),[[11,11],[12,11],[11,12],[12,12]]);});
test('tile selection clamps map edges and rejects invalid ranges',()=>{assert.equal(visibleRadarTiles(6000,6000,200).length,1);assert.deepEqual(visibleRadarTiles(NaN,0,200),[]);assert.deepEqual(visibleRadarTiles(0,0,-1),[]);assert.deepEqual(visibleRadarTiles(20000,20000,200),[]);});
test('player is centered and north/east retain consistent minimap directions',()=>{const p={x:-2650,y:2092};assert.deepEqual(radarScreenPoint(p,p,200,200),{x:100,y:100});assert.deepEqual(radarScreenPoint({x:p.x+200,y:p.y+200},p,200,200),{x:200,y:0});});

import {rotateRadarPoint} from '../src/radar-model.js';
test('rotating radar keeps player centered and west-facing heading puts west ahead',()=>{
 const center=rotateRadarPoint({x:100,y:100},200,90);assert.deepEqual(center,{x:100,y:100});
 const west=rotateRadarPoint({x:20,y:100},200,90);assert.ok(Math.abs(west.x-100)<1e-8);assert.ok(Math.abs(west.y-20)<1e-8);
 const north=rotateRadarPoint({x:100,y:20},200,90);assert.ok(Math.abs(north.x-180)<1e-8);assert.ok(Math.abs(north.y-100)<1e-8);
 assert.deepEqual(rotateRadarPoint({x:120,y:80},200,0),{x:120,y:80});
});
