import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { createStickman, playerPoseSeed } from '../enemy.js';
import { NOSTALGOS12 as colors } from '../palette.js';

const worldPoint = new THREE.Vector3();
const joints = ['Right wrist','Left wrist','Right ankle','Left ankle'];
const pose = rig => joints.flatMap(name=>rig.group.getObjectByName(name).getWorldPosition(new THREE.Vector3()).toArray());

test('cloth bends relative to the head, stays pinned at the knot, and owns its deforming geometry', () => {
  const a=createStickman({headbandColor:colors.gold}),b=createStickman({headbandColor:colors.gold});
  try {
    const tail=a.group.getObjectByName('Headband tail 1'),other=b.group.getObjectByName('Headband tail 1');
    assert.notEqual(tail.geometry,other.geometry);
    const initial=Array.from(tail.geometry.attributes.position.array),untouched=Array.from(other.geometry.attributes.position.array);
    const tip=initial.reduce((best,_,i)=>i%3===0&&Math.hypot(initial[i],initial[i+1])>Math.hypot(initial[best],initial[best+1])?i:best,0);
    let low=Infinity,high=-Infinity;
    for(let f=0;f<180;f++){
      a.animate(1/60,{speed:3.6,turn:Math.sin(f*.08)*3,localStrafe:.5,localForward:.8});
      const p=tail.geometry.attributes.position.array;
      low=Math.min(low,p[tip+2]);high=Math.max(high,p[tip+2]);
      for(let i=0;i<initial.length;i+=3)if(Math.hypot(initial[i],initial[i+1])<.04)assert.deepEqual(Array.from(p.slice(i,i+3)),initial.slice(i,i+3));
    }
    assert.ok(high-low>.065,'running ribbon tip barely fluttered');
    assert.deepEqual(Array.from(other.geometry.attributes.position.array),untouched,'one soldier bent another soldier\'s cloth');
    assert.ok(!a.body.includes(tail),'cosmetic cloth became a hit target');
    let disposed=0;tail.geometry.addEventListener('dispose',()=>disposed++);a.dispose();a.dispose();assert.equal(disposed,1);
  } finally { a.dispose();b.dispose(); }
});

test('seeded falls give varied, bounded limb poses and leave all body and cloth vertices above the floor', () => {
  const poses=[];
  for(let seed=1;seed<=8;seed++)for(let d=0;d<4;d++){
    const rig=createStickman({index:seed,headbandColor:colors.coral,poseSeed:seed*137});
    try {
      for(let f=0;f<30;f++)rig.animate(1/60,{speed:3.5,aim:.4});
      const direction=new THREE.Vector3(Math.cos(d*Math.PI/2),0,Math.sin(d*Math.PI/2));
      let settled=false;
      for(let f=0;f<100;f++){
        settled=rig.fall(1/60,{direction});rig.group.updateMatrixWorld(true);
        const checked=[...rig.body];rig.group.getObjectByName('Headband tie').traverse(m=>{if(m.isMesh)checked.push(m)});
        for(const mesh of checked){
          const p=mesh.geometry.attributes.position;
          for(let i=0;i<p.count;i++){
            worldPoint.fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld);
            assert.ok(Number.isFinite(worldPoint.y)&&worldPoint.y>=-.001,`seed ${seed}, direction ${d}, ${mesh.name||mesh.geometry.type} crossed floor at ${worldPoint.y}`);
          }
        }
        for(const [upper,lower,end,lengthA,lengthB] of [['Right upper arm','Right forearm','Right wrist',.335,.325],['Left thigh','Left shin','Left ankle',.465,.475]]){
          const a=rig.group.getObjectByName(upper).getWorldPosition(new THREE.Vector3()),b=rig.group.getObjectByName(lower).getWorldPosition(new THREE.Vector3()),c=rig.group.getObjectByName(end).getWorldPosition(new THREE.Vector3());
          assert.ok(Math.abs(a.distanceTo(b)-lengthA)<1e-5&&Math.abs(b.distanceTo(c)-lengthB)<1e-5,'fall stretched a limb');
        }
      }
      assert.ok(settled);if(d===0)poses.push(pose(rig));
      const end=pose(rig);for(let f=0;f<30;f++)rig.fall(1/60,{direction});rig.group.updateMatrixWorld(true);
      assert.ok(pose(rig).every((v,i)=>Math.abs(v-end[i])<1e-6),'settled corpse kept twitching');
    } finally { rig.dispose(); }
  }
  assert.equal(new Set(poses.map(p=>p.map(v=>v.toFixed(2)).join(','))).size,8,'different seeds produced one repeated pose');
});

test('a LAN life selects a reproducible pose; a new life selects another pose', () => {
  const seed=playerPoseSeed('3',5);assert.notEqual(seed,playerPoseSeed('3',6));
  const rigs=[createStickman({poseSeed:seed}),createStickman({poseSeed:seed})];
  try {
    for(const [i,rig] of rigs.entries())for(let t=0;t<2;t+=i?.04:1/60)rig.fall(i?.04:1/60,{direction:new THREE.Vector3(0,0,1)});
    rigs.forEach(r=>r.group.updateMatrixWorld(true));assert.ok(pose(rigs[0]).every((v,i)=>Math.abs(v-pose(rigs[1])[i])<1e-6));
  } finally { rigs.forEach(r=>r.dispose()); }
});
