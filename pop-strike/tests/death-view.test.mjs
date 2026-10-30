import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { DeathView, clipDeathCamera } from '../death-view.js';
import { Room } from '../room.mjs';

const solid = (min,max) => new THREE.Box3(new THREE.Vector3(...min),new THREE.Vector3(...max));
const world = (colliders=[]) => ({colliders,bounds:{minX:-30,maxX:30,minZ:-30,maxZ:30},ladders:[],raycastMeshes:[],spawnPoints:[new THREE.Vector3(0,0,8),new THREE.Vector3(0,0,-8)]});

test('death camera volume stops before walls, corners and the underside of a ceiling',()=>{
  const focus=new THREE.Vector3(0,.5,0);
  for(const [obstacles,target] of [
    [[solid([-5,0,1],[5,4,1.3])],new THREE.Vector3(0,2,4)],
    [[solid([1,0,-5],[1.3,4,5]),solid([-5,0,1],[5,4,1.3])],new THREE.Vector3(4,2,4)],
    [[solid([-5,2.5,-5],[5,2.8,5])],new THREE.Vector3(0,4,3)],
  ]){
    const point=clipDeathCamera(focus,target,obstacles);
    assert.ok(point.distanceTo(focus)<target.distanceTo(focus));
    for(const wall of obstacles)assert.equal(wall.clone().expandByScalar(.17).containsPoint(point),false);
    assert.ok(point.y>.18);
  }
});

test('local corpse falls, camera sees it above the gallery floor, and reset removes it',()=>{
  const floor=solid([-8,3.7,-8],[8,3.9,8]),ceiling=solid([-8,6.8,-8],[8,7,8]);
  const scene=new THREE.Scene(),view=new DeathView(scene,world([floor,ceiling])),camera=new THREE.PerspectiveCamera(73,1,.07,150);
  camera.position.set(0,5.6,0);camera.rotation.order='YXZ';camera.updateMatrixWorld(true);
  view.begin({position:camera.position.clone(),yaw:0,weapon:3,source:[0,5.6,-4]},camera);
  for(let i=0;i<90;i++){
    view.update(1/60,camera);
    assert.ok([...camera.position,...camera.quaternion].every(Number.isFinite));
    assert.ok(camera.position.y>4.08&&camera.position.y<6.63);
  }
  assert.ok(Math.abs(view.rig.group.position.y-3.9)<.001);assert.equal(view.rig.group.visible,true);
  const head=view.rig.body.find(m=>m.userData.headshot);view.rig.group.updateMatrixWorld(true);
  assert.ok(head.getWorldPosition(new THREE.Vector3()).y<4.5,'corpse remained upright');
  const projected=view.focus().project(camera);assert.ok(Math.abs(projected.x)<.15&&projected.y>.1&&projected.y<.5,'corpse must stay visible above the countdown');
  view.reset();view.reset();assert.equal(scene.children.length,0);assert.equal(view.active,false);
});

test('a death in the air lands on the ground and does not mutate the live player or camera after reset',()=>{
  const scene=new THREE.Scene(),view=new DeathView(scene,world()),camera=new THREE.PerspectiveCamera(),position=new THREE.Vector3(0,5,0);
  camera.position.copy(position);view.begin({position,yaw:1,weapon:4},camera);
  for(let i=0;i<150;i++)view.update(.016,camera);
  assert.equal(position.y,5);assert.ok(Math.abs(view.rig.group.position.y)<.001);assert.ok(camera.position.y>.18);
  view.reset();camera.position.set(8,1.7,8);view.update(.1,camera);assert.deepEqual(camera.position.toArray(),[8,1.7,8]);
});

test('the fall completes before respawn at both 60 FPS and 5 FPS',()=>{
  const poses=[];
  for(const dt of [1/60,.2]){
    const scene=new THREE.Scene(),view=new DeathView(scene,world()),camera=new THREE.PerspectiveCamera();camera.position.set(0,1.7,0);
    view.begin({position:camera.position.clone(),yaw:0,poseSeed:4817},camera);
    for(let t=0;t<1.2-1e-8;t+=dt)view.update(dt,camera);
    view.rig.group.updateMatrixWorld(true);
    const head=view.rig.body.find(m=>m.userData.headshot).getWorldPosition(new THREE.Vector3());
    assert.ok(head.y<.6,'fall did not finish at low FPS');assert.equal(view.rig.group.visible,true);
    poses.push(head);view.reset();
  }
  assert.ok(poses[0].distanceTo(poses[1])<.001);
});

test('authoritative death metadata survives killer departure and clears only on respawn',()=>{
  const events=[],room=new Room(world(),event=>events.push(event)),a=room.add('攻击者'),b=room.add('受击者');
  a.position.set(0,1.7,4);b.position.set(0,1.7,-4);a.protection=b.protection=0;a.yaw=0;a.weapon=3;a.input.aim=true;
  room.shoot(a);assert.equal(b.health,0);assert.equal(b.respawn,3);
  const event=events.find(e=>e.type==='kill');assert.equal(event.weapon,3);assert.equal(event.killerTeam,'red');assert.equal(event.victimTeam,'blue');assert.equal(event.victimLife,b.life);
  const death=room.snapshot().players.find(p=>p.id===b.id).death;assert.equal(death.killerName,'攻击者');assert.equal(death.headshot,true);
  death.source[0]=999;assert.equal(b.death.source[0],0,'snapshot shares mutable source position');
  room.remove(a.id);assert.equal(room.snapshot().players[0].death.killerName,'攻击者');
  room.step(1);assert.equal(b.respawn,2);room.step(1);assert.equal(b.respawn,1);room.step(1);
  assert.equal(b.health,100);assert.equal(b.death,null);assert.equal(room.snapshot().players[0].death,null);
});

test('round-winning elimination keeps the death report during intermission and resets next round',()=>{
  const room=new Room(world(),()=>{},{killLimit:1,intermission:2}),a=room.add('A'),b=room.add('B');
  a.position.set(0,1.7,4);b.position.set(0,1.7,-4);a.protection=b.protection=0;a.yaw=0;a.weapon=3;a.input.aim=true;
  room.shoot(a);assert.equal(room.phase,'finished');room.step(1);assert.equal(b.health,0);assert.ok(b.death);
  room.step(1);assert.equal(room.phase,'playing');assert.equal(b.health,100);assert.equal(b.death,null);
});
