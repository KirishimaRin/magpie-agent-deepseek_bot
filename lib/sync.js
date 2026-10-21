import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { isSeq, isMap } from 'yaml';
import { KEY_REF, ROUTES, routesFor, validateBridge } from './catalog.js';
import { resolveProtocols } from './protocol-resolver.js';
import { readInventory } from './inventory.js';
import { credentialHash, currentBridge } from './metadata.js';
import { compatibilityAliases } from './compatibility.js';
import { readDocument } from './yaml-file.js';
export { readDocument } from './yaml-file.js';

const digest = s => crypto.createHash('sha256').update(s).digest('hex');
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const json = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));

function saveFile(file, value, expected) {
  const exists = fs.existsSync(file);
  const current = exists ? fs.readFileSync(file, 'utf8') : undefined;
  if (current !== expected) throw new Error('concurrent-edit-retry');
  if (current === value) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(temp, value, { mode: 0o600, flag: 'wx' });
    // Recheck immediately before replacing an existing file.
    if ((fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : undefined) !== expected) throw new Error('concurrent-edit-retry');
    fs.renameSync(temp, file);
  } finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
  return true;
}

function rowOf(doc) {
  if (!isSeq(doc.contents)) throw new Error('patch-must-be-list');
  // A later metadata-only patch does not replace the row's config.
  const rows = doc.contents.items.filter(n => isMap(n) && n.get('id') === 'llm-pi-ai');
  return rows.findLast(n => n.has('config')) || rows.at(-1);
}

function providersOf(row) {
  const config = row?.get('config');
  if (config !== undefined && !isMap(config)) throw new Error('invalid-pi-config');
  const providers = config?.get('providers');
  if (providers !== undefined && !isMap(providers)) throw new Error('invalid-providers');
  return providers;
}

function putRoutes(entry, routes, cleanup, owned) {
  const { doc } = entry;
  let row = rowOf(doc);
  if (!row && cleanup) return false;
  if (row?.get('disabled') === true && !cleanup) throw new Error('pi-adapter-disabled');
  if (!row) {
    row = doc.createNode({ id: 'llm-pi-ai', config: { providers: {} } });
    row.commentBefore = ' Managed routes: magpie-agent-deepseekbot';
    doc.contents.add(row);
  }
  const providers = providersOf(row);
  let changed = false;
  for (const id of ROUTES) {
    const current = providers?.get(id)?.toJSON();
    if (current !== undefined && !owned) throw new Error('route-name-in-use');
    const desired = cleanup ? undefined : routes[id];
    if (equal(current, desired)) continue;
    if (desired === undefined) row.deleteIn(['config', 'providers', id]);
    else {
      // Preserve user headers/reasoning/compat settings on an owned route.
      const next = { ...current, ...desired };
      const oldModels = new Map((current?.models || []).map(m => [m.id, m]));
      next.models = desired.models.map(m => {
        const old = oldModels.get(m.id);
        return { ...old, ...m, ...(old?.compat || m.compat ? { compat: { ...old?.compat, ...m.compat } } : {}) };
      });
      // A model losing reasoning support must lose the old declaration too.
      for (const m of next.models) if (!desired.models.find(n => n.id === m.id)?.reasoningEfforts) delete m.reasoningEfforts;
      if (equal(current, next)) continue;
      row.setIn(['config', 'providers', id], doc.createNode(next));
    }
    changed = true;
  }
  if (cleanup && isMap(row.getIn(['config', 'providers'])) && row.getIn(['config', 'providers']).items.length === 0) {
    row.deleteIn(['config', 'providers']);
    if (isMap(row.get('config')) && row.get('config').items.length === 0) row.delete('config');
    if (row.items.every(p => ['id', 'name'].includes(p.key.value))) {
      doc.contents.items.splice(doc.contents.items.indexOf(row), 1);
    }
  }
  return changed;
}

function withLock(file, fn) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  let fd;
  try { fd = fs.openSync(file, 'wx', 0o600); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    let pid;
    try { pid = Number(fs.readFileSync(file, 'utf8')); } catch { throw new Error('sync-busy'); }
    // A just-created lock may not have its PID yet.
    if (!Number.isInteger(pid) || pid <= 0) throw new Error('sync-busy');
    try { process.kill(pid, 0); throw new Error('sync-busy'); }
    catch (probe) { if (probe.code !== 'ESRCH') throw new Error('sync-busy'); }
    fs.unlinkSync(file);
    fd = fs.openSync(file, 'wx', 0o600);
  }
  fs.writeFileSync(fd, String(process.pid));
  try { return fn(); } finally { fs.closeSync(fd); fs.unlinkSync(file); }
}

export function inspect(paths, { modelOverrides = {} } = {}) {
  const bridge = currentBridge(paths);
  if (!bridge) return { status: 'disconnected', diagnostics: [], warnings: [] };
  return resolveFor(paths, bridge, modelOverrides);
}

function resolveFor(paths, bridge, modelOverrides) {
  const inventory = readInventory({ ...paths, credentialHash: credentialHash(bridge.key) }, bridge);
  const resolved = resolveProtocols(bridge, inventory, modelOverrides);
  return { status: 'ready', ...resolved };
}

export function sync(paths, { restore = false, modelOverrides = {}, pruneLegacy = false } = {}) {
  return withLock(`${paths.state}.lock`, () => {
    const state = fs.existsSync(paths.state) ? json(paths.state) : undefined;
    if (state && (state.version !== 1 || !Array.isArray(state.files))) throw new Error('invalid-state');
    // Restoration always uses the recorded target, even after the app moves data.
    if (restore) return cleanup(state, paths.state);
    const raw = fs.existsSync(paths.manifest) ? json(paths.manifest) : {};
    if (!raw.bridge || Object.keys(raw.bridge).length === 0) return cleanup(state, paths.state);
    const bridge = validateBridge(raw.bridge);
    if (state && path.resolve(state.dataDir) !== path.resolve(paths.dataDir)) throw new Error('data-moved-restore-first');
    if (!fs.existsSync(paths.profile)) return { status: 'waiting-for-app', dataDir: paths.dataDir };
    const resolved = resolveFor(paths, bridge, modelOverrides);
    const routes = routesFor(bridge, resolved.hints);
    const canonicalCounts = Object.fromEntries(Object.entries(routes).map(([id, r]) => [id, r.models.length]));
    const entries = [readDocument(paths.profile, '[]\n')];
    if (fs.existsSync(paths.homePatch)) {
      const home = readDocument(paths.homePatch, '[]\n');
      if (rowOf(home.doc)?.has('config')) entries.push(home);
    }
    const aliases = compatibilityAliases(routes, entries, state, pruneLegacy);
    const creds = readDocument(paths.credentials, 'version: 1\nrefs: {}\n');
    if (!isMap(creds.doc.contents) || creds.doc.get('version') !== 1) throw new Error('unsupported-credentials');
    if (creds.doc.get('refs') !== undefined && !isMap(creds.doc.get('refs'))) throw new Error('invalid-credential-refs');
    const existingKey = creds.doc.getIn(['refs', KEY_REF]);
    if (existingKey !== undefined && !state) throw new Error('credential-name-in-use');
    const changes = entries.map(entry => ({ entry, changed: putRoutes(entry, routes, false, state?.files.includes(entry.file)) }));
    // Journal ownership before changing credentials or routes; supports interrupted writes.
    const nextState = { version: 1, dataDir: paths.dataDir, credentials: paths.credentials,
      gateway: bridge.gateway, protocolEngine: 1, protocolHints: resolved.hints, compatibilityAliases: aliases,
      files: [...new Set([...(state?.files || []), ...entries.map(e => e.file)])],
      keyHashes: [...new Set([...(state?.keyHashes || []), ...(state?.keyHash ? [state.keyHash] : []), digest(bridge.key)])] };
    const stateRaw = fs.existsSync(paths.state) ? fs.readFileSync(paths.state, 'utf8') : undefined;
    saveFile(paths.state, JSON.stringify(nextState, null, 2) + '\n', stateRaw);
    let writes = 0;
    if (existingKey !== bridge.key) {
      creds.doc.setIn(['refs', KEY_REF], bridge.key);
      writes += Number(saveFile(creds.file, String(creds.doc), creds.raw));
    }
    for (const { entry, changed } of changes) if (changed) writes += Number(saveFile(entry.file, String(entry.doc), entry.raw));
    return { status: 'connected', models: bridge.models.length, routes: Object.keys(routes),
      modelsByRoute: Object.fromEntries(Object.entries(routes).map(([id, r]) => [id, r.models.length])),
      canonicalCounts, compatibilityAliases: aliases, warnings: resolved.warnings,
      fallbackModels: resolved.diagnostics.filter(m => m.status === 'fallback').map(m => ({ id: m.id, reason: m.source })),
      dataDir: paths.dataDir, writes };
  });
}

function cleanup(state, stateFile) {
  if (!state) return { status: 'disconnected', writes: 0 };
  let writes = 0;
  for (const file of state.files) {
    if (!fs.existsSync(file)) continue;
    const entry = readDocument(file, '[]\n');
    if (putRoutes(entry, {}, true, true)) writes += Number(saveFile(file, String(entry.doc), entry.raw));
  }
  if (fs.existsSync(state.credentials)) {
    const entry = readDocument(state.credentials, 'version: 1\n');
    const key = entry.doc.getIn(['refs', KEY_REF]);
    if (typeof key === 'string' && [...(state.keyHashes || []), state.keyHash].includes(digest(key))) {
      entry.doc.deleteIn(['refs', KEY_REF]);
      writes += Number(saveFile(entry.file, String(entry.doc), entry.raw));
    }
  }
  fs.unlinkSync(stateFile);
  return { status: 'disconnected', writes };
}
