const { test } = require('node:test');
const assert = require('node:assert/strict');
const E = require('../engine.js');

test('UTF-8, RLE, Base64 and binary conversions round trip arbitrary bytes', () => {
  for (const text of ['Hello VPN', 'aaaaabbbbb', 'नमस्ते 🌍', '']) {
    const bytes = E.utf8(text);
    assert.deepEqual(E.unrle(E.rle(bytes)), bytes);
    assert.deepEqual(E.unbase64(E.base64(bytes)), bytes);
    assert.deepEqual(E.fromBits(E.bits(bytes)), bytes);
  }
  assert.throws(() => E.unrle(Uint8Array.of(3)));
});
test('application validates messages and produces metadata and FIFO queue', () => {
  assert.throws(() => E.application('   '));
  const a = E.application('Hello');
  assert.equal(a.header.protocol, 'HTTPS');
  assert.equal(a.body, 'Hello');
  assert.ok(a.header.timestamp);
  const q = new E.MessageQueue(); q.enqueue(a); q.enqueue(E.application('second'));
  assert.equal(q.dequeue().body, 'Hello'); assert.equal(q.dequeue().body, 'second');
});
test('AES-GCM and SHA-256 detect mutation and recover UTF-8 payload', async () => {
  const b = E.utf8('secret 🌍'); const sealed = await E.seal(b);
  assert.deepEqual(await E.open(sealed), b);
  assert.equal((await E.sha256(E.utf8('abc'))), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  sealed.data[0] ^= 1;
  await assert.rejects(() => E.open(sealed));
});
test('sessions authenticate, checkpoint, recover, expire and close', () => {
  assert.throws(() => new E.Session(false));
  const s = new E.Session(true, 1000); s.checkpoint(128); s.checkpoint(256);
  assert.equal(s.recover(), 256); assert.equal(s.sync('wrong'), false); assert.equal(s.sync(s.token), true);
  assert.equal(s.expire(999), false); assert.equal(s.expire(1001), true);
  const t = new E.Session(true); assert.notEqual(t.id, s.id); t.close(); assert.equal(t.state, 'closed');
});
test('segmentation, checksum, window transfer, retransmission and reassembly', () => {
  const b = E.utf8('abcdefghij'.repeat(40)); const segments = E.segment(b, 64, 443);
  assert.ok(segments.length > 1); assert.equal(segments[1].seq, 64);
  assert.ok(segments.every(E.validSegment));
  const bad = { ...segments[0], data: segments[0].data.slice() }; bad.data[0] ^= 1;
  assert.equal(E.validSegment(bad), false);
  const tx = E.transfer(segments, { lost: 1, corrupt: 2, window: 3 });
  assert.deepEqual(E.reassemble(tx.received), b);
  assert.equal(tx.retries, 2); assert.ok(tx.events.some(x => x.type === 'retransmit'));
});
test('Dijkstra reroutes dynamically and reports unreachable destinations', () => {
  const g = { A: { B: 2, C: 7 }, B: { C: 1 }, C: {} };
  assert.deepEqual(E.route(g, 'A', 'C'), { path: ['A', 'B', 'C'], cost: 3 });
  assert.deepEqual(E.route(g, 'A', 'C', ['B']).path, ['A', 'C']);
  assert.equal(E.route(g, 'C', 'A'), null);
  assert.equal(E.lookup('203.0.113.80', [{ prefix: '203.0.113.0', bits: 24, via: 'edge' }, { prefix: '0.0.0.0', bits: 0, via: 'default' }]).via, 'edge');
});
test('fragmentation respects MTU, reassembles, enforces TTL and NAT', () => {
  const b = E.utf8('a'.repeat(300)); const f = E.fragment(b, 100);
  assert.ok(f.every(x => x.data.length + 20 <= 100)); assert.equal(f[1].offset % 8, 0);
  assert.deepEqual(E.defragment(f.slice().reverse()), b);
  assert.equal(E.trace(['A', 'B', 'C'], 1).expired, true);
  assert.equal(E.trace(['A', 'B', 'C'], 8).expired, false);
  assert.equal(E.nat({ src: '192.168.1.10', sport: 51514 }).src, '198.51.100.24');
});
test('CRC-32 known vector, frame mutation, stuffing and MAC forwarding', () => {
  assert.equal(E.crc32(E.utf8('123456789')), 0xcbf43926);
  const f = E.frame(E.utf8('hello')); assert.ok(E.validFrame(f)); f.bytes[14] ^= 1; assert.equal(E.validFrame(f), false);
  const b = '011111101111111111'; assert.equal(E.unstuff(E.stuff(b)), b);
  assert.equal(E.switchPort('02:00:00:00:00:01', { '02:00:00:00:00:01': 2 }), 2);
  assert.equal(E.switchPort('unknown', {}), 'flood');
});
test('signal encodings, noise, BER, attenuation, collision and TDM', () => {
  assert.deepEqual(E.encodeSignal('01', 'NRZ'), [-1, 1]);
  assert.deepEqual(E.encodeSignal('01', 'Manchester'), [-1, 1, 1, -1]);
  assert.deepEqual(E.encodeSignal('011', 'NRZI'), [-1, 1, -1]);
  const noisy = E.noise('010101', [1, 3]); assert.equal(E.ber('010101', noisy), 2 / 6);
  assert.ok(E.attenuate(1, 100) < 1);
  assert.deepEqual(E.tdm(['ab', '12']), ['a', '1', 'b', '2']);
  assert.equal(E.collision([0, 0]).detected, true);
});
test('complete HTTPS and HTTP pipelines deliver exact original and encrypted tunnel', async () => {
  for (const protocol of ['HTTPS', 'HTTP']) {
    const p = await E.build('Hello 🌍 ' + 'a'.repeat(200), { protocol, compression: true });
    assert.equal(p.received.body, 'Hello 🌍 ' + 'a'.repeat(200));
    assert.ok(p.integrity); assert.ok(p.vpn.frame.bytes.length > p.direct.frame.bytes.length);
    assert.equal(p.presentation.encrypted, protocol === 'HTTPS');
    assert.ok(p.vpn.outer.dst === '203.0.113.7');
    assert.ok(p.direct.ip.dst === '203.0.113.80');
  }
});

test('IPv4 header validates length and checksum and detects mutated addresses', () => {
  const p = E.ipPacket(E.utf8('packet'));
  assert.ok(E.validIP(p.bytes));
  const bad = p.bytes.slice(); bad[16] ^= 1;
  assert.equal(E.validIP(bad), false);
  assert.equal(E.validIP(p.bytes.slice(0, -1)), false);
});
test('hybrid topology builds two actual stars and a routed backbone', () => {
  const topology = E.hybridTopology();
  assert.ok(topology.nodes.some(n => n.id === 'Source switch' && n.role === 'switch'));
  assert.ok(topology.edges.some(([a, b]) => a === 'Client A' && b === 'Source switch'));
  assert.ok(topology.edges.some(([a, b]) => a === 'Source switch' && b === 'Router A'));
  assert.ok(topology.edges.some(([a, b]) => a === 'Destination switch' && b === 'Server'));
  assert.equal(topology.benefits.length, 3);
});
test('binary and algorithm edge cases fail safely instead of hanging', () => {
  assert.throws(() => E.fromBits('001'));
  assert.throws(() => E.fromBits('0000000x'));
  assert.throws(() => E.unrle(Uint8Array.of(0, 12)));
  const bytes = Uint8Array.from({ length: 600 }, () => 255);
  assert.deepEqual(E.unrle(E.rle(bytes)), bytes);
  assert.throws(() => E.segment(bytes, 0));
  assert.throws(() => E.fragment(bytes, 20));
  assert.throws(() => E.transfer([], { window: 0 }));
  assert.throws(() => E.ber('0', '01'));
  assert.equal(E.ber('', ''), 0);
  assert.equal(E.lookup('8.8.8.8', []), null);
  assert.throws(() => E.defragment([{ offset: 8, more: false, data: Uint8Array.of(1) }]));
  const s = new E.Session(true); s.close(); assert.throws(() => s.checkpoint(128));
});
