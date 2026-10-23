# VPN / Direct — design and implementation plan

## Brief
One continuous, horizontally translated HTML canvas. VPN is always above direct networking. Start, Previous, Next, keyboard arrows and a compact layer index are the only primary controls. No automatic advancement. Each layer has several deliberate microsteps, followed by a right-to-left transition into the next layer. Technical details and experiments live in an optional inspector.

## Visual direction
DD Tokens reference: `../../DAA/Assignment/index.html`, `style.css`, reviewed without modifying them. Preserve compact navigation, a single sentence per step, and concrete data structures. Reduce further to a flat charcoal surface, hairlines, warm white typography, mint VPN / amber direct. No gradients, shadows, KPI cards, decorative icons, or remote font dependency.

Research: NN/g, [Aesthetic and Minimalist Design](https://www.nngroup.com/articles/aesthetic-minimalist-design/) and [Progressive Disclosure](https://www.nngroup.com/articles/progressive-disclosure/). Prioritize signal over decoration; stage necessary information and disclose advanced controls on request. A dashboard was rejected because it competes with the packet; separate pages were rejected because they break spatial continuity.

## Architecture
Dependency-free static HTML/CSS/classic JavaScript, usable offline through index.html. `engine.js` exposes pure, testable networking algorithms and an async browser Web Crypto pipeline; `story.js` defines the presentation; `app.js` handles rendering and interactions. Native dialog hosts actual byte data and interactive experiments. No external services or genuine VPN connection.

## Accuracy
Seven OSI layers are a teaching model, not literal independent Internet protocols. Synthetic application, presentation and session headers are explicitly identified. AES-GCM and SHA-256 are real; this is not a TLS or IPsec implementation. HTTPS and HTTP selectable. Application compression is optional and occurs before encryption. An illustrative UDP-encapsulated L3 tunnel encrypts the inner packet and has a distinct outer IP. IPv4, TCP and Ethernet headers are simplified but binary lengths, checksums, CRC, segmentation, routing and signal operations are computed. Receiver reverses transformations and verifies integrity. No claim of VPN anonymity or encryption after the gateway.

## Milestones
1. Requirements, design, failing algorithm tests. Commit and attempt push.
2. Engine: formatting, queue, compression, encryption, sessions, segmentation/checksum, routing, fragmentation, NAT, frames, CRC, stuffing, encoding, fault detection, receiver. Node tests. Commit and attempt push.
3. Presentation: all layers, tunnel establishment and exit, two lanes, horizontal transitions, inspector, input validation, file transfer, fault controls, accessibility, responsive layout. Commit and attempt push.
4. Browser verification: full walkthrough, backward/restart navigation, each experiment, invalid input, file upload, mobile and reduced motion, console errors, screenshots. Coverage matrix and usage docs. Final commit and push attempt.

## Verification
Use Node's built-in test runner for algorithms, encryption round trips, mutation detection, fault/recovery paths, routing correctness and complete transmission. Browser tests must exercise real controls and assert layer changes and successful final receipt. Track every task in `docs/coverage.md`, distinguishing computed operations from protocol simulations. Preserve the source assignment unchanged.
