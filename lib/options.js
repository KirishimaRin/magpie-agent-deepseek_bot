import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// CLI tools use the same installed plugin options as the Bun host. An optional
// JSON file supports portable Magpie instances without guessing their location.
export function cliOptions(args = process.argv.slice(3), env = process.env, home = os.homedir()) {
  const at = args.indexOf('--options');
  if (at >= 0) {
    if (!args[at + 1]) throw new Error('invalid-options-path');
    const value = JSON.parse(fs.readFileSync(args[at + 1], 'utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid-options');
    return value;
  }
  const file = path.join(env.XDG_CONFIG_HOME || path.join(home, '.config'), 'magpie', 'plugins.json');
  if (!fs.existsSync(file)) return {};
  const plugins = JSON.parse(fs.readFileSync(file, 'utf8')).plugins || [];
  const matches = plugins.filter(p => /(?:^|[/:\\])magpie-agent-deepseekbot(?:\.git)?(?:$|[#@/\\])/.test(p.spec || ''));
  if (matches.length > 1) throw new Error('invalid-duplicate-plugin-installations');
  return matches[0]?.options || {};
}
