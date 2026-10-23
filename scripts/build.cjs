// Reproducible single-file distribution, with no build-time dependency.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
let html = read('index.html').replace('<link rel="stylesheet" href="style.css">', () => `<style>\n${read('style.css')}\n</style>`);
const scripts = ['engine.js', 'story.js', 'coverage.js', 'app.js'];
for (const name of scripts) html = html.replace(`  <script defer src="${name}"></script>\n`, '');
const inline = scripts.map(name => `<script>\n${read(name).replace(/<\/script/gi, '<\\/script')}\n</script>`).join('\n');
html = html.replace('</body>', () => `${inline}\n</body>`);
fs.writeFileSync(path.join(root, 'VPN-Visualizer.html'), html);
console.log(`Built VPN-Visualizer.html (${Buffer.byteLength(html).toLocaleString('en')} bytes) · self-contained, offline`);
