import fs from 'node:fs';
import { paths } from './lib/paths.js';
import { sync, inspect } from './lib/sync.js';
import { refreshMetadata } from './lib/metadata.js';
import { cliOptions } from './lib/options.js';
import { readDocument } from './lib/yaml-file.js';

const action = process.argv[2] || 'status';
try {
  const options = cliOptions(), p = paths(options);
  if (action === 'status') {
    let count = 0;
    if (fs.existsSync(p.manifest)) count = JSON.parse(fs.readFileSync(p.manifest, 'utf8')).bridge?.models?.length || 0;
    const report = inspect(p, options);
    if (fs.existsSync(p.profile)) readDocument(p.profile, '[]');
    if (fs.existsSync(p.credentials)) readDocument(p.credentials, 'version: 1');
    const state = fs.existsSync(p.state) ? JSON.parse(fs.readFileSync(p.state, 'utf8')) : {};
    console.log(JSON.stringify({ ...p, appReady: fs.existsSync(p.profile), bridgeModels: count, managed: fs.existsSync(p.state),
      diagnostics: report.diagnostics, warnings: report.warnings, compatibilityAliases: state.compatibilityAliases || [] }, null, 2));
  } else if (action === 'explain') {
    const report = inspect(p, options);
    console.table(report.diagnostics.map(m => ({ model: m.id, protocol: m.api, source: m.source, status: m.status })));
    if (report.warnings.length) console.log(JSON.stringify(report.warnings));
  } else if (['sync', 'restore', 'prune'].includes(action)) {
    const metadata = action === 'restore' ? undefined : await refreshMetadata(p);
    console.log(JSON.stringify({ ...sync(p, { ...options, restore: action === 'restore', pruneLegacy: action === 'prune' }), metadata }, null, 2));
  } else throw new Error('unknown-command');
} catch (error) {
  const known = /^(invalid-|unsupported-|patch-|pi-|route-|credential-|data-|concurrent-|sync-|unknown-)/;
  console.error(known.test(error.message) ? error.message : '操作失败；请检查目标路径、文件权限和 YAML 格式。');
  process.exitCode = 1;
}
