/* Rendering only: the live data comes from engine.js, not prewritten packet values. */
(() => {
  'use strict';
  const E = Net, chapters = Story, $ = id => document.getElementById(id);
  const state = { chapter: 0, step: 0, pipeline: null, file: null, compression: false, encoding: 'NRZ', busy: false, running: false };
  const queue = new E.MessageQueue();
  const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const short = (value, length = 40) => String(value).length > length ? String(value).slice(0, length) + '…' : String(value);
  const t = (x, y, value, options = '') => `<text x="${x}" y="${y}" font-size="13" ${options}>${esc(value)}</text>`;
  const line = (x1, y1, x2, y2, cls = 'stroke', extra = '') => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="${cls}" ${extra}/>`;
  const rect = (x, y, w, h, cls = 'box', extra = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2" class="${cls}" ${extra}/>`;
  const label = (x, y, value) => t(x, y, value, 'class="dim" font-size="10"');
  const arrow = (x, y) => `<path d="M${x - 5} ${y - 4}l5 4-5 4" class="stroke"/>`;
  const node = (x, value, top = '') => line(x, 62, x + 1, 62) + `<circle cx="${x}" cy="62" r="4" fill="currentColor"/>` + t(x, 96, value, 'text-anchor="middle" font-size="12"') + (top ? label(x - 30, 30, top) : '');
  function box(x, y, w, title, subtitle = '', cls = '') {
    return `<g class="${cls}">${rect(x, y, w, 48)}${t(x + 12, y + 22, title)}${subtitle ? label(x + 12, y + 38, subtitle) : ''}</g>`;
  }
  function svg(body, name = 'Packet transformation diagram') { return `<svg class="diagram" viewBox="0 0 900 140" role="img" aria-label="${esc(name)}">${body}</svg>`; }
  function packetStrip(headers, payload, opts = {}) {
    const x = 50, y = 43, widths = headers.map(h => h.length > 10 ? 145 : 95), total = widths.reduce((a, b) => a + b, 0), pw = Math.max(150, 775 - total);
    let at = x, body = '';
    headers.forEach((h, i) => { body += rect(at, y, widths[i], 51) + t(at + 12, y + 30, h); at += widths[i]; });
    body += rect(at, y, pw, 51, 'box', opts.encrypted ? 'stroke-dasharray="4 3"' : '') + rect(at, y, pw, 51, 'soft') + t(at + 14, y + 30, short(payload, Math.floor(pw / 9)));
    if (opts.note) body += label(x, 120, opts.note);
    return svg(`<g class="packet">${body}</g>`);
  }
  function routeDiagram(names, active = 2, tunnel = false) {
    const gap = 750 / Math.max(1, names.length - 1), xs = names.map((_, i) => 60 + gap * i);
    let body = line(60, 62, 810, 62, 'faint');
    if (tunnel) body += rect(xs[0] - 24, 39, xs[names.length - 2] - xs[0] + 48, 46, 'stroke', 'stroke-dasharray="5 5"') + label(xs[1] + 20, 23, 'ENCRYPTED TUNNEL');
    names.forEach((name, i) => { body += node(xs[i], name); if (i < names.length - 1) body += arrow(xs[i] + gap / 2, 62); });
    const a = Math.min(active, names.length - 1), px = Math.min(xs[a] - 45, 760);
    body += `<g class="packet">${rect(px, 44, 80, 36)}${t(px + 12, 67, tunnel ? 'sealed' : 'packet', 'font-size="11"')}</g>`;
    return svg(body);
  }
  function segmentsDiagram(p, window = false) {
    const count = Math.min(6, p.segments.length), start = 50, gap = 126;
    let body = line(35, 71, 855, 71, 'faint');
    for (let i = 0; i < count; i++) {
      const s = p.segments[i];
      body += box(start + i * gap, 46, 110, `SEG ${i + 1}`, `${s.data.length} B · ${s.seq}`, 'packet');
      body += label(start + i * gap, 118, window ? (i < 3 ? `ACK ${s.seq + s.data.length}` : 'waiting') : `seq ${s.seq}`);
    }
    if (window) body += rect(40, 33, Math.min(count, 3) * gap - 5, 73, 'stroke', 'stroke-dasharray="4 4"') + label(50, 21, 'WINDOW = 3 SEGMENTS');
    return svg(body);
  }
  function waveDiagram(bitstream, encoding = state.encoding, amplitude = 1) {
    const value = bitstream.slice(0, 24), samples = E.encodeSignal(value, encoding), width = 800 / samples.length;
    let path = '', last = 0;
    samples.forEach((level, i) => {
      const y = 67 - level * 24 * amplitude, x = 50 + i * width;
      path += i ? `L${x} ${last}L${x} ${y}` : `M${x} ${y}`;
      path += `L${x + width} ${y}`; last = y;
    });
    let body = line(50, 67, 850, 67, 'faint') + `<path d="${path}" class="stroke" stroke-width="2"/>`;
    [...value].forEach((b, i) => { body += label(50 + i * 800 / value.length + 8, 120, b); });
    body += label(50, 17, `${encoding} · first ${value.length} payload bits · illustrative voltage`);
    return svg(body, `${encoding} waveform of ${value}`);
  }
  function diagram(mode, vpn) {
    const p = state.pipeline, data = p.presentation, fp = vpn ? p.vpn.frame : p.direct.frame;
    if (matchMedia('(max-width:650px)').matches) return compactDiagram(mode, vpn);
    const preview = short(p.app.body, 39), ciphertext = E.hex(data.payload.slice(0, 18));
    switch (mode) {
      case 'setup': return routeDiagram(vpn ? ['Device', 'Router', 'ISP', 'VPN gateway'] : ['Device', 'Router', 'ISP', 'Destination'], state.step);
      case 'auth': return svg(box(65, 45, 180, 'Client identity', vpn ? 'authorized' : 'ordinary client') + line(245, 69, 625, 69, 'stroke', 'stroke-dasharray="5 5"') + t(355, 53, vpn ? 'verify ↔ accept' : 'no VPN authentication') + box(625, 45, 205, vpn ? 'VPN certificate' : 'Destination', vpn ? 'trusted gateway' : 'HTTPS: own certificate'));
      case 'keys': return svg(box(65, 43, 190, vpn ? 'Client key' : 'Application', 'independent endpoint') + line(255, 67, 615, 67) + t(335, 57, vpn ? 'AES-256-GCM' : 'HTTPS / TLS') + box(615, 43, 215, vpn ? 'Gateway key' : 'Destination key', vpn ? 'same tunnel key' : 'not a VPN key') + label(65, 122, 'Conceptual setup · keys are generated locally, not exchanged across a real network'));
      case 'route-ready': return routeDiagram(vpn ? ['Device', 'Virtual interface', 'VPN gateway', 'Destination'] : ['Device', 'Default route', 'ISP', 'Destination'], 1, vpn);
      case 'message': return svg(label(55, 24, 'USER DATA') + box(55, 44, 350, preview, `${E.utf8(p.app.body).length} bytes before metadata`, 'packet') + line(405, 68, 720, 68) + arrow(720, 68) + t(744, 74, 'application'));
      case 'metadata': return packetStrip(['App metadata'], preview, { note: `${p.app.header.protocol} · ${p.app.header.sender} → ${p.app.header.receiver} · ${p.app.header.type}` });
      case 'json': return svg(box(50, 44, 175, 'JSON request', `${p.raw.length} UTF-8 bytes`, 'packet') + line(225, 68, 405, 68) + arrow(405, 68) + box(420, 44, 175, 'FIFO queue', '1 → validated → sent') + line(595, 68, 725, 68) + arrow(725, 68) + t(740, 74, 'layer 6'));
      case 'bytes': return svg(label(50, 25, 'UTF-8') + t(50, 70, E.hex(p.raw.slice(0, 28)).match(/.{2}/g).join(' '), 'font-size="18"') + label(50, 112, `${p.raw.length} bytes · Base64 preview: ${E.base64(p.raw).slice(0, 45)}…`));
      case 'compress': return svg(box(55, 44, 195, 'Original JSON', `${p.raw.length} B`) + line(250, 68, 600, 68) + t(330, 53, state.compression ? 'RLE enabled' : 'RLE bypassed') + arrow(600, 68) + box(620, 44, 210, 'Output bytes', `${data.compressed.length} B`, 'packet') + label(55, 124, state.compression ? 'RLE uses count/value byte pairs. Compression can expand varied text.' : 'Compression is off. Open Inspect layer to test RLE on these exact bytes.'));
      case 'encrypt': return packetStrip(['Presentation'], data.encrypted ? ciphertext : preview, { encrypted: data.encrypted, note: data.encrypted ? 'Application AES-GCM ciphertext · the same protection on BOTH routes' : 'HTTP: application bytes are readable · VPN protection will be added at layer 3' });
      case 'hash': return svg(label(50, 25, 'SHA-256 OF THE ORIGINAL JSON') + t(50, 70, p.hash.slice(0, 32), 'font-size="20"') + t(50, 101, p.hash.slice(32), 'font-size="20"') + label(540, 94, 'compare again at receiver'));
      case 'session': return svg(box(50, 44, 210, 'Authenticated', 'token accepted') + line(260, 68, 460, 68) + arrow(460, 68) + box(480, 44, 350, 'Application session', `ID ${p.session.id.slice(0, 18)}…`, 'packet'));
      case 'checkpoint': {
        const cps = p.session.checkpoints.slice(0, 6); let body = line(60, 65, 820, 65);
        cps.forEach((cp, i) => { const x = 70 + i * 130; body += line(x, 54, x, 78) + label(x, 107, `${cp} B`) + t(x, 36, i === cps.length - 1 ? 'resume here' : 'saved', 'font-size="11"'); });
        return svg(body + label(620, 125, '128-byte checkpoints'));
      }
      case 'stream': return packetStrip(['Session info'], data.encrypted ? 'controlled ciphertext stream' : 'controlled byte stream', { note: `state: ${p.session.state} · ID ${p.session.id.slice(0, 8)} · metadata is not an extra Internet wire header` });
      case 'handshake': return svg(line(80, 25, 80, 120, 'faint') + line(800, 25, 800, 120, 'faint') + line(80, 40, 800, 40) + arrow(800, 40) + t(355, 31, 'SYN · seq 0') + line(800, 75, 80, 75) + t(290, 67, '← SYN-ACK · seq 0 · ack 1') + line(80, 110, 800, 110) + arrow(800, 110) + t(330, 102, 'ACK · seq 1 · ack 1'));
      case 'segments': return segmentsDiagram(p);
      case 'checksum': return packetStrip(['TCP header'], `segment 1 · ${p.segments[0].data.length} B`, { note: `51514 → ${p.segments[0].dport} · seq 0 · ack 1 · checksum 0x${p.segments[0].checksum.toString(16).padStart(4, '0')} · ${E.validSegment(p.segments[0]) ? 'VALID' : 'INVALID'}` });
      case 'window': return segmentsDiagram(p, true);
      case 'inner': return packetStrip(['IP', 'TCP'], data.encrypted ? 'HTTPS ciphertext' : 'HTTP content', { note: 'source 192.168.1.10 → actual destination 203.0.113.80 · TTL 64', encrypted: data.encrypted });
      case 'tunnel': return vpn ? packetStrip(['Outer IP', 'UDP 4500'], 'encrypted [ inner IP | TCP | data ]', { note: `visible destination: ${p.vpn.outer.dst} · inner packet hidden · +56 bytes per packet`, encrypted: true }) : packetStrip(['IP', 'TCP'], data.encrypted ? 'HTTPS ciphertext' : 'HTTP content', { note: 'visible destination: 203.0.113.80 · no tunnel encapsulation', encrypted: data.encrypted });
      case 'routing': return routeDiagram(vpn ? ['Client', 'Router', 'ISP', 'VPN gateway'] : ['Client', 'Router', 'ISP', 'Destination'], 1, vpn);
      case 'hops': return routeDiagram(vpn ? ['Client', 'Router / NAT', 'ISP', 'VPN gateway'] : ['Client', 'Router / NAT', 'ISP', 'Relay', 'Destination'], 2, vpn);
      case 'fragment': {
        const b = vpn ? p.vpn.outer.bytes.slice(20) : p.direct.ip.bytes.slice(20), fragments = E.fragment(b, 100);
        let body = label(50, 22, 'EXPERIMENTAL MTU = 100 B · 20 B IP HEADER');
        fragments.slice(0, 6).forEach((f, i) => { body += box(50 + i * 132, 45, 117, `${f.data.length} B`, `offset ${f.offset}`, 'packet'); });
        return svg(body + label(50, 122, `${fragments.length} fragments · actual next-link MTU is assumed sufficient in the main pipeline`));
      }
      case 'mac': return svg(box(50, 44, 250, 'Your interface', fp.src) + line(300, 68, 545, 68) + arrow(545, 68) + box(565, 44, 265, 'Next-hop router', fp.dst) + label(50, 124, 'MAC addresses are local-hop identifiers. They change on the next link.'));
      case 'frame': return packetStrip(['Dst MAC', 'Src MAC', 'Type'], vpn ? 'outer IP · tunnel payload · CRC' : 'IP · TCP · payload · CRC', { note: `${fp.bytes.length} B modeled frame · CRC-32 0x${fp.crc.toString(16).padStart(8, '0')}` });
      case 'crc': return svg(box(50, 44, 245, `CRC 0x${fp.crc.toString(16)}`, 'receiver recomputes') + line(295, 68, 550, 68) + t(360, 53, 'MATCH ✓') + arrow(550, 68) + box(570, 44, 260, 'Switch lookup', `${fp.dst} → port 1`) + label(50, 124, 'Flip a bit in the inspector to see CRC reject the damaged frame.'));
      case 'bits': return svg(label(50, 24, `${fp.bytes.length} MODELED FRAME BYTES → ${fp.bytes.length * 8} BITS`) + t(50, 70, E.bits(fp.bytes).slice(0, 48).match(/.{8}/g).join(' '), 'font-size="18"') + label(50, 115, 'Preview: first 6 bytes. The entire frame is serialized in the live-data inspector.'));
      case 'wave': return waveDiagram(E.bits(fp.bytes.slice(fp.headerSize + 20)));
      case 'noise': return waveDiagram(E.bits(fp.bytes.slice(fp.headerSize + 20)), state.encoding, .65);
      case 'tdm': return svg(label(50, 24, 'TIME-DIVISION MULTIPLEXING · TWO EXAMPLE CHANNELS') + E.tdm(['ABCD', '1234']).map((v, i) => rect(50 + i * 96, 48, 85, 43) + t(84 + i * 96, 75, v)).join('') + label(50, 122, 'A · 1 · B · 2 · C · 3 · D · 4 → time'));
      case 'unwrap': return vpn ? svg(box(50, 43, 230, 'Outer IP + UDP', 'remove tunnel wrapper') + line(280, 67, 510, 67) + arrow(510, 67) + box(530, 43, 300, 'Recovered inner packet', 'AES-GCM tag verified', 'packet')) : routeDiagram(['Client', 'Router', 'ISP', 'Destination'], 3);
      case 'exit': return routeDiagram(vpn ? ['Gateway / NAT', 'Onward network', 'Destination'] : ['Home NAT', 'ISP', 'Destination'], 1);
      case 'boundary': return packetStrip(['IP', 'TCP'], data.encrypted ? 'HTTPS remains encrypted to destination' : 'HTTP is now readable on the onward path', { note: vpn ? 'source at destination: VPN exit 203.0.113.7 · tunnel has ended' : 'source at destination: home public IP 198.51.100.24', encrypted: data.encrypted });
      case 'receive': return svg(['L1 bits', 'L2 frame', 'L3 IP', 'L4 TCP', 'L5 session', 'L6 decode', 'L7 data'].map((v, i) => box(25 + i * 124, 44, 112, v, i < 4 ? 'validate' : 'restore', 'packet')).join(''));
      case 'reassemble': return svg(box(50, 43, 190, `${p.segments.length} segments`, 'ordered by sequence') + line(240, 67, 575, 67) + t(315, 52, data.encrypted ? 'decrypt → decode' : 'decode bytes') + arrow(575, 67) + box(595, 43, 245, 'Original JSON', `${p.raw.length} bytes restored`, 'packet'));
      case 'delivered': return svg(`<g class="delivered-check">${t(50, 80, '✓', 'font-size="44"')}${t(112, 66, 'MESSAGE DELIVERED', 'font-size="18"')}${label(112, 93, `${p.integrity ? 'SHA-256 matches' : 'INTEGRITY FAILED'} · ${p.raw.length} original bytes`)}</g>` + rect(550, 38, 280, 64) + t(565, 75, short(p.received.body, 29)));
      default: return packetStrip([], preview);
    }
  }

  // On a phone, redraw the information rather than shrinking desktop text to 5 px.
  function compactDiagram(mode, vpn) {
    const p = state.pipeline, frame = vpn ? p.vpn.frame : p.direct.frame;
    const content = p.presentation.encrypted ? 'HTTPS bytes' : 'HTTP bytes';
    const views = {
      setup: ['Device', 'Router / ISP', vpn ? 'VPN gateway' : 'Destination'],
      auth: ['Identity', 'Verify', vpn ? 'Gateway' : 'HTTPS peer'],
      keys: ['Client', vpn ? 'Tunnel key' : 'TLS key', vpn ? 'Gateway' : 'Destination'],
      'route-ready': ['Device', vpn ? 'VPN interface' : 'Default route', vpn ? 'Gateway' : 'Destination'],
      message: ['User request', `${E.utf8(p.app.body).length} bytes`, 'Application'],
      metadata: [p.app.header.protocol, 'App metadata', 'User data'],
      json: ['JSON', `${p.raw.length} bytes`, 'FIFO queue'],
      bytes: ['Text', 'UTF-8', `${p.raw.length} bytes`],
      compress: [`${p.raw.length} B`, state.compression ? 'RLE' : 'Bypass', `${p.presentation.compressed.length} B`],
      encrypt: ['App bytes', p.presentation.encrypted ? 'AES-GCM' : 'No encryption', content],
      hash: ['Original', 'SHA-256', p.hash.slice(0, 9)],
      session: ['Authorize', 'Session ID', p.session.id.slice(0, 8)],
      checkpoint: ['Stream', 'Save offset', `${p.session.checkpoints.at(-1)} B`],
      stream: ['Session', p.session.state, 'Transport'],
      handshake: ['SYN →', '← SYN-ACK', 'ACK →'],
      segments: ['Stream', '96 B chunks', `${p.segments.length} segments`],
      checksum: ['TCP header', `:${p.segments[0].dport}`, 'Checksum ✓'],
      window: ['Window: 3', 'Send / ACK', 'Retransmit'],
      inner: ['Inner IP', 'TCP', content],
      tunnel: vpn ? ['Outer IP', 'UDP 4500', 'Sealed IP…'] : ['IP', 'TCP', content],
      routing: ['Router', 'Look up IP', vpn ? 'VPN gateway' : 'Destination'],
      hops: ['NAT router', 'ISP', vpn ? 'VPN gateway' : 'Destination'],
      fragment: ['IP payload', 'MTU: 100 B', `${E.fragment(vpn ? p.vpn.outer.bytes.slice(20) : p.direct.ip.bytes.slice(20), 100).length} fragments`],
      mac: ['Device MAC', 'Local link', 'Router MAC'],
      frame: ['MAC header', vpn ? 'Tunnel IP' : 'Direct IP', 'CRC-32'],
      crc: ['Frame', 'CRC match ✓', 'Switch port 1'],
      bits: [`${frame.bytes.length} B`, 'Serialize', `${frame.bytes.length * 8} bits`],
      tdm: ['A · 1', 'B · 2', 'C · 3'],
      unwrap: vpn ? ['Tunnel IP', 'Decrypt', 'Inner IP'] : ['ISP', 'Forward', 'Destination'],
      exit: [vpn ? 'VPN exit IP' : 'Home NAT IP', 'Onward path', 'Destination'],
      boundary: ['Tunnel ends', p.presentation.encrypted ? 'HTTPS stays' : 'HTTP visible', 'Destination'],
      receive: ['L1 → L3', 'L4 → L6', 'L7 data'],
      reassemble: [`${p.segments.length} segments`, 'Decode', 'Original JSON'],
      delivered: ['Delivered ✓', 'SHA-256 ✓', short(p.received.body, 11)],
    };
    if (mode === 'wave' || mode === 'noise') {
      const b = E.bits(frame.bytes.slice(frame.headerSize + 20)).slice(0, 12), samples = E.encodeSignal(b, state.encoding), w = 320 / samples.length;
      let d = '', last = 0;
      samples.forEach((level, i) => { const y = 51 - level * (mode === 'noise' ? 13 : 21), x = 14 + i * w; d += i ? `L${x} ${last}L${x} ${y}` : `M${x} ${y}`; d += `L${x + w} ${y}`; last = y; });
      return `<svg class="diagram" viewBox="0 0 350 110" role="img" aria-label="${esc(state.encoding)} waveform">${label(14, 15, state.encoding)}${line(14, 51, 334, 51, 'faint')}<path d="${d}" class="stroke"/>${t(14, 98, [...b].join(' '), 'font-size="12"')}</svg>`;
    }
    const titles = views[mode] || ['Input', 'Process', 'Output'];
    const body = titles.map((title, i) => {
      const x = 6 + i * 116;
      return rect(x, 30, 105, 43) + t(x + 8, 57, title, 'font-size="11"') + (i < 2 ? arrow(x + 112, 52) : '');
    }).join('');
    return `<svg class="diagram" viewBox="0 0 350 110" role="img" aria-label="${esc(titles.join(' → '))}"><g class="packet">${body}</g></svg>`;
  }

  chapters.forEach((chapter, index) => {
    const section = document.createElement('section'); section.className = 'chapter'; section.dataset.chapter = chapter.id;
    section.setAttribute('aria-label', `${chapter.title} comparison`); section.setAttribute('aria-hidden', 'true'); section.inert = true;
    section.innerHTML = ['vpn', 'direct'].map(lane => `<div class="lane ${lane}"><div class="lane-label"><h3>${lane === 'vpn' ? 'With VPN' : 'Direct'}</h3><p>${lane === 'vpn' ? 'TUNNELLED ROUTE' : 'STANDARD ROUTE'}</p></div><div class="lane-content"><div class="lane-diagram"></div><p class="lane-caption"></p></div></div>`).join('');
    $('track').append(section);
    const button = document.createElement('button'); button.innerHTML = `<span>${esc(chapter.number)}</span>${esc(chapter.title)}`;
    button.setAttribute('aria-label', `Go to ${chapter.title}`); button.addEventListener('click', () => go(index, 0)); $('layer-nav').append(button);
  });
  function render() {
    const chapter = chapters[state.chapter], step = chapter.steps[state.step];
    $('chapter-kicker').textContent = chapter.number === '00' ? 'BEFORE THE REQUEST / TUNNEL SETUP' : `LAYER ${chapter.number} / ${chapter.unit.toUpperCase()}`;
    if (state.chapter >= 8) $('chapter-kicker').textContent = chapter.unit.toUpperCase();
    $('chapter-title').textContent = chapter.title; $('step-title').textContent = step[0]; $('step-caption').textContent = step[1];
    const sections = [...$('track').children];
    sections.forEach((section, i) => {
      const wasActive = section.classList.contains('active'); section.classList.toggle('leaving', wasActive && i !== state.chapter);
      section.classList.toggle('active', i === state.chapter); section.setAttribute('aria-hidden', String(i !== state.chapter)); section.inert = i !== state.chapter;
      if (wasActive && i !== state.chapter) setTimeout(() => section.classList.remove('leaving'), 700);
    });
    const section = sections[state.chapter];
    for (const lane of ['vpn', 'direct']) {
      section.querySelector(`.${lane} .lane-diagram`).innerHTML = diagram(step[4], lane === 'vpn');
      section.querySelector(`.${lane} .lane-caption`).textContent = step[lane === 'vpn' ? 2 : 3];
    }
    $('track').style.transform = `translateX(-${state.chapter * 100}%)`;
    const current = chapters.slice(0, state.chapter).reduce((n, c) => n + c.steps.length, 0) + state.step + 1;
    const total = chapters.reduce((n, c) => n + c.steps.length, 0);
    $('step-count').textContent = `${String(current).padStart(2, '0')} / ${total}`;
    $('previous').disabled = state.chapter === 0 && state.step === 0;
    $('next').disabled = state.chapter === chapters.length - 1 && state.step === chapter.steps.length - 1;
    $('next').title = state.step === chapter.steps.length - 1 && state.chapter < chapters.length - 1 ? `Continue to ${chapters[state.chapter + 1].title}` : 'Next step (→ or Space)';
    [...$('layer-nav').children].forEach((b, i) => { if (i === state.chapter) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current'); });
    $('microsteps').replaceChildren();
    chapter.steps.forEach((s, i) => {
      const b = document.createElement('button'); b.className = i === state.step ? 'current' : i < state.step ? 'done' : '';
      b.setAttribute('aria-label', `${chapter.title}: ${s[0]}`); b.title = s[0]; if (i === state.step) b.setAttribute('aria-current', 'step');
      b.addEventListener('click', () => go(state.chapter, i)); $('microsteps').append(b);
    });
    if ($('inspector').open) fillInspector();
  }
  function go(chapter, step) { if (!state.running || state.busy) return; state.chapter = chapter; state.step = step; render(); }
  function next() {
    if (!state.running || $('next').disabled) return;
    if (state.step < chapters[state.chapter].steps.length - 1) go(state.chapter, state.step + 1);
    else if (state.chapter < chapters.length - 1) go(state.chapter + 1, 0);
  }
  function previous() {
    if (state.step > 0) go(state.chapter, state.step - 1);
    else if (state.chapter > 0) go(state.chapter - 1, chapters[state.chapter - 1].steps.length - 1);
  }
  async function rebuild() {
    state.pipeline = await E.build($('message').value, { protocol: $('protocol').value, file: state.file, compression: state.compression });
  }
  async function start(event) {
    event?.preventDefault(); if (state.busy) return;
    state.busy = true; $('start').disabled = true; $('input-error').textContent = '';
    try {
      if (!globalThis.crypto?.subtle) throw Error('Web Crypto is unavailable. Open this page at localhost:8000 using “npm start”.');
      await rebuild(); state.running = true; state.chapter = 0; state.step = 0;
      $('intro').hidden = true; $('presentation').hidden = false; $('layer-nav').hidden = false; $('inspect').disabled = false;
      $('skip-link').href = '#presentation';
      render(); $('next').focus();
    } catch (error) { $('input-error').textContent = error.message; $('message').focus(); }
    finally { state.busy = false; $('start').disabled = false; }
  }
  function restart() {
    state.running = false; state.chapter = 0; state.step = 0; $('intro').hidden = false; $('presentation').hidden = true;
    $('layer-nav').hidden = true; $('inspect').disabled = true; $('start').focus();
    $('skip-link').href = '#intro';
  }
  $('request-form').addEventListener('submit', start); $('next').addEventListener('click', next); $('previous').addEventListener('click', previous); $('restart').addEventListener('click', restart);
  $('home').addEventListener('click', event => { event.preventDefault(); if (state.running) restart(); else $('message').focus(); });
  $('file').addEventListener('change', async () => {
    const file = $('file').files[0]; if (!file) return;
    const allowed = ['txt', 'json', 'csv', 'png', 'jpg', 'jpeg', 'pdf'];
    try {
      if (!allowed.includes(file.name.split('.').at(-1).toLowerCase())) throw Error('Unsupported file type. Use TXT, JSON, CSV, PNG, JPG or PDF.');
      if (file.size > 8192) throw Error('Use a file up to 8 KiB for a readable demonstration.');
      if (!file.size) throw Error('The file is empty.');
      const bytes = new Uint8Array(await file.arrayBuffer());
      state.file = { name: file.name, type: file.type || 'application/octet-stream', size: file.size };
      $('message').value = E.base64(bytes); $('message').readOnly = true;
      $('file-status').textContent = `${short(file.name, 22)} · ${file.size} B`;
      $('remove-file').hidden = false; $('input-error').textContent = '';
    } catch (error) { $('input-error').textContent = error.message; $('file').value = ''; }
  });
  function removeFile() {
    if (!state.file) return; state.file = null; $('file').value = ''; $('message').readOnly = false; $('message').value = 'Hello, network.';
    $('file-status').textContent = 'or use → to step through'; $('remove-file').hidden = true;
  }
  $('remove-file').addEventListener('click', removeFile);
  matchMedia('(max-width:650px)').addEventListener('change', () => { if (state.running) render(); });
  async function fullscreen() { try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); } catch { $('fullscreen').title = 'Fullscreen is not available in this browser.'; } }
  $('fullscreen').addEventListener('click', fullscreen);

  function updateThemeButton() {
    const btn = $('theme-toggle');
    if (!btn) return;
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    btn.textContent = isDark ? 'Light' : 'Dark';
    btn.setAttribute('aria-label', isDark ? 'Switch to light theme' : 'Switch to dark theme');
    btn.title = isDark ? 'Switch to light theme' : 'Switch to dark theme';
  }
  function toggleTheme() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const nextTheme = isDark ? 'light' : 'dark';
    if (nextTheme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
    else document.documentElement.removeAttribute('data-theme');
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', nextTheme === 'dark' ? '#141715' : '#ffffff');
    try { localStorage.setItem('theme', nextTheme); } catch (_) {}
    updateThemeButton();
  }
  if ($('theme-toggle')) {
    $('theme-toggle').addEventListener('click', toggleTheme);
    updateThemeButton();
  }
  document.addEventListener('keydown', event => {
    if ($('inspector').open || event.altKey || event.ctrlKey || event.metaKey || event.repeat || /^(TEXTAREA|INPUT|SELECT)$/.test(event.target.tagName)) return;
    if (event.key.toLowerCase() === 'f') { event.preventDefault(); fullscreen(); }
    if (event.key === 'ArrowRight' || (event.code === 'Space' && event.target.tagName !== 'BUTTON')) { event.preventDefault(); state.running ? next() : start(); }
    if (event.key === 'ArrowLeft' && state.running) { event.preventDefault(); previous(); }
  });

  function liveData() {
    const p = state.pipeline, sample = p.segments[0], v = p.vpn, d = p.direct;
    switch (chapters[state.chapter].id) {
      case 'connect': return { endpoint: v.outer.dst, tunnel: 'Illustrative L3 UDP tunnel', cipher: 'AES-256-GCM', keys: 'fresh, in-memory, non-extractable', route: '0.0.0.0/0 → virtual VPN interface (conceptual)', applicationProtocol: p.app.header.protocol };
      case 'application': return p.app;
      case 'presentation': return { teachingHeader: { encoding: 'UTF-8', compression: p.presentation.compression, encryption: p.presentation.encrypted ? 'AES-256-GCM (illustrative HTTPS content protection)' : 'none (HTTP)' }, originalBytes: p.raw.length, compressedBytes: p.presentation.compressed.length, payloadBytes: p.presentation.payload.length, base64: short(p.presentation.base64, 250), sha256: p.hash };
      case 'session': return { teachingHeader: { id: p.session.id, state: p.session.state, checkpoints: p.session.checkpoints }, token: p.session.token, note: 'Application/session teaching model, not a literal wire header or VPN session.' };
      case 'transport': return { handshake: p.handshake, segmentCount: p.segments.length, firstSegment: { sourcePort: sample.sport, destinationPort: sample.dport, seq: sample.seq, ack: sample.ack, timestamp: sample.timestamp, timestampNote: 'Teaching metadata, not a TCP timestamp option in this 20-byte header', checksum: `0x${sample.checksum.toString(16)}`, valid: E.validSegment(sample), bytes: sample.data.length }, window: 3, note: 'Internet-style ones-complement checksum over modeled TCP header + payload; pseudo-header omitted.' };
      case 'network': return { inner: { src: d.ip.src, dst: d.ip.dst, ttl: d.ip.ttl, bytes: d.ip.bytes.length }, outer: { src: v.outer.src, dst: v.outer.dst, protocol: 'UDP / 17', bytes: v.outer.bytes.length }, directOptimalRoute: p.route, manualTable: routingTable, hopTrace: p.trace };
      case 'link': return { destinationMAC: d.frame.dst, sourceMAC: d.frame.src, direct: { bytes: d.frame.bytes.length, crc: E.hex(d.frame.bytes.slice(-4)), valid: E.validFrame(d.frame) }, vpn: { bytes: v.frame.bytes.length, crc: E.hex(v.frame.bytes.slice(-4)), valid: E.validFrame(v.frame) }, frameHexPreview: E.hex(v.frame.bytes.slice(0, 96)), note: 'No preamble, padding or inter-frame gap. Bit stuffing and CSMA/CD are separate media experiments.' };
      case 'physical': return { encoding: state.encoding, directBits: d.frame.bytes.length * 8, vpnBits: v.frame.bytes.length * 8, first128Bits: E.bits(v.frame.bytes).slice(0, 128), voltageModel: 'NRZ: 0 = -1, 1 = +1. Manchester: 0 = low/high, 1 = high/low. NRZI: 1 changes level.', BER: 0, topology: 'Local switched star → routed backbone → destination star' };
      case 'gateway': return { gateway: v.outer.dst, outerBytes: v.outer.bytes.length, innerBytes: d.ip.bytes.length, removedOverhead: v.outer.bytes.length - d.ip.bytes.length, egressSource: '203.0.113.7 (modeled exit NAT)', directSource: E.nat({ src: d.ip.src, sport: sample.sport }), onwardContentEncrypted: p.presentation.encrypted, note: 'The VPN gateway can see the inner destination. It does not remove HTTPS protection.' };
      case 'receiver': return { received: p.received, integrity: p.integrity, sha256: p.hash, segmentsReassembled: p.segments.length, framesValidated: p.vpn.packets.length + p.direct.frames.length, encapsulation: encapsulation(p), sessionState: p.session.state };
    }
  }
  const routingTable = [ { prefix: '203.0.113.0', bits: 24, via: 'ISP edge' }, { prefix: '192.168.1.0', bits: 24, via: 'LAN' }, { prefix: '0.0.0.0', bits: 0, via: 'default router' } ];
  function encapsulation(p) { return [
    ['Application', 'JSON + teaching metadata', p.raw.length],
    ['Presentation', p.presentation.encrypted ? 'AES-GCM content' : 'HTTP content', p.presentation.payload.length],
    ['Session', 'endpoint metadata; no extra wire bytes', p.presentation.payload.length],
    ['Transport', '20-byte modeled TCP header', p.segments[0].data.length + 20],
    ['Network / direct', '20-byte IPv4 header', p.direct.ip.bytes.length],
    ['Network / VPN', 'outer IPv4 + UDP + IV + auth tag', p.vpn.outer.bytes.length],
    ['Link / VPN', '14-byte Ethernet header + 4-byte CRC', p.vpn.frame.bytes.length],
    ['Physical / VPN', 'binary bits, not bytes', p.vpn.frame.bytes.length * 8],
  ]; }
  function output(value, visual = '') {
    $('lab-result').textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    $('lab-visual').innerHTML = visual;
  }
  function frameFault() {
    const original = state.pipeline.vpn.frame, bad = { ...original, bytes: original.bytes.slice() };
    const index = 14 + crypto.getRandomValues(new Uint8Array(1))[0] % Math.max(1, bad.bytes.length - 18);
    bad.bytes[index] ^= 1;
    return { bad, index, validBefore: E.validFrame(original), validAfter: E.validFrame(bad), ber: E.ber(E.bits(original.bytes), E.bits(bad.bytes)) };
  }
  const actions = {
    connect: [
      ['Verify authentication', () => { let rejected = false; try { new E.Session(false); } catch { rejected = true; } output(`Unauthorized client: ${rejected ? 'REJECTED' : 'ACCEPTED'}\nAuthorized client: ${new E.Session(true).state.toUpperCase()}\nNo network connection is made.`, diagram('auth', true)); }],
      ['Generate fresh keys', async () => { const b = E.utf8('gateway authentication test'), s = await E.seal(b); output(`Fresh AES-256-GCM key generated (non-extractable).\nIV: ${E.hex(s.iv)}\nCiphertext: ${E.hex(s.data)}\nDecrypted: ${E.text(await E.open(s))}`, diagram('keys', true)); }],
      ['Show tunnel route', () => output('Conceptual route installation:\n0.0.0.0/0 → virtual interface → tunnel gateway\nGateway 203.0.113.7 retains a route via the real interface to avoid a routing loop.\nOnly the client-to-gateway leg is tunnel-protected.', diagram('route-ready', true))],
    ],
    application: [
      ['Queue a second message', () => { queue.enqueue(E.application(`Queued request ${queue.items.length + 1}`, { protocol: state.pipeline.app.header.protocol })); output({ queue: queue.items.map(x => x.body), count: queue.items.length, behavior: 'FIFO: dequeue sends the oldest request.' }, diagram('json', true)); }],
      ['Send queued message', () => { const sent = queue.dequeue(); output(sent ? { sent, remaining: queue.items.length, presentationInputBytes: E.utf8(JSON.stringify(sent)).length } : 'Queue empty. Add a message first.', diagram('json', true)); }],
      ['Validate invalid input', () => { try { E.application(' '); } catch (e) { output(`REJECTED: ${e.message}\nFile input also rejects unsupported extensions, empty files and files over 8 KiB.\nValid JSON message: ${JSON.stringify(state.pipeline.app.header)}`); } }],
      ['Forward to presentation', () => output({ validated: true, nextLayer: 'Presentation', bytes: E.utf8(JSON.stringify(state.pipeline.app)).length, json: state.pipeline.app }, diagram('bytes', true))],
    ],
    presentation: [
      ['Encode / decode Base64', () => { const b = state.pipeline.raw, encoded = E.base64(b); output({ encoding: 'Base64 (not encryption)', encoded: short(encoded, 200), decodedMatches: E.hex(E.unbase64(encoded)) === E.hex(b), utf8Bytes: b.length }, diagram('bytes', true)); }],
      ['Toggle RLE compression', async () => { state.compression = !state.compression; await rebuild(); render(); output({ enabled: state.compression, before: state.pipeline.raw.length, after: state.pipeline.presentation.compressed.length, roundTrip: E.hex(E.unrle(E.rle(state.pipeline.raw))) === E.hex(state.pipeline.raw), note: 'Optional educational compression before encryption, not TLS compression.' }, diagram('compress', true)); }],
      ['Encrypt / decrypt AES', async () => { const b = state.pipeline.raw, s = await E.seal(b); output({ algorithm: 'AES-256-GCM', plaintextBytes: b.length, ciphertextAndTagBytes: s.data.length, nonceBytes: s.iv.length, ciphertext: short(E.hex(s.data), 160), decryptedMatches: E.hex(await E.open(s)) === E.hex(b) }, diagram('encrypt', true)); }],
      ['Tamper with ciphertext', async () => { const s = await E.seal(state.pipeline.raw); s.data[0] ^= 1; try { await E.open(s); output('FAILED: tamper accepted'); } catch { output('REJECTED: AES-GCM authentication tag does not match.\nModified ciphertext cannot be decrypted successfully.'); } }],
      ['Binary ↔ text', () => { const b = state.pipeline.raw.slice(0, 24); output({ utf8: E.text(b), bits: E.bits(b), decoded: E.text(E.fromBits(E.bits(b))) }); }],
      ['Verify SHA-256', async () => output({ expected: state.pipeline.hash, actual: await E.sha256(state.pipeline.raw), match: await E.sha256(state.pipeline.raw) === state.pipeline.hash }, diagram('hash', true))],
    ],
    session: [
      ['Interrupt / recover', () => { const s = state.pipeline.session; s.state = 'interrupted'; const offset = s.recover(); output(`Session interrupted.\nRecovered session ${s.id}\nResume offset: ${offset} bytes (last checkpoint)\nState: ${s.state}`, diagram('checkpoint', true)); }],
      ['Simulate idle timeout', () => { const s = state.pipeline.session; const expired = s.expire(30001, 30000); output(`Inactivity: 30,001 ms\nTimeout: 30,000 ms\nExpired: ${expired}\nState: ${s.state}`); }],
      ['Start concurrent sessions', () => { const sessions = [new E.Session(true), new E.Session(true), new E.Session(true)]; output(sessions.map(s => ({ id: s.id, state: s.state, independentToken: s.token })), diagram('session', true)); }],
      ['Check synchronization token', () => { const s = state.pipeline.session; s.recover(); output({ validToken: s.sync(s.token), invalidToken: s.sync('incorrect-token'), authenticated: true }); }],
      ['Teardown / initiate', () => { const s = state.pipeline.session; s.close(); const old = s.id; state.pipeline.session = new E.Session(true); output({ closedSession: old, oldState: s.state, newSession: state.pipeline.session.id, newState: state.pipeline.session.state }); }],
    ],
    transport: [
      ['Three-way handshake', () => output(state.pipeline.handshake.join('\n'), diagram('handshake', true))],
      ['Drop a segment', () => { const tx = E.transfer(state.pipeline.segments, { lost: 0 }); output({ events: tx.events.slice(0, 18), retransmissions: tx.retries, reassembledMatches: E.hex(E.reassemble(tx.received)) === E.hex(state.pipeline.presentation.payload) }, segmentsDiagram(state.pipeline, true)); }],
      ['Corrupt TCP checksum', () => { const p = state.pipeline, s = { ...p.segments[0], data: p.segments[0].data.slice() }; s.data[0] ^= 1; const tx = E.transfer(p.segments, { corrupt: 0 }); output({ corruptedSegmentAccepted: E.validSegment(s), recovery: tx.events.slice(0, 9), retransmissions: tx.retries, finalStreamValid: E.hex(E.reassemble(tx.received)) === E.hex(p.presentation.payload) }, diagram('checksum', true)); }],
      ['Sliding window / ACKs', () => output(E.transfer(state.pipeline.segments, { window: 3 }).events.slice(0, 24), segmentsDiagram(state.pipeline, true))],
      ['Reassemble out of order', () => output({ arrivalSequence: [...state.pipeline.segments].reverse().map(s => s.seq), restored: E.hex(E.reassemble([...state.pipeline.segments].reverse())) === E.hex(state.pipeline.presentation.payload) }, diagram('reassemble', true))],
    ],
    network: [
      ['Routing table lookup', () => output({ destination: '203.0.113.80', match: E.lookup('203.0.113.80', routingTable), table: routingTable, policy: 'Longest matching prefix wins.' }, diagram('routing', false))],
      ['Dijkstra optimal route', () => output({ graph: E.graph, selected: E.route(E.graph, 'Client', 'Destination') }, routeDiagram(E.route(E.graph, 'Client', 'Destination').path, 2))],
      ['Fail a relay / reroute', () => { const r = E.route(E.graph, 'Client', 'Destination', ['Relay']); output({ failedNode: 'Relay', before: state.pipeline.route, after: r }, routeDiagram(r.path, 2)); }],
      ['Expire TTL', () => output({ initialTTL: 1, result: E.trace(state.pipeline.route.path, 1), outcome: 'Discard at Router; simulated ICMP time exceeded.' }, diagram('hops', false))],
      ['Fragment / reassemble', () => { const bytes = state.pipeline.vpn.outer.bytes.slice(20), f = E.fragment(bytes, 100); output({ mtu: 100, fragments: f.map(x => ({ offsetBytes: x.offset, ipv4OffsetUnits: x.offset / 8, moreFragments: x.more, payloadBytes: x.data.length })), reassembled: E.hex(E.defragment([...f].reverse())) === E.hex(bytes) }, diagram('fragment', true)); }],
      ['NAT translation', () => { const packet = { src: '192.168.1.10', sport: 51514, dst: '203.0.113.80', dport: state.pipeline.segments[0].dport }; output({ before: packet, after: E.nat(packet), reverseMapping: '198.51.100.24:62001 → 192.168.1.10:51514' }, diagram('exit', false)); }],
      ['Destination unreachable', () => output({ blocked: ['Relay', 'Gateway', 'Destination'], route: E.route(E.graph, 'Client', 'Destination', ['Relay', 'Gateway', 'Destination']), outcome: 'No route: destination unreachable. Packet is not forwarded.' })],
      ['Traceroute', () => output(state.pipeline.trace, diagram('hops', false))],
    ],
    link: [
      ['Flip a frame bit / CRC', () => { const f = frameFault(); output({ flippedByte: f.index, beforeCRC: f.validBefore, afterCRC: f.validAfter, BER: f.ber, result: 'Damaged frame discarded. TCP must recover the missing data.' }, diagram('crc', true)); }],
      ['Bit stuff / unstuff', () => { const original = E.bits(state.pipeline.vpn.frame.bytes); const stuffed = E.stuff(original); output({ originalBits: original.length, stuffedBits: stuffed.length, restoredExactly: E.unstuff(stuffed) === original, example: { input: '01111110', stuffed: E.stuff('01111110'), rule: 'Insert 0 after five 1s. HDLC-style example, not Ethernet encoding.' } }); }],
      ['Shared-medium collision', () => output({ startsInSlot: [0, 0], ...E.collision([0, 0]), note: 'CSMA/CD teaching simulation: detect simultaneous transmitters, then back off to different slots. Modern switched full-duplex Ethernet does not use collisions.' })],
      ['Switch MAC lookup', () => { const table = { '02:00:00:00:00:01': 1, '02:00:00:00:00:0a': 2 }; output({ table, destination: state.pipeline.vpn.frame.dst, forwardingPort: E.switchPort(state.pipeline.vpn.frame.dst, table), unknownMAC: E.switchPort('02:ff:00:00:00:00', table) }, diagram('mac', true)); }],
      ['Tag VLAN 42', () => { const f = E.frame(state.pipeline.vpn.outer.bytes, 42); output({ vlan: f.vlan, etherType: '0x8100', TCI: '0x002a', headerBytes: f.headerSize, frameBytes: f.bytes.length, crcValid: E.validFrame(f), extraBytes: f.bytes.length - state.pipeline.vpn.frame.bytes.length }, packetStrip(['MACs', 'VLAN 42', 'Type'], 'outer IP · encrypted payload · CRC')); }],
    ],
    physical: [
      ...['NRZ', 'Manchester', 'NRZI'].map(encoding => [encoding, () => { state.encoding = encoding; output({ encoding, samples: E.encodeSignal(E.bits(state.pipeline.vpn.frame.bytes.slice(34)).slice(0, 24), encoding) }, waveDiagram(E.bits(state.pipeline.vpn.frame.bytes.slice(34)), encoding)); }]),
      ['Inject noise / measure BER', () => { const f = frameFault(); output({ randomFlippedByte: f.index, alteredBits: 1, totalBits: f.bad.bytes.length * 8, BER: f.ber, crcAccepted: f.validAfter, outcome: 'CRC detected the damaged frame.' }, waveDiagram(E.bits(f.bad.bytes.slice(f.bad.headerSize + 20)))); }],
      ['Attenuate over 100 m', () => { const a = E.attenuate(1, 100); output({ initialAmplitude: 1, distanceMeters: 100, attenuationDbPerMeter: .02, receivedAmplitude: a, model: 'Amplitude = A × 10^(−dB/20)' }, waveDiagram(E.bits(state.pipeline.vpn.frame.bytes.slice(34)), state.encoding, a)); }],
      ['Interleave TDM channels', () => output({ channels: ['ABCD', '1234'], slots: E.tdm(['ABCD', '1234']), demultiplexed: ['ABCD', '1234'] }, diagram('tdm', true))],
      ['Show hybrid topology', () => output(E.hybridTopology(), routeDiagram(['LAN star', 'Router', 'Backbone', 'Router', 'Server star'], 2))],
    ],
    gateway: [
      ['Decrypt inner packet', async () => { const p = state.pipeline.vpn.packets[0], bytes = await E.open(p.encrypted); output({ outerBytes: p.outer.bytes.length, decryptedInnerBytes: bytes.length, matchesOriginal: E.hex(bytes) === E.hex(p.inner.bytes), innerDestination: p.inner.dst, innerHeader: E.hex(bytes.slice(0, 20)) }, diagram('unwrap', true)); }],
      ['Compare observer visibility', () => output({ localISP_VPN: 'Gateway IP 203.0.113.7, timing and traffic volume. Inner IP and payload are tunnel-encrypted.', localISP_Direct: 'Destination IP 203.0.113.80, timing and volume. HTTPS content remains encrypted.', vpnProvider: 'Your source IP and inner destination. HTTPS content stays encrypted; HTTP content is readable.', destination: { vpn: '203.0.113.7', direct: '198.51.100.24' }, warning: 'VPN is not anonymity. DNS routing, split tunneling and browser tracking are outside this full-tunnel IP example.' }, diagram('boundary', true))],
    ],
    receiver: [
      ['Run verification', verifyPipeline],
      ['Encapsulation table', () => output(encapsulation(state.pipeline).map(([layer, header, n]) => `${layer.padEnd(20)} ${String(n).padStart(5)} ${layer.startsWith('Physical') ? 'bits' : 'B'} · ${header}`).join('\n') + '\n\nTransport onward shows the first segment, not the entire multi-frame transfer.')],
      ['Verify failed transmission', async () => { const p = state.pipeline, f = frameFault(); const s = { ...p.segments[0], data: p.segments[0].data.slice() }; s.data[0] ^= 1; let incomplete = false; try { E.reassemble(p.segments.slice(1)); } catch { incomplete = true; } output({ frameCorruptionRejected: !E.validFrame(f.bad), tcpCorruptionRejected: !E.validSegment(s), missingSegmentRejected: incomplete, result: 'PASS · damaged or incomplete traffic is not delivered as successful.' }); }],
      ['Close session', () => { state.pipeline.session.close(); output({ session: state.pipeline.session.id, state: state.pipeline.session.state, messageDelivered: state.pipeline.integrity }, diagram('delivered', true)); }],
      ['Download received data', downloadReceived],
    ],
  };
  async function verifyPipeline() {
    const p = state.pipeline, recovered = await E.build(p.app.body, { protocol: p.app.header.protocol, file: state.file, compression: state.compression });
    const tx = E.transfer(p.segments, { lost: 0 });
    const checks = [ ['VPN and direct receiver round trip', recovered.received.body === p.app.body && recovered.integrity], ['All link CRCs valid', p.direct.frames.every(E.validFrame) && p.vpn.packets.every(v => E.validFrame(v.frame))], ['IPv4 headers valid', p.direct.packets.every(v => E.validIP(v.bytes)) && p.vpn.packets.every(v => E.validIP(v.outer.bytes))], ['All TCP checksums valid', p.segments.every(E.validSegment)], ['Out-of-order reassembly', E.hex(E.reassemble([...p.segments].reverse())) === E.hex(p.presentation.payload)], ['Loss and retransmission recovery', tx.retries === 1 && E.hex(E.reassemble(tx.received)) === E.hex(p.presentation.payload)], ['Noise rejected at link', !frameFault().validAfter], ['Application hash matches', await E.sha256(p.raw) === p.hash] ];
    output(checks.map(([name, passed]) => `${passed ? 'PASS' : 'FAIL'} · ${name}`).join('\n'), diagram('delivered', true));
  }
  function downloadReceived() {
    const app = state.pipeline.received, isFile = !!app.header.filename;
    const blob = new Blob([isFile ? E.unbase64(app.body) : app.body], { type: isFile ? 'application/octet-stream' : 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = isFile ? app.header.filename : 'received-message.txt'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    output(`Verified receiver data downloaded: ${a.download}\n${blob.size} original content bytes. Uploaded files are never executed or rendered.`);
  }
  function fillInspector() {
    const chapter = chapters[state.chapter]; $('inspect-title').textContent = chapter.title;
    $('inspect-note').textContent = chapters[state.chapter].steps[state.step][1] + ' These controls run on the current request; nothing is transmitted.';
    $('inspect-data').textContent = JSON.stringify(liveData(), null, 2);
    $('assignment-checklist').replaceChildren();
    for (const requirement of Coverage[chapter.id]) {
      const item = document.createElement('li'); item.textContent = requirement; $('assignment-checklist').append(item);
    }
    $('experiments').replaceChildren(); $('lab-result').textContent = ''; $('lab-visual').innerHTML = '';
    for (const [name, run] of actions[chapter.id]) {
      const button = document.createElement('button'); button.textContent = name;
      button.addEventListener('click', async () => {
        if (state.busy) return; state.busy = true; button.disabled = true;
        try { await run(); $('inspect-data').textContent = JSON.stringify(liveData(), null, 2); }
        catch (error) { output(`Experiment failed: ${error.message}`); }
        finally { state.busy = false; button.disabled = false; }
        [...$('experiments').children].forEach(b => b.classList.toggle('selected', b.textContent === name));
      }); $('experiments').append(button);
    }
  }
  $('inspect').addEventListener('click', () => { fillInspector(); $('inspector').showModal(); });
  $('close-inspector').addEventListener('click', () => $('inspector').close());
  $('inspector').addEventListener('click', event => { if (event.target === $('inspector')) { const r = $('inspector').getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) $('inspector').close(); } });
  // A concise live announcement avoids having two entire SVG lanes read after every click.
  $('step-title').setAttribute('aria-live', 'polite'); $('step-title').setAttribute('aria-atomic', 'true');
})();
