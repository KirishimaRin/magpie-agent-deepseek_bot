import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveProtocols, mergeName } from '../lib/protocol-resolver.js';
import { readInventory } from '../lib/inventory.js';
import { credentialHash, refreshMetadata } from '../lib/metadata.js';
import { paths } from '../lib/paths.js';
import { cliOptions } from '../lib/options.js';

const bridge = ids => ({ gateway: 'http://127.0.0.1:3425', key: 'fixture-key', version: 1, models: ids.map(id => ({ id })) });
const choice = (id, inv, overrides) => resolveProtocols(bridge([id]), inv, overrides).hints[id];

test('single native endpoint works without local Magpie metadata', () => {
  for (const [endpoint, api] of [['/v1/responses', 'openai-responses'], ['/v1/messages', 'anthropic-messages'], ['/v1/chat/completions', 'openai-completions']]) {
    const r = choice('p/model', { gatewayModels: [{ id: 'p/model', native_endpoints: [endpoint] }] });
    assert.equal(r.api, api);
    assert.equal(r.source, 'gateway-native-endpoints');
  }
});

test('multi-endpoint providers follow Native preference and user model restrictions', () => {
  const p = { id: 'p', chat: 'https://api.openai.com/v1', responses: 'https://api.openai.com/v1', anthropic: 'https://api.anthropic.com' };
  assert.equal(choice('p/gpt-6', { providers: [p] }).api, 'openai-responses');
  assert.equal(choice('p/claude-sonnet-4-5', { providers: [p] }).api, 'anthropic-messages');
  assert.equal(choice('p/gpt-6', { providers: [p], models: [{ id: 'p/gpt-6', userAPI: 'chat' }] }).source, 'magpie-model-override');
  assert.equal(choice('p/gpt-6', { providers: [p], models: [{ id: 'p/gpt-6', apis: ['chat'] }] }).api, 'openai-completions');
  assert.equal(choice('p/random', { providers: [{ ...p, preset: 'modelscope' }] }).api, 'openai-responses');
  assert.equal(choice('p/random', { providers: [p] }).api, 'openai-completions');
});

test('SDK is per-model, Copilot exceptions and translated providers stay on Chat', () => {
  const models = [{ id: 'zed/gpt', npm: '@ai-sdk/openai' }, { id: 'zed/claude', npm: '@ai-sdk/anthropic' }];
  assert.equal(choice('zed/gpt', { models }).api, 'openai-responses');
  assert.equal(choice('zed/claude', { models }).api, 'anthropic-messages');
  for (const [id, expected] of [['github-copilot/gpt-6', 'openai-responses'], ['github-copilot/gpt-5-mini', 'openai-completions']]) {
    assert.equal(choice(id, { models: [{ id, npm: '@ai-sdk/github-copilot' }] }).api, expected);
  }
  assert.equal(choice('a/claude-opus', { providers: [{ id: 'a', translated: true }] }).source, 'translated-provider');
});

test('nested groups require all resolved members to use Responses; mixed/Anthropic groups use Chat', () => {
  const models = [{ id: 'a/m', npm: '@ai-sdk/openai' }, { id: 'b/m', npm: '@ai-sdk/openai' }, { id: 'c/m', npm: '@ai-sdk/anthropic' }];
  const groups = { 'group/r': ['a/m', 'b/m'], 'group/nested': ['group/r', 'a/m'], 'group/mixed': ['a/m', 'c/m'], 'group/anth': ['c/m'], 'group/unknown': ['a/m', 'z/m'], 'group/cycle': ['group/cycle'] };
  for (const id of ['group/r', 'group/nested']) assert.equal(choice(id, { models, groups }).api, 'openai-responses');
  for (const id of ['group/mixed', 'group/anth']) assert.equal(choice(id, { models, groups }).api, 'openai-completions');
  for (const id of ['group/unknown', 'group/cycle', 'group/absent']) assert.equal(choice(id, { models, groups }).status, 'fallback');
});

test('fallback is explicit and plugin override wins without metadata', () => {
  assert.deepEqual(choice('p/m', {}), { api: 'openai-completions', source: 'protocol-metadata-unavailable', status: 'fallback' });
  assert.equal(choice('p/m', {}, { 'p/m': { api: 'openai-responses' } }).source, 'plugin-override');
  assert.throws(() => choice('p/m', {}, { 'p/m': { api: 'bad' } }), /unsupported-protocol/);
});

function setup(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dsbot-metadata-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const p = paths({ dataDir: root, magpieConfigDir: path.join(root, 'config'), magpieCacheDir: path.join(root, 'cache'), metadataFile: path.join(root, 'metadata.json'), bridgeFile: path.join(root, 'bridge.json') });
  const write = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value)); };
  return { p, write };
}

test('raw local metadata reconstructs auto groups without DSH or UI cache and omits secrets', t => {
  const { p, write } = setup(t);
  write(path.join(p.magpieConfig, 'providers.json'), { providers: [{ id: 'a', key: 'DO-NOT-EXPORT', responses: 'http://a/v1', models: ['gpt-6.1-sol'] }, { id: 'b', responses: 'http://b/v1', models: ['gpt-6.1-sol'] }], groups: [{ id: 'nested', members: ['auto/gpt-6.1-sol:high'] }] });
  const b = bridge(['auto/gpt-6.1-sol', 'group/nested']);
  const inv = readInventory(p, b);
  const result = resolveProtocols(b, inv);
  assert.equal(result.hints['auto/gpt-6.1-sol'].api, 'openai-responses');
  assert.equal(result.hints['group/nested'].api, 'openai-responses');
  assert(!JSON.stringify(inv).includes('DO-NOT-EXPORT'));
  assert.equal(mergeName('vendor/Claude Opus 4.6-20260801'), 'claude-opus-4-6');
  assert.equal(mergeName('gpt-4o-2024-08-06'), 'gpt-4o-2024-08-06');
});

test('manual group edits and user protocol resets override stale UI caches', t => {
  const { p, write } = setup(t);
  write(path.join(p.magpieCache, 'providers-state.json'), { providers: { providers: [{ id: 'p', chat: 'http://p', responses: 'http://p', models: [{ id: 'gpt-6', api: 'chat' }], groups: { 'gpt-6': ['group/mine'] } }] } });
  write(path.join(p.magpieConfig, 'providers.json'), { providers: [], groups: [{ id: 'mine', members: ['p/other'] }] });
  const inv = readInventory(p, bridge(['p/gpt-6']));
  assert.equal(inv.models[0].userAPI, undefined);
  assert.deepEqual(inv.groups['group/mine'], ['p/other']);
});

test('remote gateway never borrows local metadata and cached responses are bound to URL and key', t => {
  const { p, write } = setup(t);
  const b = { ...bridge(['p/m']), gateway: 'https://remote.example' };
  write(path.join(p.magpieConfig, 'providers.json'), { providers: [{ id: 'p', responses: 'http://local' }] });
  write(p.gatewayMetadata, { gateway: b.gateway, credentialHash: credentialHash(b.key), fetchedAt: Date.now(), models: [{ id: 'p/m', native_endpoints: ['/v1/responses'] }] });
  const inv = readInventory({ ...p, credentialHash: credentialHash(b.key) }, b);
  assert.equal(inv.providers.length, 0);
  assert.equal(resolveProtocols(b, inv).hints['p/m'].api, 'openai-responses');
  assert.equal(readInventory({ ...p, credentialHash: 'wrong' }, b).gatewayModels.length, 0);
});

test('bounded authenticated discovery sanitizes data, caches it, and leaves cache on failure', async t => {
  const { p, write } = setup(t), b = bridge(['p/m']);
  write(p.manifest, { bridge: b });
  let calls = 0;
  const fetcher = async (url, options) => {
    calls++;
    assert.equal(url, b.gateway + '/v1/models');
    assert.equal(options.headers.Authorization, 'Bearer fixture-key');
    assert.equal(options.redirect, 'error');
    return new Response(JSON.stringify({ data: [{ id: 'p/m', native_endpoints: ['/v1/responses'], secret: 'NEVER-PERSIST' }] }));
  };
  assert.equal((await refreshMetadata(p, { fetcher })).status, 'refreshed');
  assert.equal((await refreshMetadata(p, { fetcher })).status, 'cached');
  assert.equal(calls, 1);
  assert(!fs.readFileSync(p.gatewayMetadata, 'utf8').includes('NEVER-PERSIST'));
  const old = fs.readFileSync(p.gatewayMetadata, 'utf8');
  assert.equal((await refreshMetadata(p, { force: true, fetcher: async () => { throw new Error('secret'); } })).status, 'unavailable');
  assert.equal(fs.readFileSync(p.gatewayMetadata, 'utf8'), old);
});

test('adaptive Claude routing adds protocol-specific thinking compatibility', () => {
  const id = 'a/claude-opus-4-6';
  const inv = { models: [{ id, npm: '@ai-sdk/anthropic' }] };
  assert.equal(choice(id, inv).compat.forceAdaptiveThinking, true);
  assert.equal(choice(id, inv, { [id]: { compat: { forceAdaptiveThinking: false } } }).compat.forceAdaptiveThinking, false);
  assert.equal(choice('a/claude-sonnet-4-5', { models: [{ id: 'a/claude-sonnet-4-5', npm: '@ai-sdk/anthropic' }] }).compat, undefined);
});

test('CLI honors installed options and a portable options file', t => {
  const { p, write } = setup(t), home = path.dirname(p.magpieConfig);
  const opts = { dataDir: '/fixture-data', modelOverrides: { 'p/m': { api: 'openai-responses' } } };
  for (const spec of ['github:owner/magpie-agent-deepseek_bot', 'magpie-agent-deepseek_bot@0.3.0-preview.2', 'github:owner/magpie-agent-deepseekbot']) {
    write(path.join(home, '.config', 'magpie', 'plugins.json'), { plugins: [{ spec, options: opts }] });
    assert.deepEqual(cliOptions([], {}, home), opts);
  }
  const file = path.join(home, 'options.json');
  write(file, opts);
  assert.deepEqual(cliOptions(['--options', file], {}, home), opts);
});

test('expired gateway data and corrupted metadata report fallback without guessing', t => {
  const { p, write } = setup(t), b = bridge(['p/m']);
  write(p.gatewayMetadata, { gateway: b.gateway, credentialHash: credentialHash(b.key), fetchedAt: Date.now() - 600000, models: [{ id: 'p/m', native_endpoints: ['/v1/responses'] }] });
  write(path.join(p.magpieConfig, 'providers.json'), {});
  fs.writeFileSync(path.join(p.magpieConfig, 'providers.json'), '{broken');
  const inv = readInventory({ ...p, credentialHash: credentialHash(b.key) }, b);
  assert.deepEqual(inv.warnings, ['invalid-metadata:providers.json']);
  assert.equal(resolveProtocols(b, inv).hints['p/m'].status, 'fallback');
});

test('oversized discovery response is refused and response data never becomes an error message', async t => {
  const { p, write } = setup(t);
  write(p.manifest, { bridge: bridge(['p/m']) });
  const result = await refreshMetadata(p, { force: true, fetcher: async () => new Response('sensitive'.repeat(500000)) });
  assert.deepEqual(result, { status: 'unavailable', reason: 'catalog-request-failed' });
  assert.equal(fs.existsSync(p.gatewayMetadata), false);
});

test('runtime protocol modules have no dependency on a separate DSH home', () => {
  for (const file of ['lib/paths.js', 'lib/inventory.js', 'lib/protocol-resolver.js', 'lib/sync.js', 'lib/metadata.js', 'index.js']) {
    assert(!/dshHome|nativeProtocolHints|\.dsh[\\/]/.test(fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8')), file);
  }
});
