import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { Room } from '../room.mjs';
import { WEAPONS, createAmmo } from '../weapons.js';
import { createWeaponModel } from '../weapon-models.js';
import { createStickman } from '../enemy.js';

function setup() {
  const world={colliders:[],ladders:[],raycastMeshes:[],bounds:{minX:-150,maxX:150,minZ:-150,maxZ:150},spawnPoints:[new THREE.Vector3(0,0,10),new THREE.Vector3(0,0,-10)]};
  const events=[],room=new Room(world,e=>events.push(e)),a=room.add('A'),b=room.add('B');
  a.position.set(0,1.7,10);b.position.set(0,1.7,-10);a.protection=b.protection=0;a.yaw=Math.PI/2;
  const send=message=>room.input(a.id,{life:a.life,...message});
  const advance=(seconds,held=false)=>{for(let t=0;t<seconds-1e-8;t+=1/60){send({type:'input',shooting:held,yaw:a.yaw,pitch:a.pitch,aim:true});room.step(Math.min(1/60,seconds-t));}};
  return {room,a,b,send,advance,events,world};
}

test('all six slots reload repeatedly, keep separate magazines, and reset on respawn',()=>{
  const {room,a,send,advance}=setup();assert.deepEqual(a.ammo,[30,6,30,5,7,6]);
  for(let index=0;index<WEAPONS.length;index++){
    const w=WEAPONS[index];send({type:'weapon',weapon:index});advance(.23);
    for(let cycle=0;cycle<2;cycle++){
      send({type:'fire'});assert.equal(a.ammo[index],w.capacity-1);
      send({type:'reload'});assert.equal(a.reload,w.reload);
      send({type:'fire'});assert.equal(a.ammo[index],w.capacity-1);
      advance(w.reload+.02);assert.equal(a.reload,0);assert.equal(a.ammo[index],w.capacity);
    }
    send({type:'fire'});assert.equal(a.ammo[index],w.capacity-1);
  }
  assert.deepEqual(a.ammo,createAmmo().map(n=>n-1));
  const slot=a.weapon;for(const weapon of [-1,6,99,1.5,'3',null])send({type:'weapon',weapon});assert.equal(a.weapon,slot);
  room.spawn(a);assert.deepEqual(a.ammo,createAmmo());assert.equal(a.weapon,0);
});

test('automatic guns repeat while held; single-shot weapons require a trigger release',()=>{
  for(let index=0;index<WEAPONS.length;index++){
    const {a,send,advance}=setup(),w=WEAPONS[index];send({type:'weapon',weapon:index});advance(.23);
    advance(w.interval*2.5,true);
    assert.equal(a.ammo[index],w.capacity-(w.automatic?3:1),w.type);
    if(!w.automatic){advance(.02);advance(.05,true);assert.equal(a.ammo[index],w.capacity-2,w.type);}
  }
});

test('switching cannot bypass a bolt cycle; reload cancellation preserves the partial magazine',()=>{
  const {a,send,advance}=setup();send({type:'weapon',weapon:3});advance(.23);send({type:'fire'});
  send({type:'reload'});advance(.1);send({type:'weapon',weapon:0});assert.equal(a.reload,0);assert.equal(a.ammo[3],4);
  advance(.23);send({type:'weapon',weapon:3});advance(.23);send({type:'fire'});assert.equal(a.ammo[3],4);
  advance(.60);send({type:'fire'});assert.equal(a.ammo[3],3);
});

test('scoped sniper hits a distant head, body needs a follow-up, and walls stop the shot',()=>{
  for(const target of ['head','body','wall','range']){
    const {a,b,room,world,send,advance,events}=setup();
    send({type:'weapon',weapon:3});advance(.23);a.position.set(0,target==='body'?1.05:1.7,40);b.position.set(0,1.7,target==='range'?-100:-40);a.yaw=0;
    let wall;
    if(target==='wall'){wall=new THREE.Mesh(new THREE.BoxGeometry(10,5,.2),new THREE.MeshBasicMaterial());wall.position.y=2.5;wall.updateMatrixWorld(true);world.raycastMeshes.push(wall);}
    send({type:'input',aim:true,yaw:0,shooting:true});send({type:'fire'});
    assert.equal(b.health,target==='head'?0:target==='body'?15:100,target);
    if(target==='head'){assert.equal(room.scores.red,1);assert.equal(events.find(e=>e.type==='kill').headshot,true);}
    if(wall){wall.geometry.dispose();wall.material.dispose();}
  }
});

test('shotgun emits nine pellets; SMG, hand cannon and revolver apply their own damage',()=>{
  for(const [index,expected]of [[2,22],[4,55],[5,62]]){
    const {a,b,send,advance}=setup();send({type:'weapon',weapon:index});advance(.23);
    a.position.set(0,1.05,4);b.position.set(0,1.7,-4);send({type:'input',yaw:0,aim:true});send({type:'fire'});assert.equal(b.health,100-expected);
  }
  const {send,advance,events}=setup();send({type:'weapon',weapon:1});advance(.23);send({type:'fire'});
  assert.equal(events.find(e=>e.type==='shot').ends.length,9);
});

test('all equipped third-person models keep hands attached during aiming, cycling and reloads',()=>{
  const rig=createStickman();
  try{for(let weapon=0;weapon<WEAPONS.length;weapon++){
    rig.setWeapon(weapon);assert.equal(rig.group.userData.weapon,weapon);
    assert.ok(rig.group.getObjectByName(WEAPONS[weapon].type));
    for(let frame=0;frame<120;frame++){
      rig.animate(1/60,{speed:frame<40?3.6:0,aim:1,shot:frame===40?1:0,reload:frame>60?(frame-60)/60:0});rig.group.updateMatrixWorld(true);
      for(const [hand,grip]of [['Right hand','Trigger grip'],['Left hand','Fore-end support']]){
        const p=rig.group.getObjectByName(hand).getWorldPosition(new THREE.Vector3()),q=rig.group.getObjectByName(grip).getWorldPosition(new THREE.Vector3());
        assert.ok(p.distanceTo(q)<.0001,`${WEAPONS[weapon].type}: ${hand} left its grip`);
      }
    }
  }}finally{rig.dispose();}
});

test('weapon moving parts return to rest and shared resources survive another model disposal',()=>{
  const models=WEAPONS.map(w=>createWeaponModel(w.type,{arms:true}));
  const duplicate=createWeaponModel('sniper',{detail:false});
  try{
    models.forEach(m=>{m.fire();m.update(.3,{reload:.5});m.update(3);m.group.updateMatrixWorld(true);m.group.traverse(o=>assert.ok([...o.matrixWorld.elements].every(Number.isFinite)));});
    assert.equal(models[4].group.getObjectByName('Slide').position.z,0);
    assert.equal(models[1].group.getObjectByName('Cartridge').visible,false);
    const geometry=duplicate.group.children.find(m=>m.isMesh).geometry;let disposed=0;geometry.addEventListener('dispose',()=>disposed++);
    models.forEach(m=>m.dispose());assert.equal(disposed,0);duplicate.dispose();assert.equal(disposed,1);
  }finally{models.forEach(m=>m.dispose());duplicate.dispose();}
});
