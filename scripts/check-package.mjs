import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { agent } from '../agent.js';

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
assert.equal(pkg.name, 'magpie-agent-deepseek_bot');
assert.equal(lock.name, pkg.name);
assert.equal(lock.packages[''].name, pkg.name);
assert.equal(lock.version, pkg.version);
assert.equal(pkg.main, undefined);
assert.equal(pkg.magpie.agent, './agent.js');
assert.equal(pkg.magpie.hooks, './bridge.hooks.js');
const icon = fs.readFileSync('icon.svg');
for (const uri of [pkg.magpie.icon, agent.icon]) {
  assert.ok(icon.equals(Buffer.from(uri.split(',')[1], 'base64')), 'Icon bytes differ');
}

for (const file of ['README.md', 'THIRD_PARTY_NOTICES.md', ...fs.readdirSync('docs').filter(f => f.endsWith('.md')).map(f => `docs/${f}`)]) {
  for (const [, link] of fs.readFileSync(file, 'utf8').matchAll(/\]\(([^)]+)\)/g)) {
    const target = link.split('#')[0];
    if (target && !/^[a-z]+:/i.test(target)) assert.ok(fs.existsSync(path.resolve(path.dirname(file), target)), `${file}: ${link}`);
  }
}

assert.ok(process.env.npm_execpath, 'Run this check with npm run check:package');
const [pack] = JSON.parse(execFileSync(process.execPath, [process.env.npm_execpath, 'pack', '--dry-run', '--json'], { encoding: 'utf8', windowsHide: true }));
for (const file of ['agent.js', 'index.js', 'bridge.hooks.js', 'icon.svg', 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'docs/ICON-ATTRIBUTION.md', 'licenses/DS-Bot-NOTICE.txt', 'licenses/DS-Bot-Apache-2.0.txt']) {
  assert.ok(pack.files.some(f => f.path === file), `Missing package file: ${file}`);
}
assert.ok(pack.files.every(f => !/^(?:node_modules|\.smoke|release|\.git)\//.test(f.path)), 'Local artifacts entered package');
console.log(JSON.stringify({ name: pack.name, version: pack.version, files: pack.entryCount, icons: 'identical', notices: 'included', documentLinks: 'valid' }));
