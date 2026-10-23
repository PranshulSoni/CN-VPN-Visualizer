/* Educational wire model. No sockets, real TLS, or real IPsec are used. */
(function (root) {
  'use strict';
  const utf8 = text => new TextEncoder().encode(text);
  const text = bytes => new TextDecoder().decode(bytes);
  const concat = (...arrays) => {
    const out = new Uint8Array(arrays.reduce((n, a) => n + a.length, 0));
    let offset = 0; for (const a of arrays) { out.set(a, offset); offset += a.length; } return out;
  };
  const hex = bytes => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  const bits = bytes => Array.from(bytes, b => b.toString(2).padStart(8, '0')).join('');
  function fromBits(value) {
    if (!/^[01]*$/.test(value) || value.length % 8) throw Error('Expected complete binary bytes.');
    return Uint8Array.from(value.match(/.{8}/g) || [], x => parseInt(x, 2));
  }
  const base64 = bytes => typeof Buffer !== 'undefined' ? Buffer.from(bytes).toString('base64') : btoa(Array.from(bytes, b => String.fromCharCode(b)).join(''));
  const unbase64 = value => typeof Buffer !== 'undefined' ? new Uint8Array(Buffer.from(value, 'base64')) : Uint8Array.from(atob(value), x => x.charCodeAt(0));
  function rle(bytes) {
    const out = [];
    for (let i = 0; i < bytes.length;) {
      let count = 1; while (count < 255 && bytes[i + count] === bytes[i]) count++;
      out.push(count, bytes[i]); i += count;
    }
    return Uint8Array.from(out);
  }
  function unrle(bytes) {
    if (bytes.length % 2) throw Error('Truncated RLE stream.');
    const out = [];
    for (let i = 0; i < bytes.length; i += 2) {
      if (!bytes[i]) throw Error('Invalid RLE count.');
      for (let j = 0; j < bytes[i]; j++) out.push(bytes[i + 1]);
    }
    return Uint8Array.from(out);
  }
  async function sha256(bytes) { return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))); }
  async function seal(bytes, key) {
    key ||= await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes));
    return { data, iv, key };
  }
  async function open({ data, iv, key }) { return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data)); }
  function application(body, options = {}) {
    if (typeof body !== 'string' || !body.trim()) throw Error('Enter a message first.');
    if (utf8(body).length > 65536) throw Error('Keep the message under 64 KiB.');
    const protocol = options.protocol || 'HTTPS';
    if (!['HTTPS', 'HTTP'].includes(protocol)) throw Error('Choose HTTP or HTTPS.');
    return { header: { protocol, method: options.file ? 'POST' : 'MESSAGE', sender: '192.168.1.10', receiver: '203.0.113.80', timestamp: new Date().toISOString(), type: options.file?.type || 'text/plain', filename: options.file?.name || null, encoding: options.file ? 'base64' : 'UTF-8' }, body };
  }
  class MessageQueue {
    constructor() { this.items = []; }
    enqueue(message) { if (!message?.header || typeof message.body !== 'string') throw Error('Invalid structured message.'); this.items.push(message); }
    dequeue() { return this.items.shift(); }
  }
  class Session {
    constructor(authenticated, now = Date.now()) {
      if (!authenticated) throw Error('Authentication rejected.');
      this.id = crypto.randomUUID(); this.token = crypto.randomUUID(); this.lastActive = now; this.state = 'active'; this.checkpoints = [0];
    }
    checkpoint(offset) { if (this.state !== 'active') throw Error('Session is not active.'); this.checkpoints.push(offset); }
    recover() { this.state = 'active'; return this.checkpoints.at(-1); }
    sync(token) { return token === this.token && this.state === 'active'; }
    expire(elapsed, timeout = 1000) { if (elapsed >= timeout) { this.state = 'timed out'; return true; } return false; }
    close() { this.state = 'closed'; }
  }
  function checksum(bytes) {
    let sum = 0; for (let i = 0; i < bytes.length; i += 2) sum += (bytes[i] << 8) + (bytes[i + 1] || 0);
    while (sum >>> 16) sum = (sum & 65535) + (sum >>> 16);
    return (~sum) & 65535;
  }
  function tcpHeader(s, withChecksum = true) {
    const b = new Uint8Array(20), v = new DataView(b.buffer);
    v.setUint16(0, s.sport); v.setUint16(2, s.dport); v.setUint32(4, s.seq); v.setUint32(8, s.ack);
    b[12] = 0x50; b[13] = 0x18; v.setUint16(14, 4096); v.setUint16(16, withChecksum ? s.checksum : 0); return b;
  }
  function segment(bytes, size = 96, dport = 443) {
    if (!Number.isInteger(size) || size < 1) throw Error('Invalid segment size.');
    const out = [];
    for (let i = 0; i < bytes.length; i += size) {
      const s = { seq: i, ack: 1, sport: 51514, dport, timestamp: Date.now(), data: bytes.slice(i, i + size) };
      s.checksum = checksum(concat(tcpHeader(s, false), s.data)); out.push(s);
    }
    return out;
  }
  const validSegment = s => checksum(concat(tcpHeader(s), s.data)) === 0;
  function reassemble(segments) {
    const sorted = [...segments].sort((a, b) => a.seq - b.seq); let expected = 0;
    for (const s of sorted) { if (s.seq !== expected || !validSegment(s)) throw Error('Missing, overlapping or corrupt segment.'); expected += s.data.length; }
    return concat(...sorted.map(s => s.data));
  }
  function transfer(segments, { lost = -1, corrupt = -1, window = 3 } = {}) {
    if (!Number.isInteger(window) || window < 1) throw Error('Window must be positive.');
    const events = [], received = []; let retries = 0;
    for (let start = 0; start < segments.length; start += window) {
      events.push({ type: 'window', from: start, to: Math.min(start + window, segments.length) - 1 });
      for (let i = start; i < Math.min(start + window, segments.length); i++) {
        const s = segments[i]; events.push({ type: 'send', index: i, seq: s.seq });
        if (i === lost || i === corrupt) { events.push({ type: i === lost ? 'timeout' : 'checksum rejected', index: i }); events.push({ type: 'retransmit', index: i }); retries++; }
        if (!validSegment(s)) throw Error('Source segment corrupt.');
        received.push(s); events.push({ type: 'ACK', ack: s.seq + s.data.length });
      }
    }
    return { events, received, retries };
  }
  const graph = {
    Client: { Router: 1 }, Router: { ISP: 2 }, ISP: { Relay: 2, Gateway: 3, Destination: 7 },
    Relay: { Destination: 2 }, Gateway: { Destination: 3 }, Destination: {}
  };
  function route(g, source, target, blocked = []) {
    const distance = { [source]: 0 }, previous = {}, pending = new Set(Object.keys(g).filter(x => !blocked.includes(x)));
    if (!pending.has(source) || !pending.has(target)) return null;
    while (pending.size) {
      const u = [...pending].sort((a, b) => (distance[a] ?? Infinity) - (distance[b] ?? Infinity))[0];
      if (!Number.isFinite(distance[u])) break;
      pending.delete(u);
      for (const [v, cost] of Object.entries(g[u])) {
        if (cost < 0) throw Error('Dijkstra requires non-negative costs.');
        if (pending.has(v) && (distance[v] ?? Infinity) > distance[u] + cost) { distance[v] = distance[u] + cost; previous[v] = u; }
      }
    }
    if (!Number.isFinite(distance[target])) return null;
    const path = [target]; while (path[0] !== source) path.unshift(previous[path[0]]);
    return { path, cost: distance[target] };
  }
  const ipNumber = ip => ip.split('.').reduce((n, part) => ((n << 8) | Number(part)) >>> 0, 0);
  function lookup(ip, table) {
    return [...table].sort((a, b) => b.bits - a.bits).find(r => {
      const mask = r.bits ? (0xffffffff << (32 - r.bits)) >>> 0 : 0;
      return (ipNumber(ip) & mask) === (ipNumber(r.prefix) & mask);
    }) || null;
  }
  function fragment(bytes, mtu = 100) {
    const size = Math.floor((mtu - 20) / 8) * 8; if (size < 8) throw Error('MTU must fit an IPv4 header and 8 payload bytes.');
    const result = []; for (let i = 0; i < bytes.length; i += size) result.push({ offset: i, more: i + size < bytes.length, data: bytes.slice(i, i + size) }); return result;
  }
  function defragment(fragments) {
    const sorted = [...fragments].sort((a, b) => a.offset - b.offset); let expected = 0;
    for (const [i, f] of sorted.entries()) {
      if (f.offset !== expected || f.more !== (i < sorted.length - 1)) throw Error('Incomplete fragments.'); expected += f.data.length;
    }
    return concat(...sorted.map(f => f.data));
  }
  function trace(path, ttl = 64) {
    // The source is not a forwarding hop. Routers decrement TTL; the endpoint accepts the remaining value.
    const routers = path.slice(1, -1), hops = [];
    for (const node of routers) { ttl--; hops.push({ node, ttl }); if (ttl <= 0) return { hops, expired: true }; }
    return { hops: [...hops, { node: path.at(-1), ttl }], expired: false };
  }
  const nat = packet => ({ ...packet, originalSrc: packet.src, src: '198.51.100.24', sport: 62001 });
  function ipPacket(data, { src = '192.168.1.10', dst = '203.0.113.80', protocol = 6, ttl = 64 } = {}) {
    const header = new Uint8Array(20), v = new DataView(header.buffer); header[0] = 0x45;
    v.setUint16(2, data.length + 20); header[8] = ttl; header[9] = protocol;
    header.set(src.split('.').map(Number), 12); header.set(dst.split('.').map(Number), 16);
    v.setUint16(10, checksum(header)); return { src, dst, ttl, protocol, header, bytes: concat(header, data) };
  }
  function validIP(bytes) {
    if (bytes.length < 20 || bytes[0] !== 0x45) return false;
    const length = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(2);
    return length === bytes.length && checksum(bytes.slice(0, 20)) === 0;
  }
  function hybridTopology() {
    const nodes = [
      { id: 'Client A', role: 'host' }, { id: 'Client B', role: 'host' },
      { id: 'Source switch', role: 'switch' }, { id: 'Router A', role: 'router' },
      { id: 'Backbone', role: 'backbone' }, { id: 'Router B', role: 'router' },
      { id: 'Destination switch', role: 'switch' }, { id: 'Server', role: 'host' },
      { id: 'Server B', role: 'host' },
    ];
    const edges = [ ['Client A', 'Source switch'], ['Client B', 'Source switch'],
      ['Source switch', 'Router A'], ['Router A', 'Backbone'], ['Backbone', 'Router B'],
      ['Router B', 'Destination switch'], ['Destination switch', 'Server'], ['Destination switch', 'Server B'] ];
    return { nodes, edges, benefits: ['Local faults stay within their LAN.', 'Additional LANs can join the backbone independently.', 'The routed backbone can use redundant paths.'] };
  }
  function crc32(bytes) {
    let crc = 0xffffffff;
    for (const b of bytes) { crc ^= b; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); }
    return (crc ^ 0xffffffff) >>> 0;
  }
  function frame(payload, vlan = null) {
    const header = Uint8Array.from([2, 0, 0, 0, 0, 1, 2, 0, 0, 0, 0, 10, ...(vlan === null ? [8, 0] : [0x81, 0, (vlan >> 8) & 15, vlan & 255, 8, 0])]);
    const bytes = concat(header, payload), crc = crc32(bytes), trailer = new Uint8Array(4);
    new DataView(trailer.buffer).setUint32(0, crc, true);
    return { src: '02:00:00:00:00:0a', dst: '02:00:00:00:00:01', vlan, bytes: concat(bytes, trailer), crc, headerSize: header.length };
  }
  const validFrame = f => crc32(f.bytes.slice(0, -4)) === new DataView(f.bytes.buffer, f.bytes.byteOffset + f.bytes.length - 4, 4).getUint32(0, true);
  const stuff = value => value.replace(/11111/g, '111110');
  const unstuff = value => value.replace(/111110/g, '11111');
  const switchPort = (mac, table) => table[mac] ?? 'flood';
  function encodeSignal(value, encoding = 'NRZ') {
    let level = -1; const out = [];
    for (const b of value) {
      if (encoding === 'Manchester') out.push(...(b === '1' ? [1, -1] : [-1, 1]));
      else if (encoding === 'NRZI') { if (b === '1') level *= -1; out.push(level); }
      else out.push(b === '1' ? 1 : -1);
    }
    return out;
  }
  const noise = (value, indices) => [...value].map((b, i) => indices.includes(i) ? b === '1' ? '0' : '1' : b).join('');
  const ber = (a, b) => { if (a.length !== b.length) throw Error('Bitstreams must have equal lengths.'); return a.length ? [...a].filter((x, i) => x !== b[i]).length / a.length : 0; };
  const attenuate = (amplitude, distance, dbPerMeter = 0.02) => amplitude * Math.pow(10, -distance * dbPerMeter / 20);
  const tdm = channels => { const out = []; for (let i = 0; i < Math.max(0, ...channels.map(c => c.length)); i++) for (const c of channels) out.push(c[i] ?? '—'); return out; };
  const collision = starts => ({ detected: new Set(starts).size !== starts.length, retrySlots: starts.map((_, i) => i + 1) });
  async function build(message, options = {}) {
    const app = application(message, options), raw = utf8(JSON.stringify(app)), hash = await sha256(raw);
    const compressed = options.compression ? rle(raw) : raw;
    const encrypted = app.header.protocol === 'HTTPS', sealed = encrypted ? await seal(compressed) : null;
    const payload = sealed ? sealed.data : compressed;
    const session = new Session(true); for (let n = 128; n < payload.length; n += 128) session.checkpoint(n);
    const segments = segment(payload, 96, encrypted ? 443 : 80);
    const directPackets = segments.map(s => ipPacket(concat(tcpHeader(s), s.data)));
    const tunnelKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    const vpnPackets = [];
    for (const packet of directPackets) {
      const encryptedPacket = await seal(packet.bytes, tunnelKey);
      const udp = new Uint8Array(8), v = new DataView(udp.buffer);
      v.setUint16(0, 4500); v.setUint16(2, 4500); v.setUint16(4, 8 + 12 + encryptedPacket.data.length);
      const outer = ipPacket(concat(udp, encryptedPacket.iv, encryptedPacket.data), { dst: '203.0.113.7', protocol: 17 });
      vpnPackets.push({ inner: packet, encrypted: encryptedPacket, outer, frame: frame(outer.bytes) });
    }
    const directFrames = directPackets.map(p => frame(p.bytes));
    // Receiver validates every frame, tunnel tag and transport checksum, then reassembles actual bytes.
    const recoveredSegments = [];
    for (const [i, vp] of vpnPackets.entries()) {
      if (!validFrame(vp.frame) || !validFrame(directFrames[i])) throw Error('Frame rejected.');
      const unwrapped = await open({ ...vp.encrypted,
        iv: vp.frame.bytes.slice(vp.frame.headerSize + 28, vp.frame.headerSize + 40),
        data: vp.frame.bytes.slice(vp.frame.headerSize + 40, -4) });
      if (!validIP(unwrapped) || !validIP(vp.outer.bytes)) throw Error('Invalid IPv4 header.');
      recoveredSegments.push({ ...segments[i], data: unwrapped.slice(40) });
    }
    const vpnStream = reassemble(recoveredSegments);
    const directStream = reassemble(segments.map((s, i) => ({ ...s, data: directFrames[i].bytes.slice(14 + 40, -4) })));
    if (hex(vpnStream) !== hex(directStream)) throw Error('Routes disagree.');
    const decrypted = sealed ? await open({ ...sealed, data: vpnStream }) : vpnStream;
    const recovered = options.compression ? unrle(decrypted) : decrypted;
    const received = JSON.parse(text(recovered));
    return { app, raw, hash, received, integrity: await sha256(recovered) === hash,
      presentation: { compressed, payload, encrypted, sealed, compression: options.compression ? 'RLE' : 'none', base64: base64(payload) },
      session, segments, direct: { packets: directPackets, frames: directFrames, frame: directFrames[0], ip: directPackets[0] },
      vpn: { packets: vpnPackets, frame: vpnPackets[0].frame, outer: vpnPackets[0].outer },
      route: route(graph, 'Client', 'Destination'), trace: trace(route(graph, 'Client', 'Destination').path),
      handshake: ['SYN · seq 0', 'SYN-ACK · seq 0 · ack 1', 'ACK · seq 1 · ack 1'] };
  }
  const api = { utf8, text, concat, hex, bits, fromBits, base64, unbase64, rle, unrle, sha256, seal, open, application, MessageQueue, Session, checksum, tcpHeader, segment, validSegment, reassemble, transfer, graph, route, lookup, fragment, defragment, trace, nat, ipPacket, validIP, hybridTopology, crc32, frame, validFrame, stuff, unstuff, switchPort, encodeSignal, noise, ber, attenuate, tdm, collision, build };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Net = api;
})(globalThis);
