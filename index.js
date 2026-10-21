import { paths } from './lib/paths.js';
import { sync } from './lib/sync.js';
import { refreshMetadata } from './lib/metadata.js';
let started = false;

export default async function DeepSeekBotBridge(_input, options = {}) {
  if (started) return {};
  started = true;
  let last = '';
  let flight;
  const tick = () => flight ||= (async () => {
    try {
      const metadata = await refreshMetadata(paths(options));
      const result = sync(paths(options), options);
      const status = `${result.status}:${result.models || 0}:${JSON.stringify(result.canonicalCounts || {})}:${metadata.status === 'unavailable' ? metadata.reason : 'metadata-ok'}`;
      if (status !== last) console.log(`[DS Bot bridge] ${status}`);
      last = status;
    } catch {
      // YAML/parser errors may quote credentials, so diagnostics never log raw errors.
      if (last !== 'error') console.log('[DS Bot bridge] 同步失败，请在插件目录运行 npm run check。');
      last = 'error';
    }
  })().finally(() => { flight = undefined; });
  await tick();
  const timer = setInterval(tick, 3000);
  timer.unref?.();
  return {};
}
