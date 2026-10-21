import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parse } from 'yaml';
import { paths } from '../lib/paths.js';
import { sync, readDocument } from '../lib/sync.js';
import { connect, agent } from '../agent.js';
import { KEY_REF, routesFor, validateBridge } from '../lib/catalog.js';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dsbot-bridge-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const p = paths({ dataDir: path.join(root, 'data'), magpieConfigDir: path.join(root, 'magpie'), magpieCacheDir: path.join(root, 'cache'), metadataFile: path.join(root, 'gateway.json'), bridgeFile: path.join(root, 'bridge.json'), stateFile: path.join(root, 'state.json') });
  fs.mkdirSync(path.dirname(p.profile), { recursive: true });
  fs.writeFileSync(p.profile, '# user comment\n- id: agent-default-model\n  config: {provider: deepseek-account, model: deepseek-flash}\n');
  const input = { gateway: { url: 'http://127.0.0.1:3425', key: 'fixture-key' }, models: [{ id: 'test/reasoner', name: 'Test', context: 524288, output: 393216, efforts: ['none', 'low', 'high', 'max'], images: true }] };
  const bridge = Object.fromEntries(Object.entries(connect(input)).map(([k, v]) => [k.slice(7), v]));
  fs.writeFileSync(p.manifest, JSON.stringify({ bridge }));
  return { root, p, bridge };
}
const providers = file => parse(fs.readFileSync(file, 'utf8')).find(x => x.id === 'llm-pi-ai')?.config?.providers || {};

test('connect, idempotent refresh, catalog change, disconnect preserve user model and providers', t => {
  const { p, bridge } = fixture(t);
  fs.appendFileSync(p.profile, '- id: llm-pi-ai\n  config:\n    providers:\n      mine: {api: openai-completions, baseURL: https://example.com/v1}\n');
  fs.writeFileSync(p.credentials, 'version: 1\nrefs:\n  USER_KEY: keep-me\n');
  assert.equal(sync(p).status, 'connected');
  const model = providers(p.profile)['magpie-dsbot'].models[0];
  assert.equal(model.maxTokens, 131072);
  assert.deepEqual(model.input, ['text', 'image']);
  assert.deepEqual(model.reasoningEfforts, { off: 'none', low: 'low', high: 'high', max: 'max' });
  assert.equal(sync(p).writes, 0);
  assert.equal(parse(fs.readFileSync(p.credentials, 'utf8')).refs[KEY_REF], 'fixture-key');
  bridge.models = [{ id: 'test/second', context: 65536, output: 8192 }];
  fs.writeFileSync(p.manifest, JSON.stringify({ bridge }));
  sync(p);
  assert.equal(providers(p.profile)['magpie-dsbot'].models[0].id, 'test/second');
  fs.writeFileSync(p.manifest, '{}');
  assert.equal(sync(p).status, 'disconnected');
  assert.deepEqual(Object.keys(providers(p.profile)), ['mine']);
  assert.equal(parse(fs.readFileSync(p.credentials, 'utf8')).refs.USER_KEY, 'keep-me');
  assert.equal(parse(fs.readFileSync(p.credentials, 'utf8')).refs[KEY_REF], undefined);
  assert.match(fs.readFileSync(p.profile, 'utf8'), /user comment/);
  assert.equal(parse(fs.readFileSync(p.profile, 'utf8'))[0].config.provider, 'deepseek-account');
});

test('home override, duplicate metadata patches and !!js expressions survive', t => {
  const { p } = fixture(t);
  fs.writeFileSync(p.homePatch, '- id: llm-pi-ai\n  config:\n    providers:\n      mine:\n        baseURL: !!js process.env.USER_ENDPOINT\n- id: llm-pi-ai\n  disabled: false\n');
  sync(p);
  assert.match(fs.readFileSync(p.homePatch, 'utf8'), /!!js process.env.USER_ENDPOINT/);
  const { doc } = readDocument(p.homePatch, '[]');
  assert.equal(doc.contents.items[0].getIn(['config', 'providers', 'magpie-dsbot', 'api']), 'openai-completions');
  sync(p, { restore: true });
  assert.match(fs.readFileSync(p.homePatch, 'utf8'), /!!js process.env.USER_ENDPOINT/);
});

test('broken YAML, malformed bridge and occupied namespaces fail before writes', t => {
  const { p } = fixture(t);
  const original = fs.readFileSync(p.profile, 'utf8');
  fs.writeFileSync(p.credentials, 'version: 1\nrefs: [broken');
  assert.throws(() => sync(p), /invalid-yaml/);
  assert.equal(fs.readFileSync(p.profile, 'utf8'), original);
  fs.writeFileSync(p.credentials, 'version: 1\nrefs: {}\n');
  fs.appendFileSync(p.profile, '- id: llm-pi-ai\n  config:\n    providers:\n      magpie-dsbot: {baseURL: https://mine.example}\n');
  assert.throws(() => sync(p), /route-name-in-use/);
  assert.equal(fs.existsSync(p.state), false);
});

test('restoration follows journal after data folder changes; changed unrelated key survives', t => {
  const { p, root } = fixture(t);
  sync(p);
  fs.appendFileSync(p.credentials, '\n# user comment\n');
  const moved = { ...p, dataDir: path.join(root, 'moved') };
  assert.throws(() => sync(moved), /data-moved/);
  sync(moved, { restore: true });
  assert.deepEqual(providers(p.profile), {});
  assert.match(fs.readFileSync(p.credentials, 'utf8'), /user comment/);
});

test('custom data location discovered from Electron locations; separate from DSH_HOME', t => {
  const { root } = fixture(t);
  const shellData = path.join(root, 'shell');
  fs.mkdirSync(shellData);
  fs.writeFileSync(path.join(shellData, 'locations.json'), JSON.stringify({ dataDir: path.join(root, 'custom') }));
  assert.equal(paths({ shellData }, { DSH_HOME: '/other' }).dataDir, path.join(root, 'custom'));
});

test('protocol overrides use proper endpoint and preserve reasoning metadata', t => {
  const { bridge } = fixture(t);
  const routes = routesFor(validateBridge(bridge), { 'test/reasoner': { api: 'anthropic-messages', compat: { forceAdaptiveThinking: true } } });
  const route = routes['magpie-dsbot-anthropic'];
  assert.equal(route.baseURL, 'http://127.0.0.1:3425');
  assert.equal(route.models[0].compat.forceAdaptiveThinking, true);
  assert.equal(agent.model, undefined);
});

test('empty profile waits for app, malformed bridge keeps existing connection', t => {
  const { p } = fixture(t);
  sync(p);
  fs.writeFileSync(p.manifest, '{"bridge":{"version":1}}');
  assert.throws(() => sync(p), /invalid-bridge/);
  assert(providers(p.profile)['magpie-dsbot']);
  sync(p, { restore: true });
  fs.unlinkSync(p.profile);
  fs.writeFileSync(p.manifest, JSON.stringify({ bridge: { version: 1, key: 'x', gateway: 'http://127.0.0.1:1', models: [{ id: 'x' }] } }));
  assert.equal(sync(p).status, 'waiting-for-app');
});

test('route custom headers and compatibility flags survive repeat sync without writes', t => {
  const { p } = fixture(t);
  sync(p);
  const entry = readDocument(p.profile, '[]');
  const pi = entry.doc.contents.items.find(n => n.get('id') === 'llm-pi-ai');
  pi.setIn(['config', 'providers', 'magpie-dsbot', 'headers', 'x-custom'], 'keep');
  pi.setIn(['config', 'providers', 'magpie-dsbot', 'models', 0, 'compat', 'maxTokensField'], 'max_tokens');
  fs.writeFileSync(p.profile, String(entry.doc));
  assert.equal(sync(p).writes, 0);
  const route = providers(p.profile)['magpie-dsbot'];
  assert.equal(route.headers['x-custom'], 'keep');
  assert.equal(route.models[0].compat.maxTokensField, 'max_tokens');
});

test('cleanup recovers credential rotation interrupted after the ownership journal', t => {
  const { p, bridge } = fixture(t);
  sync(p);
  const state = JSON.parse(fs.readFileSync(p.state, 'utf8'));
  // Simulate a second rotation whose journal committed but credential write did not.
  state.keyHashes.push('different-pending-key-hash');
  fs.writeFileSync(p.state, JSON.stringify(state));
  fs.writeFileSync(p.manifest, '{}');
  sync(p);
  assert.equal(parse(fs.readFileSync(p.credentials, 'utf8')).refs[KEY_REF], undefined);
  assert.deepEqual(providers(p.profile), {});
});

test('upgrade retains old route as an alias until explicit prune, then uninstall cleans both', t => {
  const { p } = fixture(t);
  sync(p); // 0.1/0.2 installations used Chat for this model.
  fs.mkdirSync(p.magpieConfig, { recursive: true });
  fs.writeFileSync(path.join(p.magpieConfig, 'plugin-providers.json'), JSON.stringify([{ id: 'test', signedIn: true, models: [{ id: 'reasoner', npm: '@ai-sdk/openai' }] }]));
  const upgraded = sync(p);
  assert.deepEqual(upgraded.canonicalCounts, { 'magpie-dsbot-responses': 1 });
  assert.equal(upgraded.compatibilityAliases.length, 1);
  assert.match(providers(p.profile)['magpie-dsbot'].models[0].name, /旧接口/);
  assert.equal(sync(p).writes, 0);
  sync(p, { pruneLegacy: true });
  assert.equal(providers(p.profile)['magpie-dsbot'], undefined);
  assert.equal(sync(p).writes, 0); // Polling must not resurrect pruned aliases.
  sync(p, { restore: true });
  assert.deepEqual(providers(p.profile), {});
});

test('a fresh install selects Responses without any DSH directory', t => {
  const { p } = fixture(t);
  fs.mkdirSync(p.magpieConfig, { recursive: true });
  fs.writeFileSync(path.join(p.magpieConfig, 'plugin-providers.json'), JSON.stringify([{ id: 'test', models: [{ id: 'reasoner', npm: '@ai-sdk/openai' }] }]));
  assert.deepEqual(sync(p).modelsByRoute, { 'magpie-dsbot-responses': 1 });
  assert.equal('dshHome' in p, false);
});
