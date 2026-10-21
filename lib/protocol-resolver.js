// Magpie Native()/pluginProtocol()/allResponses decisions; no DSH I/O.
export const API = { chat: 'openai-completions', responses: 'openai-responses', anthropic: 'anthropic-messages' };
const order = ['chat', 'responses', 'anthropic'];
export const fromEndpoint = value => ({ '/v1/chat/completions': 'chat', '/v1/responses': 'responses', '/v1/messages': 'anthropic', ...Object.fromEntries(Object.entries(API).map(([k, v]) => [v, k])) })[value] || (order.includes(value) ? value : undefined);
const bare = model => model.slice(model.lastIndexOf('/') + 1).toLowerCase();
const host = url => { try { return new URL(url).hostname; } catch { return ''; } };

export function sdkProtocol(npm, provider, model) {
  if (['@ai-sdk/anthropic', '@ai-sdk/google-vertex/anthropic'].includes(npm)) return 'anthropic';
  if (['@ai-sdk/openai', '@ai-sdk/azure'].includes(npm)) return 'responses';
  if (npm === '@ai-sdk/google') return 'translated';
  if (npm === '@ai-sdk/github-copilot' || provider.startsWith('github-copilot')) {
    const n = /^gpt-(\d+)/.exec(bare(model));
    return n && Number(n[1]) >= 5 && !bare(model).startsWith('gpt-5-mini') ? 'responses' : 'chat';
  }
  return npm ? 'chat' : undefined;
}

export function nativeChoice(p, model, allowed) {
  const name = bare(model);
  const bedrock = /^bedrock/.test(p.preset || '') || /^bedrock-(runtime|mantle)\./.test(host(p.responses || p.anthropic || p.chat));
  const gpt = /^(gpt-|codex|o[0-9])/.test(name);
  const claude = /^claude/.test(name) || /anthropic\.claude/.test(name);
  const responsesFirst = (p.preset === 'modelscope' || host(p.responses) === 'api-inference.modelscope.cn') && p.chat && p.responses
    || bedrock && /^(openai\.)?gpt-/.test(name) && !/^(openai\.)?gpt-oss/.test(name)
    || gpt && (p.id === 'copilot' || p.preset === 'azure' || ['api.openai.com', 'api.pipellm.ai'].includes(host(p.responses)) || /\.openai\.azure\.com$/.test(host(p.responses)));
  if (responsesFirst && allowed.includes('responses')) return 'responses';
  if (claude && allowed.includes('anthropic')) return 'anthropic';
  return order.find(api => allowed.includes(api));
}

export function mergeName(id) {
  let k = bare(id.trim()).replace(/[\s\p{Zs}_-]+/gu, '-').replace(/^-|-$/g, '');
  k = k.replace(/(?<=\d)[.p](?=\d)/g, '-');
  return k.replace(/[-@](20\d{6}|\d{6})$/, (full, date) => {
    if (date.length === 8) return '';
    const [yy, mm, dd] = [date.slice(0, 2), date.slice(2, 4), date.slice(4)].map(Number);
    return yy >= 23 && yy <= 39 && mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31 ? '' : full;
  });
}
export const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function adaptiveThinking(id) {
  const m = /(?:^|[^a-z0-9])(?:claude-)?(?:opus|sonnet|haiku|fable|mythos)-(\d{1,2})(?:[-.](\d{1,2}))?(?:[^0-9]|$)|claude-(\d+)(?:[-.](\d))?-(?:opus|sonnet|haiku)/.exec(id.toLowerCase());
  if (!m) return false;
  const major = Number(m[3] || m[1]), minor = Number(m[3] ? m[4] || 0 : m[2] || 0);
  return major > 4 || major === 4 && minor >= 6;
}

export function resolveProtocols(bridge, inventory = {}, overrides = {}) {
  const records = new Map((inventory.models || []).map(m => [m.id, m]));
  const providers = new Map((inventory.providers || []).map(p => [p.id, p]));
  const remote = new Map((inventory.gatewayModels || []).map(m => [m.id, m]));
  const groups = new Map(Object.entries(inventory.groups || {}));
  const memo = new Map();
  const result = (api, source, status = 'resolved') => ({ api: API[api] || API.chat, source, status });
  const unknown = reason => result('chat', reason, 'fallback');
  function resolve(id, stack = new Set()) {
    if (memo.has(id)) return memo.get(id);
    if (stack.has(id)) return unknown('group-cycle');
    if (stack.size >= 32) return unknown('group-depth');
    let answer;
    const explicit = overrides[id]?.api;
    if (explicit) {
      const api = fromEndpoint(explicit);
      if (!api) throw new Error('unsupported-protocol');
      answer = result(api, 'plugin-override');
    } else if (id.startsWith('auto/') || id.startsWith('group/')) {
      const members = groups.get(id);
      if (!members?.length) answer = unknown('group-members-unavailable');
      else {
        const next = new Set(stack).add(id);
        const resolved = members.map(ref => ({ id: ref, ...resolve(ref, next) }));
        answer = resolved.some(m => m.status === 'fallback') ? unknown('group-member-unresolved')
          : result(resolved.every(m => m.api === API.responses) ? 'responses' : 'chat', 'group-members');
        answer.members = resolved.map(m => ({ id: m.id, api: m.api, status: m.status }));
      }
    } else {
      const at = id.indexOf('/'), pid = id.slice(0, at), model = id.slice(at + 1);
      const p = providers.get(pid) || { id: pid }, m = records.get(id) || {};
      const endpoints = (remote.get(id)?.native_endpoints || []).map(fromEndpoint).filter(Boolean);
      const override = fromEndpoint(m.userAPI), sdk = sdkProtocol(m.npm, pid, model);
      if (m.userAPI === 'gemini' && p.gemini) answer = result('chat', 'translated-model-override');
      else if (override && p[override]) answer = result(override, 'magpie-model-override');
      else if (p.translated || sdk === 'translated') answer = result('chat', 'translated-provider');
      else if (sdk) answer = result(sdk, 'plugin-sdk');
      else {
        const speaks = order.filter(api => p[api]), listed = (m.apis || []).map(fromEndpoint).filter(Boolean);
        const available = listed.length ? (speaks.length ? speaks.filter(api => listed.includes(api)) : listed)
          : endpoints.length ? endpoints : speaks;
        const chosen = nativeChoice(p, model, available);
        answer = chosen ? result(chosen, listed.length ? 'model-catalog' : endpoints.length ? 'gateway-native-endpoints' : 'provider-endpoints') : unknown('protocol-metadata-unavailable');
      }
    }
    if (answer.api === API.anthropic && adaptiveThinking(id)) answer.compat = { forceAdaptiveThinking: true };
    if (overrides[id]?.compat) answer.compat = { ...answer.compat, ...overrides[id].compat };
    memo.set(id, answer);
    return answer;
  }
  const hints = Object.fromEntries(bridge.models.map(m => [m.id, resolve(m.id)]));
  return { hints, diagnostics: bridge.models.map(m => ({ id: m.id, ...hints[m.id] })), warnings: inventory.warnings || [] };
}
