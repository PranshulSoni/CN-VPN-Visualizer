# Assignment coverage and model boundaries

Every one of the seven OSI layers has its own GUI, two comparison lanes and deliberate Next/Previous steps. Extra experiments are inside that layer’s inspector. The exact numbered task mapping is maintained in `coverage.js` and is visible **inside the HTML page** under “Assignment checklist · this layer”. No separate report is needed to present it.

## Implementation map

| Source section | Tasks | Computation / model | GUI |
|---|---:|---|---|
| Application | 1–10 | `application`, `MessageQueue`, UTF-8 JSON, file ArrayBuffer/Base64, metadata, validation | Request input; Application steps; queue/send, errors and handoff controls |
| Presentation | 1–10 | `utf8`, `base64`, `unbase64`, `rle`, `unrle`, `seal`, `open`, `sha256`, `bits`, `fromBits`, `build` | Presentation steps and six transform experiments |
| Session | 1–10 | `Session` UUID, auth gate, token, checkpoint, recovery, expiration, close | Session steps; concurrent sessions; interruption/recovery; timeout; teardown |
| Transport | 1–10 | `segment`, `tcpHeader`, `checksum`, `validSegment`, `transfer`, `reassemble` | Three-way handshake; ports, seq, ACK, timestamp; window/loss/checksum/reassembly controls |
| Network | 1–11 | `ipPacket`, `validIP`, `lookup`, `route`, `trace`, `nat`, `fragment`, `defragment` | IP/tunnel diagrams; weighted route and dynamic reroute; TTL, NAT, fragmentation, unreachable and traceroute |
| Data link | 1–10 | `frame`, `crc32`, `validFrame`, `stuff`, `unstuff`, `collision`, `switchPort` | MACs, frame, CRC and switch; bit fault, stuffing, CSMA/CD and VLAN 42 controls |
| Physical | 1–10 | `bits`, `encodeSignal`, `noise`, `ber`, `hybridTopology`, `attenuate`, `tdm` | Bitstream and waveform; three encodings; random-bit noise, BER, attenuation, TDM and hybrid topology |
| Testing / integration | 1–10 | `build`, actual frame/tunnel/segment checks, receiver reassembly, decryption/decompression, SHA-256 | Start → Receiver; verification, failed transmission, live encapsulation table and downloads |
| Testing / integration | 11 | Node + browser test suites; Git repository on master | Source and original task included; **remote publishing blocked by absent GitHub authentication** |

## Important distinctions for viva

1. **OSI versus TCP/IP:** layers 5–7 are conceptual application responsibilities in this demo. Their headers are teaching metadata, not additional mandatory Internet wire headers. JSON is our message format, not a real HTTP wire serializer. The chat/file-sharing simulation is local; it does not connect two people.
2. **Real crypto, simulated protocol:** browser Web Crypto performs real AES-256-GCM and SHA-256 operations. Application encryption demonstrates HTTPS content protection but does not implement TLS records or a TLS handshake. VPN key negotiation and certificates are narrated, not implemented cryptographic exchange. Application IV/key state is held at the endpoint for the receiver demonstration.
3. **VPN packet:** a complete modeled inner IPv4 + TCP + application-data packet is encrypted. Outer IPv4 + UDP + 12-byte nonce + ciphertext + 16-byte tag produces **56 bytes of per-packet overhead**. This is an illustrative UDP-encapsulated L3 tunnel, not interoperable IPsec, WireGuard or OpenVPN. It is not claimed to implement all their headers or security properties.
4. **Full-tunnel scope:** the diagram assumes a route through the VPN, with the gateway itself reachable outside that route. No DNS, IPv6, split-tunnel or traffic-correlation anonymity claim is made.
5. **Transport:** modeled headers contain ports, sequence and ACK numbers, flags, window and checksum. The teaching timestamp is metadata rather than a TCP option. The checksum omits the IP pseudo-header. Handshake, loss, retransmission and flow control are discrete deterministic simulations, not live TCP socket behavior. Mutated segment data really fails checksum validation; the retransmission event model then sends the original segment.
6. **Routing:** Dijkstra finds the minimum-cost path in the supplied graph, and recomputes after a node failure. Real routers normally use longest-prefix forwarding entries, not Dijkstra directly for every packet. NAT, forwarding/TTL and exit-address changes are individually computed simulations; the complete byte pipeline models the first client link, not a packet capture of every hop.
7. **Fragmentation:** the inspector forces a small IPv4 MTU to make fragmentation visible. Fragment byte offsets are multiples of 8 and the actual IPv4 offset units are displayed. The normal transfer assumes adequate MTU. Path MTU discovery and real fragmentation/IPsec policy interactions are out of scope.
8. **Links:** real CRC-32 covers the modeled MAC/EtherType/VLAN header and payload. Preamble, minimum-size padding and inter-frame gaps are omitted. The same addresses describe the first local hop; the diagram explains that later hops replace them. HDLC-style bit stuffing, shared-medium CSMA/CD, tagged Ethernet and voltage encodings are **separate educational experiments**, not a claim that one Ethernet version uses all of them. Collision retry slots are deterministic, not a full exponential-backoff implementation.
9. **Physical:** waveforms sample transport bytes from the modeled frame. The bitstream preview includes the beginning of the complete frame; BER uses the complete frame. Voltage, attenuation and time slots are illustrative signal models, not hardware emulation. Desktop plots show 24 bits; compact phone plots show 12 to keep labels readable.
10. **Receiver:** both routes validate their frames and reconstruct actual bytes. The VPN path decrypts the transmitted tunnel ciphertext, restores segments, decrypts application content when enabled, decompresses when enabled, decodes JSON and checks its original digest. The direct reconstructed stream is compared to the VPN stream. Received file downloads reconstruct the original uploaded bytes.

## Verification evidence

`npm run test:all` runs algorithm tests and browser tests. Tests cover cryptographic round trips and tampering; CRC/checksum mutation; session auth/recovery/expiration; routing and failure; fragmentation; NRZ/Manchester/NRZI; BER; complete HTTP/HTTPS delivery; all 36 sequential steps; every layer’s experiments; Unicode; malicious markup rendered only as text; invalid file types/sizes; exact uploaded/downloaded byte equality; mobile layout; reduced motion; and the standalone page loaded from disk with **zero HTTP requests**.

Design checks include caption bounds at laptop sizes, no horizontal document overflow on phones, native keyboard-operable controls, focus-visible states, modal focus management, a skip link, meaningful diagram labels and reduced-motion support. Desktop and mobile browser screenshots are generated under ignored `test-results/`.
