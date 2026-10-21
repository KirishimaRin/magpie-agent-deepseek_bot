export const KEY_REF = 'MAGPIE_DSBOT_GATEWAY_KEY';
export const ROUTES = ['magpie-dsbot', 'magpie-dsbot-responses', 'magpie-dsbot-anthropic'];
const protocols = ['openai-completions', 'openai-responses', 'anthropic-messages'];
const levels = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
const whole = n => Number.isSafeInteger(n) && n > 0;

export function validateBridge(value) {
  if (!value || value.version !== 1 || typeof value.key !== 'string' || !value.key.trim()) throw new Error('invalid-bridge');
  const u = new URL(value.gateway);
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password || u.search || u.hash) throw new Error('invalid-gateway');
  if (!Array.isArray(value.models) || !value.models.length || value.models.some(m => typeof m.id !== 'string' || !m.id.trim())) throw new Error('invalid-models');
  return { ...value, gateway: value.gateway.replace(/\/+$/, '').replace(/\/v1$/, '') };
}

export function routesFor(bridge, overrides = {}) {
  const routes = {};
  for (const m of bridge.models) {
    // Native DSH protocol hints and explicit overrides are merged by the syncer.
    // Unknown models use the gateway's universally supported Chat endpoint.
    const api = overrides[m.id]?.api || 'openai-completions';
    const index = protocols.indexOf(api);
    if (index < 0) throw new Error('unsupported-protocol');
    const id = ROUTES[index];
    routes[id] ||= { displayName: ['Magpie · DS Bot', 'Magpie · DS Bot · Responses', 'Magpie · DS Bot · Anthropic'][index], apiKeyEnv: KEY_REF, api,
      baseURL: bridge.gateway + (index === 2 ? '' : '/v1'), models: [] };
    const model = { id: m.id, name: m.name || m.id, input: m.images ? ['text', 'image'] : ['text'] };
    if (whole(m.context)) model.contextWindow = m.context;
    if (whole(m.output)) model.maxTokens = whole(m.context) ? Math.min(m.output, Math.max(1, Math.floor(m.context / 4))) : m.output;
    const efforts = {};
    for (const level of levels) {
      const wire = level === 'off' ? 'none' : level;
      if (m.efforts?.includes(wire)) efforts[level] = wire;
    }
    if (Object.keys(efforts).some(k => k !== 'off')) model.reasoningEfforts = efforts;
    if (overrides[m.id]?.compat) model.compat = overrides[m.id].compat;
    routes[id].models.push(model);
  }
  return routes;
}
