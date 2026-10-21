// Copies the original icon without editing its artwork. A local DS Bot install
// provides the asset distributed by upstream v0.2.0 (Apache-2.0).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const exe = process.env.DS_BOT_EXE;
if (!exe) throw new Error('Set DS_BOT_EXE to the installed DeepSeek Bot executable.');
const source = path.join(path.dirname(exe), 'resources', 'app.asar', 'assets', 'icon.svg');
const code = `process.stdout.write(require('node:fs').readFileSync(${JSON.stringify(source)}, 'utf8'))`;
const svg = execFileSync(exe, ['-e', code], { windowsHide: true, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8', timeout: 15000 });
if (!svg.includes('<svg') || !svg.includes('</svg>')) throw new Error('Invalid SVG icon.');
fs.writeFileSync('icon.svg', svg);
const uri = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
pkg.magpie.icon = uri;
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
let agent = fs.readFileSync('agent.js', 'utf8');
if (/^  icon: /m.test(agent)) agent = agent.replace(/^  icon: .*$/m, `  icon: '${uri}',`);
else agent = agent.replace("  name: 'DeepSeek Bot',", `  name: 'DeepSeek Bot',\n  icon: '${uri}',`);
fs.writeFileSync('agent.js', agent);
console.log(JSON.stringify({ source: 'DeepSeek Bot v0.2.0 assets/icon.svg', bytes: Buffer.byteLength(svg), locations: ['package.json magpie.icon', 'agent.js agent.icon'] }));
