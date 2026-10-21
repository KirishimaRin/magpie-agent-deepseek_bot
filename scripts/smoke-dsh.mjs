// Exercise the installed DS Bot's real DSH adapter against a local mock gateway.
import http from 'node:http';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { routesFor } from '../lib/catalog.js';
const executable = process.env.DS_BOT_EXE;
if (!executable) throw new Error('Set DS_BOT_EXE to the installed DeepSeek Bot executable.');
const modulePath = process.env.DS_BOT_ADAPTER || path.join(path.dirname(executable), 'resources/app.asar/node_modules/@deepseek-ai/dsh-llm-pi-ai/lib/index.js');
let request;
const responses = process.argv.includes('--responses');
const anthropic = process.argv.includes('--anthropic');
const routeId = anthropic ? 'magpie-dsbot-anthropic' : responses ? 'magpie-dsbot-responses' : 'magpie-dsbot';
const server = http.createServer(async (req, res) => {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  request = { path: req.url, authorization: req.headers.authorization, apiKey: req.headers['x-api-key'], body: JSON.parse(raw) };
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  if (anthropic) {
    const events = [
      { type: 'message_start', message: { id: 'msg_mock', type: 'message', role: 'assistant', model: 'fixture/model', content: [], stop_reason: null, usage: { input_tokens: 5, output_tokens: 0 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'bridge-ok' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 2 } },
      { type: 'message_stop' },
    ];
    for (const event of events) res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    res.end();
    return;
  }
  if (responses) {
    const message = { id: 'msg_mock', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'bridge-ok', annotations: [] }] };
    const response = { id: 'resp_mock', object: 'response', status: 'completed', model: 'fixture/model', output: [message], usage: { input_tokens: 5, output_tokens: 2, total_tokens: 7 } };
    const events = [
      { type: 'response.created', response: { ...response, status: 'in_progress', output: [] } },
      { type: 'response.output_item.added', output_index: 0, item: { ...message, status: 'in_progress', content: [] } },
      { type: 'response.content_part.added', item_id: message.id, output_index: 0, content_index: 0, part: { type: 'output_text', text: '', annotations: [] } },
      { type: 'response.output_text.delta', item_id: message.id, output_index: 0, content_index: 0, delta: 'bridge-ok' },
      { type: 'response.output_text.done', item_id: message.id, output_index: 0, content_index: 0, text: 'bridge-ok' },
      { type: 'response.output_item.done', output_index: 0, item: message },
      { type: 'response.completed', response },
    ];
    for (const [index, event] of events.entries()) res.write(`event: ${event.type}\ndata: ${JSON.stringify({ ...event, sequence_number: index })}\n\n`);
    res.end();
    return;
  }
  for (const value of [
    { id: 'mock', object: 'chat.completion.chunk', model: 'fixture/model', choices: [{ index: 0, delta: { role: 'assistant', content: 'bridge-ok' }, finish_reason: null }] },
    { id: 'mock', object: 'chat.completion.chunk', model: 'fixture/model', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 } },
  ]) res.write(`data: ${JSON.stringify(value)}\n\n`);
  res.end('data: [DONE]\n\n');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
try {
  const providers = routesFor({ gateway: `http://127.0.0.1:${server.address().port}`, models: [{ id: 'fixture/model', name: 'Fixture', context: 524288, output: 131072, images: true, efforts: ['low', 'high', 'max'] }] }, anthropic ? { 'fixture/model': { api: 'anthropic-messages', compat: { forceAdaptiveThinking: true } } } : responses ? { 'fixture/model': { api: 'openai-responses' } } : {});
  const code = `
    (async () => {
      const {Config, apply} = await import(${JSON.stringify(pathToFileURL(modulePath).href)});
      let adapter;
      const credentials = {resolve: async () => ({value:'fixture-key'})};
      const ctx = {fiber:{entry:{options:{id:'llm-pi-ai'}}}, inject(){}, on(){}, get(n){return n==='credentials'?credentials:undefined}, logger:console,
        llm:{ registerConfigurableProviders(){return {replace(){}}}, registerModelDiscovery(){}, registerAdapter(_routes,a){adapter=a;return {replace(){}}} }};
      apply(ctx, Config(${JSON.stringify({ providers })}));
      const models = await adapter.listModels(${JSON.stringify(routeId)});
      const info = await adapter.resolveModel(${JSON.stringify(routeId)},'fixture/model');
      const chunks = [];
      for await (const chunk of adapter.stream({provider:${JSON.stringify(routeId)},model:'fixture/model',reasoningEffort:'high',messages:[{role:'user',content:[{type:'text',text:'fixture'}]}],tools:[]})) chunks.push(chunk);
      console.log(JSON.stringify({models,info,chunks}));
    })().catch(e=>{console.error(e);process.exitCode=1});
  `;
  const { stdout } = await promisify(execFile)(executable, ['--expose-internals', '-e', code], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true, timeout: 30000 });
  const result = JSON.parse(stdout.trim());
  assert.equal(result.models[0].id, 'fixture/model');
  assert.deepEqual(result.info.inputModalities, ['text', 'image']);
  assert.equal(new URL(request.path, 'http://fixture').pathname, anthropic ? '/v1/messages' : responses ? '/v1/responses' : '/v1/chat/completions');
  if (anthropic) assert.equal(request.apiKey, 'fixture-key');
  else assert.equal(request.authorization, 'Bearer fixture-key');
  const effort = anthropic ? request.body.output_config?.effort : responses ? request.body.reasoning?.effort : request.body.reasoning_effort;
  assert.equal(effort, 'high');
  assert.match(JSON.stringify(result.chunks), /bridge-ok/);
  console.log(JSON.stringify({ status: 'passed', adapter: 'DS Bot bundled DSH 0.2.1-rc.2', model: result.info, requestPath: request.path, reasoningEffort: effort, streamedReply: 'bridge-ok' }, null, 2));
} finally { server.closeAllConnections(); server.close(); }
