/* Each click is a teaching action, not a timer. OSI numbers descend at the sender. */
globalThis.Story = [
  { id: 'connect', title: 'Connect', number: '00', unit: 'Tunnel setup', steps: [
    ['Contact the VPN gateway', 'The VPN client reaches a known gateway using the ordinary network.', 'Your device → router → ISP → VPN gateway. No tunnel exists yet.', 'The direct route needs no VPN gateway or tunnel setup.', 'setup'],
    ['Authenticate both ends', 'A secure setup verifies identities before accepting a tunnel.', 'The client verifies the gateway; the gateway accepts an authorized client.', 'Normal networking does not authenticate a VPN gateway.', 'auth'],
    ['Agree on tunnel keys', 'The peers derive shared traffic keys; a password is not the traffic key.', 'A fresh AES-GCM key is generated for this educational tunnel.', 'HTTPS still negotiates its own independent application keys.', 'keys'],
    ['Install the tunnel route', 'The VPN client routes destination traffic into a virtual network interface.', 'The tunnel is ready. Inner destination traffic now goes to the gateway.', 'The original default route still leads straight to the destination.', 'route-ready'],
  ] },
  { id: 'application', title: 'Application', number: '07', unit: 'Message', steps: [
    ['Create the request', 'Both paths begin with exactly the same user data.', 'The application hands your request to the networking stack.', 'The same request starts here; a VPN does not change what you wrote.', 'message'],
    ['Add application metadata', 'Protocol, sender, receiver, timestamp and content type describe the message.', 'The teaching header identifies the intended destination, not the VPN gateway.', 'The application header is identical on the direct path.', 'metadata'],
    ['Structure and queue', 'The request becomes UTF-8 JSON and enters a first-in, first-out buffer.', 'One structured message is queued, then validated for transfer.', 'The same JSON is passed to the next layer.', 'json'],
  ] },
  { id: 'presentation', title: 'Presentation', number: '06', unit: 'Bytes', steps: [
    ['Translate into bytes', 'Characters become UTF-8 bytes; Base64 is an encoding, not encryption.', 'The exact same byte stream enters both paths.', 'There is no privacy benefit from encoding alone.', 'bytes'],
    ['Compress before encryption', 'Optional RLE is a teaching transform; small messages may grow instead of shrink.', 'The compression control determines whether RLE runs.', 'Compression is independent of whether a VPN is used.', 'compress'],
    ['Protect application content', 'HTTPS protects content on both routes. HTTP does not.', 'Application encryption and tunnel encryption are separate protections.', 'HTTPS remains encrypted even without a VPN.', 'encrypt'],
    ['Fingerprint the payload', 'SHA-256 lets the receiver verify that the reconstructed message is identical.', 'A digest is computed from the original structured bytes.', 'The final digest must match on both routes.', 'hash'],
  ] },
  { id: 'session', title: 'Session', number: '05', unit: 'Stream', steps: [
    ['Open an application session', 'A session ID tracks this logical exchange, not the VPN tunnel itself.', 'An authenticated teaching session is created for the request.', 'Direct traffic uses the same application-session model.', 'session'],
    ['Synchronize and checkpoint', 'A token synchronizes the session; byte checkpoints allow a simulated resume.', 'A checkpoint records the last completed part of the stream.', 'Recovery is an application feature, not a VPN-only feature.', 'checkpoint'],
    ['Pass the controlled stream', 'An active session sends its stream to transport; idle sessions can time out.', 'Session metadata stays at the endpoint in this simulation.', 'OSI session behavior is modeled; it is not an extra TCP/IP wire header.', 'stream'],
  ] },
  { id: 'transport', title: 'Transport', number: '04', unit: 'Segment', steps: [
    ['Open the TCP connection', 'SYN → SYN-ACK → ACK establishes the application transport connection.', 'The inner TCP connection is between the client and destination.', 'The same three-way handshake runs directly.', 'handshake'],
    ['Segment the stream', 'The payload is split into 96-byte chunks with source and destination ports.', 'Inner TCP segments retain the application destination port.', 'HTTPS uses port 443; HTTP uses port 80.', 'segments'],
    ['Number and check each segment', 'Sequence numbers track byte offsets; a checksum detects corruption.', 'The VPN has not wrapped these segments yet.', 'A corrupt segment must not enter the reassembled stream.', 'checksum'],
    ['Send, acknowledge, recover', 'A sliding window permits several segments in flight; loss triggers retransmission.', 'TCP reliability belongs to the inner connection.', 'Direct TCP also uses acknowledgments and retransmissions.', 'window'],
  ] },
  { id: 'network', title: 'Network', number: '03', unit: 'Packet', steps: [
    ['Address the inner packet', 'An IP header identifies the client and the actual destination.', 'Inner IP: 192.168.1.10 → 203.0.113.80.', 'The direct packet has the same original destination.', 'inner'],
    ['Encrypt and encapsulate', 'The VPN encrypts the complete inner IP packet, then adds an outer header.', 'Outer IP → UDP → encrypted inner IP + TCP + application data.', 'No extra tunnel header: IP → TCP → application data.', 'tunnel'],
    ['Choose the next hop', 'Routers forward by the visible IP destination, using a routing table.', 'The local network can see the VPN gateway, not the inner destination.', 'The local network can see the destination IP, even with HTTPS.', 'routing'],
    ['Forward across the network', 'Routing costs select a path; TTL limits forwarding; NAT rewrites the public source.', 'The router sends the outer packet toward 203.0.113.7.', 'The router sends the direct packet toward 203.0.113.80.', 'hops'],
    ['Respect the link MTU', 'Oversized IPv4 payloads can fragment; the receiver reassembles by byte offset.', 'The tunnel adds overhead, leaving less room for inner data.', 'The MTU experiment shows fragment boundaries and reassembly.', 'fragment'],
  ] },
  { id: 'link', title: 'Data link', number: '02', unit: 'Frame', steps: [
    ['Address the next local hop', 'MAC addresses identify neighbors on this link, not remote websites.', 'The destination MAC is the local router, not the VPN server.', 'The next-hop MAC is the same local router.', 'mac'],
    ['Wrap the IP packet', 'An Ethernet header and CRC-32 trailer form a frame.', 'The frame carries the outer, tunnel-encrypted IP packet.', 'The frame carries the original destination IP packet.', 'frame'],
    ['Check and forward the frame', 'The receiver checks CRC; a switch uses its MAC table to select a port.', 'Every hop uses a new link frame; the VPN tunnel persists across hops.', 'A failed CRC causes the frame to be discarded on either route.', 'crc'],
  ] },
  { id: 'physical', title: 'Physical', number: '01', unit: 'Bits / signal', steps: [
    ['Serialize the frame', 'Each frame byte becomes eight bits ready for a physical medium.', 'The tunnel is now just bits on the wire, like any other traffic.', 'Direct traffic also becomes a binary bitstream.', 'bits'],
    ['Encode a physical signal', 'NRZ maps bits to voltage levels; Manchester adds a mid-bit transition.', 'The waveform samples 24 transport bits carried inside the frame.', 'Physical encoding does not itself encrypt the traffic.', 'wave'],
    ['Transmit through the medium', 'Noise may flip bits; attenuation reduces amplitude with distance.', 'CRC and TCP detect or recover damage; encryption tags detect tampering.', 'The same physical impairments affect the direct route.', 'noise'],
    ['Share the medium', 'Time-division multiplexing interleaves channel time slots.', 'VPN and direct are separate comparison runs, not duplicate real transmissions.', 'A hybrid topology combines local stars with a routed backbone.', 'tdm'],
  ] },
  { id: 'gateway', title: 'VPN gateway', number: '↗', unit: 'Tunnel exit', steps: [
    ['Remove the tunnel wrapper', 'The VPN gateway validates and decrypts the tunnel payload.', 'Outer IP + UDP + VPN protection are removed; the inner packet is recovered.', 'The direct packet never visits a VPN gateway.', 'unwrap'],
    ['Forward to the destination', 'The VPN gateway sends the recovered traffic onward using its egress address.', 'The destination sees the VPN exit IP instead of your home public IP.', 'The destination sees your router’s public NAT address.', 'exit'],
    ['Know where protection ends', 'The tunnel ends at the gateway. HTTPS continues to the destination.', 'Without HTTPS, the gateway and onward network can read application content.', 'Without HTTPS, the direct path can expose application content throughout.', 'boundary'],
  ] },
  { id: 'receiver', title: 'Receiver', number: '✓', unit: 'Decapsulation', steps: [
    ['Climb back up the stack', 'Bits → frames → IP → TCP → session → presentation → application.', 'Every frame and segment is checked before reassembly.', 'The same receiver stack reconstructs direct traffic.', 'receive'],
    ['Reassemble and reverse transforms', 'Order segments, decrypt application data, decompress, then decode JSON.', 'The actual tunnel ciphertext is decrypted and reassembled.', 'Direct-path bytes reconstruct the same original message.', 'reassemble'],
    ['Verify delivery and close', 'The received SHA-256 must match. The application session can now close.', 'Same message delivered. Extra protection on the client-to-gateway path.', 'Same message delivered. No VPN tunnel or hidden inner destination.', 'delivered'],
  ] },
];
