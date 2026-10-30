import { NOSTALGOS12 as colors, hex } from './palette.js';
import * as THREE from './vendor/three.module.js';
import { createStickman, playerPoseSeed } from './enemy.js';
import { PLAYER } from './physics.js';
import { WEAPONS } from './weapons.js';

export class LanClient {
  constructor({ input, snapshot, event, disconnected }) {
    Object.assign(this, { getInput: input, onSnapshot: snapshot, onEvent: event, onDisconnected: disconnected });
    this.id = null; this.latest = null; this.ping = 0; this.socket = null;
  }
  connect(name) {
    return new Promise((resolve, reject) => {
      let welcomed = false, error = '', lastSnapshot = performance.now(), pingAt = 0;
      const url = new URL('/ws', location.href); url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const socket = this.socket = new WebSocket(url);
      const timeout = setTimeout(() => { error = '连接超时，请确认房主服务仍在运行。'; socket.close(); }, 7000);
      socket.onopen = () => this.send({ type: 'join', protocol: 2, name });
      socket.onmessage = e => {
        const message = JSON.parse(e.data);
        if (message.type === 'welcome') {
          clearTimeout(timeout); welcomed = true; this.id = message.id; this.rules = message.rules;
          this.timer = setInterval(() => {
            const now = performance.now();
            if (now - lastSnapshot > 5000) { error = '与房主的连接中断，请重新加入。'; socket.close(); return; }
            this.send({ type: 'input', ...this.getInput() });
            if (now - pingAt > 1500) { this.send({ type: 'ping', time: now }); pingAt = now; }
          }, 1000 / 30);
          resolve();
        } else if (message.type === 'snapshot') { this.latest = message; lastSnapshot = performance.now(); this.onSnapshot(message); }
        else if (message.type === 'pong') this.ping = Math.round(performance.now() - message.time);
        else if (message.type === 'error') error = message.message;
        else this.onEvent(message);
      };
      socket.onerror = () => { error ||= '无法连接联机服务。房主请使用 bash start-lan.sh 启动。'; };
      socket.onclose = () => {
        clearTimeout(timeout); clearInterval(this.timer); this.socket = null;
        if (!welcomed) reject(new Error(error || '无法加入房间。请确认正在使用联机服务。'));
        else if (!this.leaving) this.onDisconnected(error || '房主已关闭服务或网络已断开，请重新加入。');
      };
    });
  }
  send(message) { if (this.socket?.readyState === WebSocket.OPEN && this.socket.bufferedAmount < 16384) this.socket.send(JSON.stringify(message)); }
  action(type, extra = {}) { const input = this.getInput(); this.send({ type: 'input', ...input }); this.send({ type, life: input.life, ...extra }); }
  disconnect() { this.leaving = true; clearInterval(this.timer); this.socket?.close(); }
}

const labelColors = { red: hex(colors.blush), blue: hex(colors.sky) };
export class RemotePlayers {
  constructor(scene) { this.scene = scene; this.players = new Map(); }
  clear() { for (const p of this.players.values()) this.dispose(p); this.players.clear(); }
  dispose(p) { p.label.material.map.dispose(); p.label.material.dispose(); p.label.removeFromParent(); p.ring.geometry.dispose(); p.ring.material.dispose(); p.ring.removeFromParent(); p.rig.dispose(); }
  receive(players, ownId) {
    const present = new Set(players.filter(p => p.id !== ownId).map(p => p.id));
    for (const [id, p] of this.players) if (!present.has(id)) { this.dispose(p); this.players.delete(id); }
    for (const data of players) {
      if (data.id === ownId) continue;
      let p = this.players.get(data.id);
      if (p && (p.data.life !== data.life || p.data.team !== data.team)) { this.dispose(p); this.players.delete(data.id); p = null; }
      if (!p) {
        const rig = createStickman({ index: Number(data.id), maxHp: 100, weapon: data.weapon, team: data.team, poseSeed: playerPoseSeed(data.id,data.life) });
        const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 96;
        const ctx = canvas.getContext('2d'), color = labelColors[data.team];
        ctx.fillStyle = hex(colors.ink); ctx.fillRect(0, 0, 512, 96); ctx.fillStyle = color; ctx.fillRect(4, 4, 504, 88);
        ctx.fillStyle = hex(colors.ink); ctx.font = '36px "Lilita One","ZCOOL KuaiLe",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(data.name, 256, 48, 480);
        const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
        const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: true, depthWrite: false }));
        label.scale.set(2.1, .395, 1); label.position.set(0, 2.55, 0); rig.group.add(label);
        const ring = new THREE.Mesh(new THREE.RingGeometry(.36, .44, 24), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: .8, depthWrite: false }));
        ring.rotation.x = -Math.PI / 2; ring.position.y = .025; rig.group.add(ring);
        p = { rig, label, ring, data, target: new THREE.Vector3(), shot: 0, deadTime: 0 };
        p.target.fromArray(data.position); p.target.y -= PLAYER.eye; rig.group.position.copy(p.target);
        this.scene.add(rig.group); this.players.set(data.id, p);
      }
      p.rig.setWeapon(data.weapon); p.data = data; p.target.fromArray(data.position); p.target.y -= PLAYER.eye;
    }
  }
  shot(id) { const p = this.players.get(id); if (p) p.shot = .16; }
  update(dt, camera, time) {
    for (const p of this.players.values()) {
      const d = p.data, g = p.rig.group;
      g.position.lerp(p.target, 1 - Math.exp(-dt * 22));
      p.label.visible = d.health > 0; p.ring.visible = d.health > 0;
      p.ring.material.opacity = d.protection > 0 ? .35 + Math.sin(time * 12) * .3 : .8;
      p.rig.healthBar.visible = d.health > 0 && d.health < 100;
      p.rig.healthBar.scale.x = Math.max(.001, d.health / 100);
      p.rig.healthBar.quaternion.copy(camera.quaternion).premultiply(g.quaternion.clone().invert());
      if (d.health <= 0) {
        p.deadTime += dt;
        const direction=d.death?.source ? p.target.clone().sub(new THREE.Vector3().fromArray(d.death.source)).setY(0) : new THREE.Vector3(Math.sin(d.yaw),0,Math.cos(d.yaw));
        p.rig.fall(dt, { direction }); g.visible = p.deadTime < 2.5; continue;
      }
      const desired = d.yaw + Math.PI, delta = Math.atan2(Math.sin(desired - g.rotation.y), Math.cos(desired - g.rotation.y));
      g.rotation.y += delta * (1 - Math.exp(-dt * 18)); p.shot = Math.max(0, p.shot - dt);
      const speed = Math.hypot(d.vx, d.vz), sin = Math.sin(g.rotation.y), cos = Math.cos(g.rotation.y);
      p.rig.animate(dt, { speed, localForward: speed > .01 ? (d.vx * sin + d.vz * cos) / speed : 1,
        localStrafe: speed > .01 ? (d.vx * cos - d.vz * sin) / speed : 0,
        aim: d.aim ? 1 : .65, turn:THREE.MathUtils.clamp(delta*18,-5,5), shot: p.shot / .16, reload: d.reload > 0 ? 1 - d.reload / WEAPONS[d.weapon].reload : 0, time });
    }
  }
}
