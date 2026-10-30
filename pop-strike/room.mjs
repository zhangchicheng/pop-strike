import * as THREE from './vendor/three.module.js';
import { createPlayerController, PLAYER } from './physics.js';
import { WEAPONS, createAmmo, validWeapon, shotSpread, shotDamage } from './weapons.js';

export const RULES = Object.freeze({ maxPlayers: 8, duration: 300, killLimit: 20, respawn: 3, protection: 2, intermission: 10 });
export const TEAM_NAMES = Object.freeze({ red: '红队', blue: '蓝队' });
const idle = () => ({ forward: 0, strafe: 0, yaw: 0, pitch: 0, sprint: false, aim: false, jump: false, interact: false, shooting: false });
const finite = (n, min, max) => typeof n === 'number' && Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : 0;
const round = n => Math.round(n * 1000) / 1000;

export class Room {
  constructor(world, emit = () => {}, rules = {}) {
    this.world = world; this.emit = emit; this.rules = { ...RULES, ...rules };
    this.players = new Map(); this.nextId = 1; this.clock = 0; this.phase = 'waiting'; this.remaining = this.rules.duration;
    this.round = 0; this.winners = []; this.scores = { red: 0, blue: 0 }; this.ray = new THREE.Raycaster();
    this.spawns = [new THREE.Vector3(0, 0, 17), ...world.spawnPoints, ...(world.upperSpawnPoints || [])];
  }
  add(name) {
    if (this.players.size >= this.rules.maxPlayers) return null;
    const id = String(this.nextId++), position = new THREE.Vector3();
    const red = [...this.players.values()].filter(p => p.team === 'red').length;
    const team = red <= this.players.size - red ? 'red' : 'blue';
    const p = { id, team, name: String(name || '').replace(/[\p{C}]/gu, '').trim().slice(0, 16) || `玩家 ${id}`,
      position, controller: createPlayerController(position, this.world), input: idle(), lastInput: this.clock,
      health: 100, kills: 0, deaths: 0, ammo: createAmmo(), weapon: 0, reload: 0, cooldown: 0,
      respawn: 0, protection: 0, life: 0, vx: 0, vz: 0, yaw: 0, pitch: 0 };
    this.players.set(id, p); this.spawn(p);
    this.emit({ type: 'notice', text: `${p.name} 加入${TEAM_NAMES[team]}` });
    if (this.players.size >= 2 && this.phase === 'waiting') this.startRound();
    return p;
  }
  remove(id) {
    const p = this.players.get(id); if (!p) return;
    this.players.delete(id); this.emit({ type: 'notice', text: `${p.name} 离开了战场` });
    if (this.players.size < 2) { this.phase = 'waiting'; this.remaining = this.rules.duration; this.winners = []; }
    else if (new Set([...this.players.values()].map(p => p.team)).size === 1) {
      // If an entire side leaves, rebalance and start a fresh scored round.
      const players = [...this.players.values()];
      players.forEach((p, i) => { p.team = i % 2 ? 'blue' : 'red'; });
      this.startRound();
    }
  }
  spawn(p) {
    const others = [...this.players.values()].filter(o => o !== p && o.health > 0);
    let best = this.spawns[Number(p.id) % this.spawns.length], distance = -1;
    for (const s of this.spawns) {
      const nearest = others.length ? Math.min(...others.map(o => s.distanceToSquared(o.position))) : (s === best ? 1 : 0);
      if (nearest > distance) { distance = nearest; best = s; }
    }
    p.position.copy(best); p.position.y += PLAYER.eye; p.controller.reset();
    Object.assign(p, { health: 100, ammo: createAmmo(), weaponCooldowns: WEAPONS.map(() => 0), triggerLatched: false, death: null, reload: 0, cooldown: 0, respawn: 0,
      protection: this.rules.protection, weapon: 0, input: idle(), vx: 0, vz: 0, yaw: Math.atan2(p.position.x, p.position.z), pitch: 0 });
    p.life++;
  }
  startRound() {
    this.phase = 'playing'; this.remaining = this.rules.duration; this.round++; this.winners = []; this.scores = { red: 0, blue: 0 };
    for (const p of this.players.values()) { p.kills = p.deaths = 0; this.spawn(p); }
    this.emit({ type: 'notice', text: `第 ${this.round} 局开始 · 红蓝对战 · 全队 ${this.rules.killLimit} 次击倒获胜` });
  }
  endRound() {
    if (this.phase !== 'playing') return;
    const best = Math.max(this.scores.red, this.scores.blue);
    this.winners = Object.keys(this.scores).filter(team => this.scores[team] === best).map(team => TEAM_NAMES[team]);
    this.phase = 'finished'; this.remaining = this.rules.intermission;
    for (const p of this.players.values()) { p.input = idle(); p.vx = p.vz = 0; }
  }
  input(id, message) {
    const p = this.players.get(id); if (!p || message.life !== p.life) return;
    p.lastInput = this.clock;
    if (message.type === 'input') {
      p.input = { forward: finite(message.forward, -1, 1), strafe: finite(message.strafe, -1, 1),
        yaw: finite(message.yaw, -1e6, 1e6) % (2 * Math.PI), pitch: finite(message.pitch, -1.3, 1.3),
        ...Object.fromEntries(['sprint', 'aim', 'jump', 'interact', 'shooting'].map(k => [k, message[k] === true])) };
      p.yaw = p.input.yaw; p.pitch = p.input.pitch;
      if (!p.input.shooting) p.triggerLatched = false;
    } else if (p.health > 0 && this.phase !== 'finished') {
      if (message.type === 'reload') this.reload(p);
      if (message.type === 'weapon' && validWeapon(message.weapon) && message.weapon !== p.weapon) {
        p.weapon = message.weapon; p.reload = 0; p.cooldown = Math.max(.22, p.weaponCooldowns[p.weapon]); p.triggerLatched = p.input.shooting;
      }
      if (message.type === 'fire') this.shoot(p);
    }
  }
  reload(p) { if (p.reload === 0 && p.ammo[p.weapon] < WEAPONS[p.weapon].capacity) p.reload = WEAPONS[p.weapon].reload; }
  step(dt) {
    this.clock += dt;
    if (this.phase !== 'waiting') {
      this.remaining = Math.max(0, this.remaining - dt);
      if (this.remaining === 0) { if (this.phase === 'playing') this.endRound(); else this.startRound(); }
    }
    if (this.phase === 'finished') return;
    for (const p of this.players.values()) {
      p.weaponCooldowns = p.weaponCooldowns.map(t => Math.max(0, t - dt));
      p.cooldown = Math.max(0, p.cooldown - dt); p.protection = Math.max(0, p.protection - dt);
      if (p.health <= 0) { p.respawn = Math.max(0, p.respawn - dt); if (p.respawn === 0) this.spawn(p); continue; }
      if (p.reload > 0) { p.reload = Math.max(0, p.reload - dt); if (p.reload === 0) p.ammo[p.weapon] = WEAPONS[p.weapon].capacity; }
      const i = this.clock - p.lastInput < .35 ? p.input : idle();
      const len = Math.max(1, Math.hypot(i.forward, i.strafe)), f = i.forward / len, s = i.strafe / len;
      const speed = (i.sprint && f > 0 && !i.aim ? 7.6 : 4.8) * (i.aim ? .62 : 1);
      const x = p.position.x, z = p.position.z;
      p.controller.update(dt, { vx: (-Math.sin(p.yaw) * f + Math.cos(p.yaw) * s) * speed,
        vz: (-Math.cos(p.yaw) * f - Math.sin(p.yaw) * s) * speed, forward: f, jump: i.jump, interact: i.interact });
      p.vx = (p.position.x - x) / dt; p.vz = (p.position.z - z) / dt;
      if (i.shooting) this.shoot(p);
      if (this.phase === 'finished') break;
    }
  }
  shoot(p) {
    if (p.health <= 0 || this.phase === 'finished' || p.cooldown > 0 || p.reload > 0) return;
    const w = WEAPONS[p.weapon];
    if (p.weaponCooldowns[p.weapon] > 0 || (!w.automatic && p.triggerLatched)) return;
    p.triggerLatched = true;
    if (p.ammo[p.weapon] === 0) { this.reload(p); return; }
    p.ammo[p.weapon]--; p.cooldown = p.weaponCooldowns[p.weapon] = w.interval; p.protection = 0;
    const origin = p.position.clone(); // Eye height, derived entirely from server physics.
    const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(p.pitch, p.yaw, 0, 'YXZ'));
    const ends = [], hits = [];
    for (let pellet = 0; pellet < w.pellets; pellet++) {
      const spread = shotSpread(w, p.input.aim);
      const direction = new THREE.Vector3((Math.random() - .5) * spread, (Math.random() - .5) * spread, -1).normalize().applyQuaternion(rotation);
      this.ray.set(origin, direction); this.ray.far = w.range;
      const wall = this.ray.intersectObjects(this.world.raycastMeshes, false)[0];
      let distance = wall?.distance ?? w.range, target = null, headshot = false;
      // Stable capsules / body boxes keep hits independent of cosmetic animation.
      for (const other of this.players.values()) {
        if (other === p || other.team === p.team || other.health <= 0 || other.protection > 0 || this.phase !== 'playing') continue;
        const feet = other.position.y - PLAYER.eye, x = other.position.x, z = other.position.z;
        const head = this.ray.ray.intersectSphere(new THREE.Sphere(new THREE.Vector3(x, feet + 1.79, z), .24), new THREE.Vector3());
        const body = this.ray.ray.intersectBox(new THREE.Box3(new THREE.Vector3(x - .30, feet + .18, z - .24), new THREE.Vector3(x + .30, feet + 1.56, z + .24)), new THREE.Vector3());
        for (const [point, isHead] of [[head, true], [body, false]]) {
          if (point && point.distanceTo(origin) < distance) { distance = point.distanceTo(origin); target = other; headshot = isHead; }
        }
      }
      const end = this.ray.ray.at(distance, new THREE.Vector3()); ends.push(end.toArray().map(round));
      if (target) {
        const damage = shotDamage(w, distance, headshot); target.health = Math.max(0, target.health - damage);
        hits.push({ id: target.id, headshot, point: end.toArray().map(round) });
        if (target.health === 0) {
          target.deaths++; target.respawn = this.rules.respawn; target.input = idle(); target.reload = 0; p.kills++; this.scores[p.team]++;
          target.death = { killer: p.id, killerName: p.name, killerTeam: p.team, weapon: p.weapon, headshot, source: p.position.toArray().map(round) };
          this.emit({ type: 'kill', ...target.death, victim: target.id, victimName: target.name, victimTeam: target.team, victimLife: target.life });
        }
      }
    }
    this.emit({ type: 'shot', id: p.id, weapon: p.weapon, origin: origin.toArray().map(round), ends, hits });
    if (this.phase === 'playing' && this.scores[p.team] >= this.rules.killLimit) this.endRound();
  }
  snapshot() {
    return { type: 'snapshot', phase: this.phase, round: this.round, remaining: round(this.remaining), winners: this.winners, scores: { ...this.scores },
      players: [...this.players.values()].map(p => ({ id: p.id, team: p.team, name: p.name, position: p.position.toArray().map(round),
        yaw: round(p.yaw), pitch: round(p.pitch), vx: round(p.vx), vz: round(p.vz), health: p.health,
        kills: p.kills, deaths: p.deaths, weapon: p.weapon, ammo: [...p.ammo], reload: round(p.reload),
        respawn: round(p.respawn), protection: round(p.protection), life: p.life, aim: p.input.aim,
        death: p.death ? { ...p.death, source: [...p.death.source] } : null, motion: { ...p.controller.motion } })) };
  }
}
