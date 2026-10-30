import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import * as THREE from './vendor/three.module.js';
import { createWorld } from './world.js';
import { Room, RULES } from './room.mjs';
import { acceptWebSocket } from './websocket.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ttf': 'font/ttf' };
export function lanAddresses(port) {
  return [...new Set(Object.values(os.networkInterfaces()).flat().filter(n => n && n.family === 'IPv4' && !n.internal).map(n => `http://${n.address}:${port}`))];
}
export function createGameServer({ world, rules } = {}) {
  const scene = new THREE.Scene();
  world ??= createWorld(scene, { headless: true }); scene.updateMatrixWorld(true);
  const clients = new Set();
  const broadcast = message => { for (const client of clients) if (client.id) client.peer.send(message); };
  const room = new Room(world, broadcast, rules);
  const server = http.createServer((req, res) => {
    let url, pathname;
    try { url = new URL(req.url, 'http://localhost'); pathname = decodeURIComponent(url.pathname); }
    catch { res.writeHead(400); res.end('Bad request'); return; }
    if (pathname.includes('\0')) { res.writeHead(400); res.end('Bad request'); return; }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
    if (pathname === '/api/room') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ protocol: 2, players: room.players.size, phase: room.phase, rules: room.rules, addresses: lanAddresses(server.address()?.port) })); return;
    }
    let file = path.resolve(root, '.' + pathname);
    if (!file.startsWith(root + path.sep) && file !== root) { res.writeHead(403); res.end(); return; }
    if (file === root || pathname.endsWith('/')) file = path.join(file, 'index.html');
    // Serve browser assets, not the host implementation or test files.
    if (!types[path.extname(file)] || file.includes(path.sep + 'tests' + path.sep)) { res.writeHead(404); res.end(); return; }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); res.end('Not found'); return; }
      res.writeHead(200, { 'Content-Type': types[path.extname(file)], 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
      res.end(req.method === 'HEAD' ? undefined : data);
    });
  });
  server.on('upgrade', (req, socket, head) => {
    let validOrigin = true;
    try { if (req.headers.origin) validOrigin = new URL(req.headers.origin).host === req.headers.host; } catch { validOrigin = false; }
    if (req.url !== '/ws' || !validOrigin || clients.size >= RULES.maxPlayers + 8) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return;
    }
    const client = { id: null, peer: null, count: 0, window: Date.now() };
    let joinTimer;
    client.peer = acceptWebSocket(req, socket, head, message => {
      if (Date.now() - client.window > 1000) { client.window = Date.now(); client.count = 0; }
      if (++client.count > 120) { client.peer.close(1008); return; }
      if (!client.id) {
        if (message.type !== 'join' || message.protocol !== 2 || typeof message.name !== 'string') {
          client.peer.send({ type: 'error', message: '客户端版本不匹配，请刷新页面。' }); client.peer.close(1008); return;
        }
        const player = room.add(message.name);
        if (!player) { client.peer.send({ type: 'error', message: '房间已满（8 人），请稍后再试。' }); client.peer.close(1008); return; }
        clearTimeout(joinTimer); client.id = player.id;
        client.peer.send({ type: 'welcome', id: player.id, rules: room.rules }); broadcast(room.snapshot());
      } else if (message.type === 'ping') client.peer.send({ type: 'pong', time: message.time });
      else room.input(client.id, message);
    }, () => { clearTimeout(joinTimer); clients.delete(client); room.remove(client.id); broadcast(room.snapshot()); });
    if (!client.peer) return;
    clients.add(client); joinTimer = setTimeout(() => client.peer.close(1008), 5000); joinTimer.unref();
  });
  let last = performance.now(), accumulated = 0, ticks = 0;
  const timer = setInterval(() => {
    const now = performance.now(); accumulated += Math.min((now - last) / 1000, .2); last = now;
    while (accumulated >= 1 / 60) {
      room.step(1 / 60); accumulated -= 1 / 60;
      if (++ticks % 3 === 0 && clients.size) broadcast(room.snapshot());
    }
  }, 1000 / 60);
  timer.unref();
  function close() {
    clearInterval(timer); for (const c of clients) c.peer.close(1001);
    server.close(); server.closeIdleConnections();
    const geometries = new Set(), materials = new Set(), textures = new Set();
    scene.traverse(m => { if (m.geometry) geometries.add(m.geometry); if (m.material) materials.add(m.material); });
    for (const m of materials) { for (const value of Object.values(m)) if (value?.isTexture) textures.add(value); m.dispose(); }
    for (const t of textures) t.dispose(); for (const g of geometries) g.dispose();
  }
  return { server, room, close };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = createGameServer(), port = Number(process.env.PORT) || 5173;
  app.server.on('error', error => { console.error(`无法启动联机服务：${error.message}`); app.close(); process.exitCode = 1; });
  app.server.listen(port, '0.0.0.0', () => {
    console.log(`\nPOP STRIKE 局域网红蓝对战 · 最多 8 人\n本机打开：http://localhost:${app.server.address().port}`);
    for (const address of lanAddresses(app.server.address().port)) console.log(`同一局域网的朋友打开：${address}`);
    console.log('浏览器点击「局域网对战」加入。保持此终端运行，Ctrl+C 停止。\n');
  });
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => app.close());
}
