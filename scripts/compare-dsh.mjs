// Development-only oracle comparison. Runtime modules never read DSH files.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { paths } from '../lib/paths.js';
import { currentBridge, credentialHash } from '../lib/metadata.js';
import { readInventory } from '../lib/inventory.js';
import { resolveProtocols } from '../lib/protocol-resolver.js';
import { readDocument } from '../lib/yaml-file.js';
const p = paths(), bridge = currentBridge(p);
if (!bridge) throw new Error('Connect the Agent first.');
const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
const pi = file => {
  if (!fs.existsSync(file)) return undefined;
  const { doc } = readDocument(file, '[]');
  return doc.contents.items.filter(n => n.get?.('id') === 'llm-pi-ai' && n.has('config')).at(-1)?.get('config')?.toJSON();
};
const config = pi(path.join(home, 'cordis.patch.yml')) || pi(path.join(home, 'profiles', 'web', 'cordis.patch.yml')) || pi(path.join(home, 'profiles', 'desktop', 'cordis.patch.yml'));
const expected = new Map();
for (const id of ['magpie', 'magpie-responses', 'magpie-anthropic']) {
  const route = config?.providers?.[id];
  if (!route) continue;
  if (String(route.baseURL).replace(/\/+$/, '').replace(/\/v1$/, '') !== bridge.gateway) continue;
  for (const m of route.models || []) expected.set(m.id, route.api);
}
if (!expected.size) throw new Error('No matching native DSH reference catalog.');
const probe = { ...bridge, models: [...expected.keys()].map(id => ({ id })) };
const inv = readInventory({ ...p, credentialHash: credentialHash(bridge.key) }, probe);
const { diagnostics } = resolveProtocols(probe, inv);
const mismatches = diagnostics.filter(m => m.api !== expected.get(m.id)).map(m => ({ id: m.id, expected: expected.get(m.id), actual: m.api, reason: m.source }));
console.log(JSON.stringify({ models: expected.size, matched: expected.size - mismatches.length, mismatches,
  fallbacks: diagnostics.filter(m => m.status === 'fallback').map(m => ({ id: m.id, reason: m.source })) }, null, 2));
if (mismatches.length) process.exitCode = 1;
