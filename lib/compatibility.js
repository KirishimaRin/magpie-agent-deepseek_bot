import { ROUTES } from './catalog.js';

// Keep old route/model pairs as explicit aliases until the user prunes them.
// This protects saved Bot selections without reading or editing session logs.
export function compatibilityAliases(routes, entries, state, prune = false) {
  if (prune || !state) return [];
  const canonical = new Map();
  for (const [route, value] of Object.entries(routes)) for (const m of value.models) canonical.set(m.id, { route, model: m });
  const oldRoutes = new Map();
  for (const entry of entries) {
    if (!state.files.includes(entry.file)) continue;
    for (const row of entry.doc.contents?.items || []) {
      if (row.get?.('id') !== 'llm-pi-ai') continue;
      const providers = row.getIn(['config', 'providers'])?.toJSON() || {};
      for (const route of ROUTES) if (providers[route]) oldRoutes.set(route, providers[route]);
    }
  }
  const aliases = new Map();
  for (const [from, route] of oldRoutes) for (const old of route.models || []) {
    const next = canonical.get(old.id);
    if (!next || next.route === from) continue;
    routes[from] ||= { ...route, models: [] };
    const model = { ...next.model, name: `${next.model.name || old.id}（旧接口，建议切换）` };
    // Compatibility options belong to a protocol; do not carry adaptive thinking
    // switches from a new Anthropic route into an old Chat/Responses alias.
    delete model.compat;
    if (old.compat) model.compat = old.compat;
    routes[from].models.push(model);
    aliases.set(`${from}/${old.id}`, { id: old.id, from, to: next.route });
  }
  return [...aliases.values()];
}
