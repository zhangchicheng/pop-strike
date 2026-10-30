import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { createWorld } from '../world.js';
import { createPlayerController, PLAYER } from '../physics.js';
import { enemyPositionBlocked } from '../navigation.js';
import { Room } from '../room.mjs';

const scene=new THREE.Scene(),world=createWorld(scene,{headless:true});scene.updateMatrixWorld(true);
function actor(x,z,y=0){const position={x,y:y+PLAYER.eye,z};return {position,controller:createPlayerController(position,world)};}
function run(a,seconds,input={},dt=1/60){for(let t=0;t<seconds-1e-8;t+=dt)a.controller.update(Math.min(dt,seconds-t),input);}
function clearBody(pos){const r=PLAYER.radius-.001,y=pos.y-PLAYER.eye;assert.ok(!world.colliders.some(b=>pos.x>b.min.x-r&&pos.x<b.max.x+r&&pos.z>b.min.z-r&&pos.z<b.max.z+r&&y<b.max.y-.001&&y+PLAYER.height>b.min.y+.001),'player intersects solid cargo');}
function close(actual,expected){assert.ok(Math.abs(actual-expected)<.003,`${actual} != ${expected}`);}
function hits(a,b){const origin=new THREE.Vector3(...a),target=new THREE.Vector3(...b);return new THREE.Raycaster(origin,target.clone().sub(origin).normalize(),0,origin.distanceTo(target)).intersectObjects(world.raycastMeshes,false);}
function walk(a,points,speed=4.8){for(const [x,z]of points){for(let i=0;i<1200;i++){const dx=x-a.position.x,dz=z-a.position.z,d=Math.hypot(dx,dz);if(d<.001)break;a.controller.update(Math.min(1/60,d/speed),{vx:dx/d*speed,vz:dz/d*speed});clearBody(a.position);}close(a.position.x,x);close(a.position.z,z);}}

test('stacked cargo interrupts ground and gallery sightlines, while the main tower approach stays open',()=>{
  for(const [a,b]of [
    [[-15,1.7,-1],[-5,1.7,-1]], [[-15,4.8,-1],[-5,4.8,-1]],
    [[5,1.7,16],[5,1.7,7]], [[5,5,16],[5,5,7]],
    [[14,1.7,-9],[5,1.7,-9]], [[13,6.3,-16.9],[7,1.7,-6]],
    [[-14,1.7,-11.5],[-9,1.7,-11.5]], [[13.3,1.7,16],[13.3,1.7,9]],
  ]){assert.ok(hits(a,b).length>0,`exposed sightline ${a} -> ${b}`);assert.ok(hits(b,a).length>0);}
  assert.equal(hits([0,1.7,17],[0,1.7,5]).length,0,'tower approach accidentally sealed');
});

test('open container supports walking and sprinting in both directions, with real bullet openings',()=>{
  for(const speed of [4.8,7.6]){
    const a=actor(5,3.5);walk(a,[[15.3,3.5],[5,3.5]],speed);close(a.position.y,PLAYER.eye);
  }
  assert.equal(hits([5,1.7,3.5],[15.3,1.7,3.5]).length,0);
  assert.equal(hits([15.3,1.7,3.5],[5,1.7,3.5]).length,0);
  assert.ok(hits([10.4,1.7,0],[10.4,1.7,7]).length>0,'side wall must stop bullets');
  for(let x=5;x<=15;x+=.25)assert.equal(enemyPositionBlocked(world,x,3.5),false,'AI cannot walk through the shortcut');
  const a=actor(10.4,3.5);run(a,1,{jump:true});assert.ok(a.position.y<=2.64-PLAYER.height+PLAYER.eye+.001);clearBody(a.position);
});

test('cargo steps can be climbed to the lower roof and its ladder reaches the top stack',()=>{
  for(const dt of [1/60,.04]){
    const a=actor(-9.9,8);
    run(a,2.5,{vz:-4.8,jump:true},dt);
    assert.ok(a.position.y>=2.8+PLAYER.eye-.01,`failed to reach container roof: ${JSON.stringify(a.position)}`);clearBody(a.position);
    // Approach and grab the ladder from the exposed lower roof.
    walk(a,[[-9.9,2.36]]);run(a,.5,{},dt);close(a.position.y,2.8+PLAYER.eye);
    assert.ok(a.controller.nearbyLadder());run(a,dt,{interact:true},dt);run(a,1.7,{forward:1},dt);
    close(a.position.y,5.6+PLAYER.eye);close(a.position.z,1.4);assert.ok(a.controller.motion.grounded);clearBody(a.position);
  }
});

test('ground ladder reaches the shortcut roof; stepping off falls back to the yard',()=>{
  const a=actor(10,5.76);run(a,1/60,{interact:true});run(a,1.6,{forward:1});
  close(a.position.y,2.8+PLAYER.eye);close(a.position.z,4.76);clearBody(a.position);
  run(a,1.4,{vz:4.8});run(a,1);close(a.position.y,PLAYER.eye);clearBody(a.position);
});

test('solid containers cannot be sprinted through and their roofs support landings',()=>{
  const a=actor(-6,-.8);run(a,2,{vx:-7.6});assert.ok(a.position.x>=-8.2+PLAYER.radius-.001);clearBody(a.position);
  const b=actor(4.8,11.3,8);run(b,2);close(b.position.y,5.6+PLAYER.eye);clearBody(b.position);
});

test('both flanks, building approaches and central lanes remain connected around cargo',()=>{
  const a=actor(0,17);
  walk(a,[[-18,17],[-18,10],[-15.8,10],[-15.8,-8],[-15.8,-16],[-1,-16],[-1,-21.5],[-1,-16],[3.2,-16],[3.2,-5],[3.2,3.5],[5,3.5],[15.3,3.5],[15.3,8.8],[20.5,8.8]]);
  const b=actor(0,17);walk(b,[[18,20]]);close(b.position.y,PLAYER.eye);
  const c=actor(0,17);walk(c,[[0,4.1],[-5,4.1],[-5,-5],[-5,-9.5]]);close(c.position.y,PLAYER.eye);
});

test('all solo and 4v4 spawn positions stay clear after the cargo refit',()=>{
  for(const p of [...world.spawnPoints,...world.upperSpawnPoints,new THREE.Vector3(0,0,17)])clearBody({x:p.x,y:p.y+PLAYER.eye,z:p.z});
  const room=new Room(world);for(let i=0;i<8;i++)room.add(`player${i}`);
  for(const p of room.players.values()){clearBody(p.position);assert.equal(enemyPositionBlocked(world,p.position.x,p.position.z,p.position.y-PLAYER.eye),false);}
});

test('LAN authoritative shots hit cargo walls and can pass through the open shortcut',()=>{
  const room=new Room(world),a=room.add('red'),b=room.add('blue');
  function fireFrom(from,to){a.position.set(...from);b.position.set(...to);a.yaw=Math.atan2(from[0]-to[0],from[2]-to[2]);a.pitch=0;a.cooldown=0;a.weaponCooldowns.fill(0);a.reload=0;a.protection=b.protection=0;b.health=100;room.shoot(a);}
  fireFrom([-15,1.7,-1],[-5,1.7,-1]);assert.equal(b.health,100);
  fireFrom([5,1.7,3.5],[15,1.7,3.5]);assert.ok(b.health<100);
});
