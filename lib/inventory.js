import fs from 'node:fs';
import path from 'node:path';
import { mergeName, slug, sdkProtocol } from './protocol-resolver.js';

const list = value => Array.isArray(value) ? value : [];
const str = value => typeof value === 'string' ? value : undefined;
export const loopback = gateway => { try { return /^(localhost|127(?:\.\d{1,3}){3}|\[?::1\]?)$/i.test(new URL(gateway).hostname); } catch { return false; } };

// Only protocol fields leave this reader. No keys, headers or account identities.
export function readInventory(paths, bridge) {
  const warnings = [];
  const read = (file, fallback) => {
    if (!fs.existsSync(file)) return fallback;
    try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); }
    catch { warnings.push(`invalid-metadata:${path.basename(file)}`); return fallback; }
  };
  const snapshot = read(paths.gatewayMetadata, {});
  const gatewayModels = snapshot.gateway === bridge.gateway && snapshot.credentialHash === paths.credentialHash
    && Date.now() - snapshot.fetchedAt < 300000 ? list(snapshot.models) : [];
  if (!loopback(bridge.gateway)) return { gatewayModels, warnings, providers: [], models: [], groups: {} };
  const config = read(path.join(paths.magpieConfig, 'providers.json'), {});
  const settings = read(path.join(paths.magpieConfig, 'settings.json'), {});
  const cached = read(path.join(paths.magpieCache, 'providers-state.json'), {}).providers || {};
  const plugins = list(read(path.join(paths.magpieConfig, 'plugin-providers.json'), []));
  const providers = new Map(), models = new Map(), memberships = new Map();
  const addModel = (pid, raw) => {
    const id = str(raw.id || raw.ID);
    if (!id) return;
    const ref = `${pid}/${id}`, old = models.get(ref) || {}, apis = raw.auto || raw.APIs || raw.apis;
    models.set(ref, { ...old, id: ref, ...(apis ? { apis: list(apis) } : {}),
      ...(raw.api ? { userAPI: raw.api } : {}), ...(raw.npm ? { npm: raw.npm } : {}),
      ...(raw.merge ? { merge: raw.merge } : {}), ...(raw.same ? { same: raw.same } : {}),
      ...(raw.on !== undefined ? { on: raw.on } : {}) });
  };
  for (const p of list(cached.providers)) {
    providers.set(p.id, { id: p.id, preset: str(p.preset), chat: str(p.chat), responses: str(p.responses), anthropic: str(p.anthropic), gemini: str(p.gemini),
      translated: ['claude', 'devin', 'antigravity', 'gemini'].includes(p.account?.agent), off: p.off === true });
    for (const m of list(p.models)) addModel(p.id, m);
    for (const [model, gs] of Object.entries(p.groups || {})) for (const g of list(gs)) {
      if (!memberships.has(g)) memberships.set(g, new Set());
      memberships.get(g).add(`${p.id}/${model}`);
    }
  }
  for (const p of list(config.providers)) {
    const old = providers.get(p.id) || { id: p.id };
    const endpoints = ['chat', 'responses', 'anthropic', 'gemini'].some(k => p[k]);
    providers.set(p.id, { ...old, preset: str(p.preset) || old.preset,
      ...(endpoints ? { chat: str(p.chat), responses: str(p.responses), anthropic: str(p.anthropic), gemini: str(p.gemini), translated: !!p.gemini && !p.chat && !p.responses && !p.anthropic } : {}), off: p.off === true });
    const live = read(path.join(paths.magpieCache, 'models', `${p.id}.json`), {});
    if (!endpoints && list(live.models).length && p.id === 'codex') providers.get(p.id).responses = 'builtin:codex';
    if (!endpoints && ['claude', 'devin', 'gemini', 'antigravity'].includes(p.id)) providers.get(p.id).translated = true;
    for (const m of list(live.models)) addModel(p.id, m);
    for (const id of list(p.models)) if (typeof id === 'string') addModel(p.id, { id });
  }
  for (const p of plugins) {
    if (p.signedIn === false) continue;
    const own = list(config.providers).find(c => c.id === p.id && (c.chat || c.responses || c.anthropic || c.gemini));
    const suffixed = `${p.id}-plugin`;
    const pid = own || providers.has(suffixed) || bridge.models.some(m => m.id.startsWith(suffixed + '/')) ? suffixed : p.id;
    if (!providers.has(pid)) providers.set(pid, { id: pid });
    for (const m of list(p.models)) {
      addModel(pid, { ...m, npm: m.npm || p.npm });
      const api = sdkProtocol(m.npm || p.npm, pid, m.apiId || m.id || '');
      if (api && api !== 'translated') providers.get(pid)[api] ||= `plugin:${api}`;
    }
  }
  for (const [id, m] of models) {
    delete m.userAPI; // The settings file is authoritative over a stale UI cache.
    if (settings.modelAPIs?.[id]) m.userAPI = settings.modelAPIs[id];
  }
  const groups = {};
  for (const [ref, members] of memberships) groups[ref] = [...members];
  const auto = new Map();
  for (const m of models.values()) {
    const pid = m.id.slice(0, m.id.indexOf('/'));
    if (providers.get(pid)?.off || m.on === false) continue;
    const key = m.same || m.merge || mergeName(m.id);
    if (!auto.has(key)) auto.set(key, new Map());
    if (!auto.get(key).has(pid)) auto.get(key).set(pid, m.id);
  }
  for (const [key, ps] of auto) if (ps.size >= 2) {
    const refs = [...ps.values()];
    groups[`group/auto-${slug(key)}`] = refs;
    for (const m of bridge.models) if (m.id.startsWith('auto/') && slug(mergeName(m.id)) === slug(key)) groups[m.id] = refs;
  }
  for (const m of bridge.models) if (m.id.startsWith('auto/') && !groups[m.id]) {
    const cachedMembers = groups[`group/auto-${slug(mergeName(m.id))}`];
    if (cachedMembers) groups[m.id] = cachedMembers.filter(ref => !providers.get(ref.split('/')[0])?.off);
  }
  for (const g of list(config.groups)) {
    const id = `group/${g.id}`;
    const manual = list(g.members).filter(x => typeof x === 'string').map(x => x.replace(/:(?:off|none|minimal|low|medium|high|xhigh|max|ultra)$/, ''));
    const matched = g.match?.length ? (groups[id] || ['unresolved/group-match']) : [], off = list(g.off);
    groups[id] = [...new Set([...manual, ...matched])].filter(x => !off.includes(x) && !off.includes(x.split('/')[0]) && !providers.get(x.split('/')[0])?.off);
  }
  return { gatewayModels, providers: [...providers.values()], models: [...models.values()], groups, warnings };
}
