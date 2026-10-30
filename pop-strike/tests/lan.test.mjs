import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import * as THREE from '../vendor/three.module.js';
import { Room } from '../room.mjs';
import { createWorld } from '../world.js';
import { acceptWebSocket } from '../websocket.mjs';

const bounds = { minX: -24.2, maxX: 24.2, minZ: -24.2, maxZ: 24.2 };
const emptyWorld = () => ({ colliders: [], bounds, ladders: [], raycastMeshes: [], spawnPoints: [new THREE.Vector3(-10, 0, 0), new THREE.Vector3(10, 0, 0)] });
function duel(world = emptyWorld(), rules = {}) {
  const events = [], room = new Room(world, e => events.push(e), rules), a = room.add('甲'), b = room.add('乙');
  a.position.set(0, 1.7, 4); b.position.set(0, 1.7, -4); a.yaw = b.yaw = 0; a.protection = b.protection = 0;
  return { room, a, b, events };
}
function command(room, id, message) { room.input(id, { life: room.players.get(id)?.life, ...message }); }
function advance(room, seconds, inputs = []) {
  for (let t = 0; t < seconds - 1e-8; t += 1 / 60) { for (const [id, input] of inputs) command(room,id, { type: 'input', ...input }); room.step(Math.min(1 / 60, seconds - t)); }
}

test('rooms cap admission, sanitize names, wait for opponents and restart rounds', () => {
  const room = new Room(emptyWorld(), () => {}, { duration: .1, intermission: .1 });
  const a = room.add('A\n\u202e<script>'); assert.equal(a.name, 'A<script>'); assert.equal(room.phase, 'waiting');
  room.add('B'); assert.equal(room.phase, 'playing'); assert.equal(room.round, 1);
  for (let i = 0; i < 6; i++) assert.ok(room.add(`P${i}`)); assert.equal(room.add('full'), null);
  advance(room, .12); assert.equal(room.phase, 'finished'); assert.equal(room.winners.length, 2);
  advance(room, .12); assert.equal(room.phase, 'playing'); assert.equal(room.round, 2);
  for (const p of [...room.players.values()]) if (p !== a) room.remove(p.id);
  assert.equal(room.phase, 'waiting'); assert.equal(room.players.size, 1);
});

test('server movement clamps controls, ignores supplied coordinates and stops stale input', () => {
  const { room, a } = duel();
  command(room,a.id, { type: 'input', forward: 500, strafe: NaN, yaw: Infinity, pitch: 'bad', position: [999,999,999], health: 999 });
  advance(room, .2); assert.ok(Math.abs(a.position.z - 3.04) < .001); assert.equal(a.health, 100);
  advance(room, 1); const z = a.position.z; advance(room, 1); assert.equal(a.position.z, z);
  assert.ok(Number.isFinite(a.yaw)); assert.equal(a.pitch, 0);
  a.position.set(0, 1.7, 4);
  advance(room, 1, [[a.id, { forward: 1, strafe: 1 }]]);
  assert.ok(Math.abs(Math.hypot(a.position.x, a.position.z - 4) - 4.8) < .001, 'diagonal movement must not be faster');
});

test('shots are server traced, walls block bullets, and forged hits cannot deal damage', () => {
  const world = emptyWorld(), wall = new THREE.Mesh(new THREE.BoxGeometry(8, 5, .2), new THREE.MeshBasicMaterial());
  wall.position.set(0, 2.5, 0); wall.updateMatrixWorld(true); world.raycastMeshes.push(wall);
  const { room, a, b } = duel(world);
  command(room,a.id, { type: 'hit', target: b.id, damage: 999 }); command(room,a.id, { type: 'fire', origin: [0,1.7,-3], target: b.id });
  assert.equal(b.health, 100); assert.equal(a.ammo[0], 29);
  world.raycastMeshes.length = 0; advance(room, .12); command(room,a.id, { type: 'fire' }); assert.equal(b.health, 32);
  wall.geometry.dispose(); wall.material.dispose();
});

test('fire cadence, ammo, reloads and weapon switching remain authoritative', () => {
  const { room, a } = duel(); a.yaw = Math.PI / 2;
  for (let i = 0; i < 100; i++) command(room,a.id, { type: 'fire' }); assert.equal(a.ammo[0], 29);
  command(room,a.id, { type: 'reload' }); assert.equal(a.reload, 1.35);
  advance(room, .5); command(room,a.id, { type: 'fire' }); assert.equal(a.ammo[0], 29);
  command(room,a.id, { type: 'weapon', weapon: 1 }); assert.equal(a.reload, 0); assert.equal(a.weapon, 1);
  advance(room, .25); command(room,a.id, { type: 'fire' }); assert.equal(a.ammo[1], 5);
  command(room,a.id, { type: 'reload' }); advance(room, 1.81); assert.equal(a.ammo[1], 6); assert.equal(a.reload, 0);
  command(room,a.id, { type: 'input', shooting: false }); command(room,a.id, { type: 'fire' }); assert.equal(a.ammo[1],5); command(room,a.id, { type: 'reload' }); advance(room, 1.81); assert.equal(a.ammo[1], 6);
  command(room,a.id, { type: 'weapon', weapon: 0 }); advance(room, 6, [[a.id, { yaw: Math.PI / 2, shooting: true }]]);
  assert.ok(a.ammo[0] > 0 && a.ammo[0] < 30, 'empty magazine automatically reloads and resumes fire');
});

test('kills count once, dead players cannot fire, respawn resets inventory and grants protection', () => {
  const { room, a, b, events } = duel(); const life = b.life;
  room.shoot(a); advance(room, .12); room.shoot(a);
  assert.equal(b.health, 0); assert.equal(a.kills, 1); assert.equal(b.deaths, 1);
  assert.equal(events.filter(e => e.type === 'kill').length, 1);
  const ammo = b.ammo[0]; room.shoot(b); assert.equal(b.ammo[0], ammo);
  advance(room, 3.01); assert.equal(b.health, 100); assert.equal(b.life, life + 1); assert.ok(b.protection > 0);
  a.position.set(0,1.7,4); b.position.set(0,1.7,-4); a.yaw = 0; room.shoot(a); assert.equal(b.health,100);
  room.shoot(b); assert.equal(b.protection, 0, 'firing cancels spawn protection');
});

test('score limit freezes combat, announces winner and resets everyone for the next round', () => {
  const { room, a, b } = duel(emptyWorld(), { killLimit: 1, intermission: .2 });
  room.shoot(a); advance(room, .12); room.shoot(a); assert.equal(room.phase, 'finished'); assert.deepEqual(room.winners, ['红队']);
  const ammo = a.ammo[0]; advance(room, .1, [[a.id, { shooting: true }]]); assert.equal(a.ammo[0], ammo);
  advance(room, .12); assert.equal(room.phase, 'playing'); assert.equal(a.kills, 0); assert.equal(b.deaths, 0); assert.equal(b.health, 100);
});

test('headless host uses the actual map, climbs the armory stairs and crosses the upper gallery', () => {
  const scene = new THREE.Scene(), world = createWorld(scene, { headless: true }); scene.updateMatrixWorld(true);
  const room = new Room(world), p = room.add('climber'); p.position.set(0, 1.7, 17);
  advance(room, 3.75, [[p.id, { strafe: -1, yaw: 0 }]]);
  advance(room, 3.55, [[p.id, { forward: 1, yaw: 0 }]]); assert.ok(Math.abs(p.position.y - 5.6) < .002);
  advance(room, 3.52, [[p.id, { forward: 1, yaw: 0 }]]); assert.ok(Math.abs(p.position.y - 6.3) < .002);
  advance(room, 3.75, [[p.id, { strafe: 1, yaw: 0 }]]); assert.ok(Math.abs(p.position.x) < .002); assert.ok(Math.abs(p.position.y - 6.3) < .002);
});

class Socket extends EventEmitter {
  constructor() { super(); this.writes = []; this.writableLength = 0; }
  write(data) { this.writes.push(data); }
  setNoDelay() {}
  end(data) { if (data) this.write(data); this.ended = true; }
  destroy() { this.destroyed = true; this.emit('close'); }
}
function masked(text, { opcode = 1, fin = true } = {}) {
  const data = Buffer.from(text), mask = Buffer.from([1,2,3,4]), header = Buffer.alloc(data.length < 126 ? 2 : 4);
  header[0] = (fin ? 128 : 0) | opcode; header[1] = 128 | (data.length < 126 ? data.length : 126);
  if (data.length >= 126) header.writeUInt16BE(data.length, 2);
  for (let i=0;i<data.length;i++) data[i] ^= mask[i%4];
  return Buffer.concat([header, mask, data]);
}
function connection() {
  const socket = new Socket(), received = []; let closed = 0;
  const peer = acceptWebSocket({ method: 'GET', headers: { upgrade:'websocket', connection:'Upgrade', 'sec-websocket-version':'13', 'sec-websocket-key':'dGhlIHNhbXBsZSBub25jZQ==' } }, socket, Buffer.alloc(0), m => received.push(m), () => closed++);
  return {socket, received, peer, closed: () => closed};
}
test('WebSocket accepts split TCP frames, fragmented UTF-8 text and ping interleaving', () => {
  const c=connection(); assert.match(c.socket.writes[0], /s3pPLMBiTxaQ9kYGzzhZRbK\+xOo=/);
  const first=masked('{"name":"墨',{fin:false});c.socket.emit('data',first.subarray(0,3));c.socket.emit('data',first.subarray(3));
  c.socket.emit('data',masked('ping',{opcode:9}));c.socket.emit('data',masked('迹"}',{opcode:0}));
  assert.deepEqual(c.received,[{name:'墨迹'}]); assert.equal(c.socket.writes[1][0], 0x8a);
  c.peer.close(); assert.equal(c.closed(),1);c.socket.destroy();assert.equal(c.closed(),1);
});
test('WebSocket rejects unmasked, oversized and malformed messages before dispatch', () => {
  for (const data of [Buffer.from([0x81,2,123,125]), masked('x'.repeat(4097)), masked('invalid'), masked('{}',{opcode:0})]) {
    const c=connection();c.socket.emit('data',data);assert.equal(c.closed(),1);assert.equal(c.received.length,0);c.socket.destroy();
  }
});

test('teams auto-balance to 4v4, disable friendly damage and aggregate teammate kills', () => {
  const {room,a,b}=duel(emptyWorld(),{killLimit:2}); const c=room.add('队友');
  assert.equal(a.team,'red');assert.equal(b.team,'blue');assert.equal(c.team,'red');
  a.position.set(0,1.7,4);a.yaw=0;c.position.set(0,1.7,-4);c.protection=0;b.position.set(10,1.7,-4);
  room.shoot(a);assert.equal(c.health,100);assert.equal(room.scores.red,0);
  b.position.set(0,1.7,-4);b.protection=0;c.position.set(10,1.7,-4);
  advance(room,.12);room.shoot(a);advance(room,.12);room.shoot(a);
  assert.equal(a.kills,1);assert.equal(room.scores.red,1);assert.equal(room.phase,'playing');
  room.spawn(b);b.position.set(0,1.7,-4);b.protection=0;c.position.set(0,1.7,4);c.yaw=0;a.position.set(10,1.7,4);
  room.shoot(c);advance(room,.12);room.shoot(c);
  assert.equal(c.kills,1);assert.equal(room.scores.red,2);assert.equal(room.phase,'finished');assert.deepEqual(room.winners,['红队']);
  for(let i=0;i<5;i++)room.add(`extra${i}`);
  assert.equal([...room.players.values()].filter(p=>p.team==='red').length,4);
  assert.equal([...room.players.values()].filter(p=>p.team==='blue').length,4);
});

test('stale input and action messages from a previous life cannot turn or fire a respawned player', () => {
  const {room,a}=duel(); const life=a.life;room.spawn(a);const yaw=a.yaw,position=a.position.clone();
  command(room,a.id,{type:'input',life,forward:1,yaw:1,pitch:.8,shooting:true});
  command(room,a.id,{type:'fire',life});advance(room,.1);
  assert.equal(a.yaw,yaw);assert.equal(a.ammo[0],30);assert.equal(a.position.distanceTo(position),0);
  command(room,a.id,{type:'input',yaw:.6});assert.equal(a.yaw,.6);
});

test('when a team leaves entirely, remaining players rebalance and start a fresh round', () => {
  const {room,a,b}=duel();const c=room.add('第三人');const round=room.round;
  assert.equal(c.team,a.team);room.remove(b.id);
  assert.equal(new Set([...room.players.values()].map(p=>p.team)).size,2);
  assert.equal(room.round,round+1);assert.equal(room.phase,'playing');assert.deepEqual(room.scores,{red:0,blue:0});
});
