import { createHash } from 'node:crypto';

// Small RFC 6455 transport: text messages only, no extensions, 4 KiB input cap.
// Keeping this local lets the LAN host run without npm or downloaded packages.
export function frame(data, opcode = 1) {
  const body = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const header = Buffer.alloc(body.length < 126 ? 2 : 4);
  header[0] = 0x80 | opcode;
  header[1] = body.length < 126 ? body.length : 126;
  if (body.length >= 126) header.writeUInt16BE(body.length, 2);
  return Buffer.concat([header, body]);
}

export function acceptWebSocket(req, socket, head, onMessage, onClose) {
  const key = req.headers['sec-websocket-key'];
  if (req.method !== 'GET' || req.headers.upgrade?.toLowerCase() !== 'websocket' ||
      !req.headers.connection?.toLowerCase().split(/\s*,\s*/).includes('upgrade') ||
      req.headers['sec-websocket-version'] !== '13' || typeof key !== 'string' ||
      !/^[A-Za-z0-9+/]{22}==$/.test(key)) {
    socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n'); return null;
  }
  const accept = createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  socket.setNoDelay(true);
  let buffer = Buffer.alloc(0), parts = [], size = 0, fragmented = false, closed = false, alive = true;
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const finish = () => { if (closed) return; closed = true; clearInterval(heartbeat); onClose(); };
  const sendFrame = (data, opcode = 1) => {
    if (closed || socket.destroyed) return;
    if (socket.writableLength > 256 * 1024) { socket.destroy(); return; }
    socket.write(frame(data, opcode));
  };
  const close = (code = 1000) => {
    if (closed) return;
    const body = Buffer.alloc(2); body.writeUInt16BE(code); sendFrame(body, 8);
    socket.end(); finish();
    const timer = setTimeout(() => socket.destroy(), 1000); timer.unref();
  };
  const peer = { send: data => sendFrame(JSON.stringify(data)), close };
  const heartbeat = setInterval(() => {
    if (!alive) { socket.destroy(); return; }
    alive = false; sendFrame(Buffer.alloc(0), 9);
  }, 10000);
  heartbeat.unref();
  function consume(chunk) {
    if (closed) return;
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= 2 && !closed) {
      const fin = !!(buffer[0] & 128), opcode = buffer[0] & 15;
      let length = buffer[1] & 127, offset = 2;
      if ((buffer[0] & 112) || !(buffer[1] & 128) || ![0, 1, 8, 9, 10].includes(opcode)) { close(1002); return; }
      if (length === 127) { close(1009); return; }
      if (length === 126) { if (buffer.length < 4) return; length = buffer.readUInt16BE(2); offset = 4; }
      if (opcode >= 8 && (!fin || length > 125)) { close(1002); return; }
      if (length > 4096 || (opcode < 8 && size + length > 4096)) { close(1009); return; }
      if (buffer.length < offset + 4 + length) return;
      const mask = buffer.subarray(offset, offset + 4), data = Buffer.from(buffer.subarray(offset + 4, offset + 4 + length));
      buffer = buffer.subarray(offset + 4 + length);
      for (let i = 0; i < data.length; i++) data[i] ^= mask[i % 4];
      if (opcode === 8) { close(length === 1 ? 1002 : 1000); return; }
      if (opcode === 9) { sendFrame(data, 10); continue; }
      if (opcode === 10) { alive = true; continue; }
      if ((opcode === 0 && !fragmented) || (opcode === 1 && fragmented)) { close(1002); return; }
      parts.push(data); size += length; fragmented = !fin;
      if (fin) {
        let message;
        try { message = JSON.parse(decoder.decode(Buffer.concat(parts))); }
        catch { close(1007); return; }
        parts = []; size = 0;
        if (!message || typeof message !== 'object' || Array.isArray(message)) { close(1008); return; }
        onMessage(message);
      }
    }
  }
  socket.on('data', consume); socket.on('close', finish); socket.on('end', () => { finish(); socket.end(); }); socket.on('error', () => { finish(); socket.destroy(); });
  // The HTTP upgrade can contain the first frame. Defer until caller stores peer.
  if (head.length) queueMicrotask(() => consume(head));
  return peer;
}
