# Packet / Path

A minimal, manually paced Computer Networks assignment: one request, a VPN route above, and a direct route below. **36 steps**, every OSI layer, horizontal layer transitions, no autoplay and no dashboard clutter.

## Open and present

**Double-click [`VPN-Visualizer.html`](VPN-Visualizer.html).** This single file contains everything. Copy it to another computer or send it to your professor; it needs no installation, internet, fonts, backend or supporting files. Use a current Chrome, Edge or Firefox browser.

1. Enter a message, or attach a small file. HTTPS is selected by default.
2. Click **Start**. Use **Next / Previous**, **← / →**, or the layer names along the bottom.
3. Press **F** for fullscreen. Everything waits for you; nothing advances automatically.
4. Open **Inspect layer** when you want live bytes, experiments or that layer’s assignment checklist.
5. At **Receiver**, run **Run verification** and download the received message/file.
6. **Restart** to repeat with HTTP. This makes the difference between application encryption and VPN encryption particularly clear.

Uploaded files stay on your device. Supported extensions: TXT, JSON, CSV, PNG, JPG/JPEG and PDF, up to 8 KiB. Files are converted to bytes, never opened or executed. Text requests support up to 16,000 characters, subject to a 64 KiB byte limit.

## What the professor can see entirely in the page

| Chapter | Main visual | Inspector experiments |
|---|---|---|
| Connect | Gateway contact, authentication, keys, tunnel route | Reject unauthorized sessions; generate encryption keys; route installation |
| Application · L7 | User data → metadata → JSON → FIFO buffer | Queue/send messages; validate input; hand off bytes |
| Presentation · L6 | UTF-8, compression, content encryption, hash | Base64 round trip; optional RLE; AES-GCM; tamper rejection; binary conversion; SHA-256 |
| Session · L5 | Session ID, checkpoints, controlled stream | Interrupt/resume; timeout; concurrency; token synchronization; close/reopen |
| Transport · L4 | TCP handshake, segments, ports, checksum, window | Packet loss; retransmission; checksum corruption; ACKs; out-of-order reassembly |
| Network · L3 | Inner IP, VPN wrapper, routing, NAT, MTU | CIDR lookup; Dijkstra; route failure; TTL; fragments; NAT; unreachable; traceroute |
| Data link · L2 | Neighbor MACs, frame, CRC, forwarding | Random bit flip; CRC validation; stuffing; collision; MAC lookup; VLAN tagging |
| Physical · L1 | Binary stream, waveform, noise, multiplexing | NRZ/Manchester/NRZI; noise/BER; attenuation; TDM; generated hybrid topology |
| VPN gateway | Remove tunnel, forward, protection boundary | Decrypt inner packet; compare observer visibility |
| Receiver | Reverse stack, reassembly, delivery | Integrated verification; failure cases; dynamic encapsulation table; session teardown; download |

The **Assignment checklist · this layer** disclosure maps each numbered source task to its implementation. [`docs/coverage.md`](docs/coverage.md) explains scope and limitations. The supplied DOCX is preserved unchanged.

## Networking accuracy

- **Direct does not mean unencrypted.** HTTPS protects application content on both routes.
- A VPN encrypts an **inner IP packet**, then puts it inside an outer packet addressed to the gateway. The local ISP can still see the gateway address, timing and volume.
- The VPN gateway sees the inner destination. The tunnel ends there; HTTPS continues to the destination. HTTP content is exposed on the onward path.
- This is an **educational simulation**, not working VPN software or a literal TLS/IPsec implementation. Conceptual operations and simplified headers are identified in the page’s model-boundaries disclosure.
- No network requests are made by the standalone demo. Optional external reference links open only if clicked.

## Development (not needed to present)

Source: `index.html`, `style.css`, `engine.js`, `story.js`, `coverage.js`, `app.js`.

```sh
npm install
npx playwright install chromium
npm run test:all
```

`npm test` uses Node’s built-in test runner. Browser tests use Playwright and start a local Python 3 server automatically. The application itself has **zero runtime dependencies**.

```sh
npm run build   # regenerate the portable VPN-Visualizer.html from source
npm start       # optional local development server: http://localhost:8000
node --experimental-test-coverage --test tests/engine.test.cjs
```

## GitHub status

The project uses **master**. The repository is `https://github.com/PranshulSoni/CN-VPN-Visualizer.git`. Authenticate using your local Git credential manager before pushing; do not put access tokens in the remote URL or project files.

```sh
git push -u origin master
```

## References and design

- Source assignment: `Innovative_assignment_task.docx`.
- [IPsec security architecture · RFC 4301](https://www.rfc-editor.org/rfc/rfc4301)
- [TCP · RFC 9293](https://www.rfc-editor.org/rfc/rfc9293)
- [TLS 1.3 · RFC 8446](https://www.rfc-editor.org/rfc/rfc8446)
- [Aesthetic and minimalist design · Nielsen Norman Group](https://www.nngroup.com/articles/aesthetic-minimalist-design/)
- [Progressive disclosure · Nielsen Norman Group](https://www.nngroup.com/articles/progressive-disclosure/)
- Local visual reference: DD Tokens / BPE visualizer in `../../DAA/Assignment/`. Its files were only inspected, not modified.
