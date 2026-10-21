import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { validateBridge } from './catalog.js';

export const credentialHash = key => crypto.createHash('sha256').update(key).digest('hex');
const failures = new Map();
export function currentBridge(paths) {
  if (!fs.existsSync(paths.manifest)) return undefined;
  const value = JSON.parse(fs.readFileSync(paths.manifest, 'utf8').replace(/^\uFEFF/, ''));
  return value.bridge && Object.keys(value.bridge).length ? validateBridge(value.bridge) : undefined;
}

export async function refreshMetadata(paths, { fetcher = fetch, force = false } = {}) {
  const bridge = currentBridge(paths);
  if (!bridge) return { status: 'disconnected' };
  const hash = credentialHash(bridge.key);
  const identity = `${bridge.gateway}:${hash}`;
  const failed = failures.get(identity);
  if (!force && failed && failed.until > Date.now()) return { status: 'unavailable', reason: failed.reason };
  const unavailable = reason => {
    if (failures.size >= 64) failures.clear();
    failures.set(identity, { until: Date.now() + 30000, reason });
    return { status: 'unavailable', reason };
  };
  if (!force && fs.existsSync(paths.gatewayMetadata)) {
    try {
      const old = JSON.parse(fs.readFileSync(paths.gatewayMetadata, 'utf8'));
      if (old.gateway === bridge.gateway && old.credentialHash === hash && Date.now() - old.fetchedAt < 60000) return { status: 'cached' };
    } catch { /* Refresh a malformed cache. */ }
  }
  try {
    const response = await fetcher(`${bridge.gateway}/v1/models`, { headers: { Authorization: `Bearer ${bridge.key}` }, signal: AbortSignal.timeout(5000), redirect: 'error' });
    if (!response.ok) return unavailable(`http-${response.status}`);
    let size = 0;
    const chunks = [];
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > 4 * 1024 * 1024) throw new Error('catalog-too-large');
      chunks.push(chunk);
    }
    const data = JSON.parse(Buffer.concat(chunks).toString('utf8')).data;
    if (!Array.isArray(data)) return unavailable('invalid-catalog');
    const models = data.filter(m => typeof m.id === 'string').map(m => ({ id: m.id,
      native_endpoints: Array.isArray(m.native_endpoints) ? m.native_endpoints.filter(p => typeof p === 'string') : [] }));
    const now = currentBridge(paths);
    if (!now || now.gateway !== bridge.gateway || now.key !== bridge.key) return { status: 'superseded' };
    fs.mkdirSync(path.dirname(paths.gatewayMetadata), { recursive: true, mode: 0o700 });
    const temp = `${paths.gatewayMetadata}.${process.pid}.tmp`;
    try {
      fs.writeFileSync(temp, JSON.stringify({ gateway: bridge.gateway, credentialHash: hash, fetchedAt: Date.now(), models }), { mode: 0o600 });
      fs.renameSync(temp, paths.gatewayMetadata);
    } finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
    failures.delete(identity);
    return { status: 'refreshed', models: models.length };
  } catch { return unavailable('catalog-request-failed'); }
}
