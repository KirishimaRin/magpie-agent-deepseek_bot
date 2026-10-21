import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function paths(options = {}, env = process.env, home = os.homedir(), platform = process.platform) {
  const control = path.join(home, '.config', 'magpie-deepseekbot');
  const shellData = options.shellData || env.DS_BOT_SHELL_DATA || (platform === 'win32'
    ? path.join(env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'DeepSeek Bot')
    : platform === 'darwin' ? path.join(home, 'Library', 'Application Support', 'DeepSeek Bot')
      : path.join(env.XDG_CONFIG_HOME || path.join(home, '.config'), 'DeepSeek Bot'));
  let dataDir = options.dataDir || env.DS_BOT_HOME;
  if (!dataDir) {
    const file = path.join(shellData, 'locations.json');
    if (fs.existsSync(file)) {
      const saved = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
      if (typeof saved.dataDir !== 'string' || !path.isAbsolute(saved.dataDir)) throw new Error('invalid-locations');
      dataDir = saved.dataDir;
    }
  }
  dataDir ||= path.join(home, '.ds-bot');
  if (!path.isAbsolute(dataDir)) throw new Error('dataDir-must-be-absolute');
  return {
    dataDir,
    magpieConfig: options.magpieConfigDir || path.join(env.XDG_CONFIG_HOME || path.join(home, '.config'), 'magpie'),
    magpieCache: options.magpieCacheDir || path.join(env.XDG_CACHE_HOME || path.join(home, '.cache'), 'magpie'),
    gatewayMetadata: options.metadataFile || path.join(control, 'gateway-models.json'),
    profile: path.join(dataDir, 'profiles', 'ds-bot', 'cordis.patch.yml'),
    homePatch: path.join(dataDir, 'cordis.patch.yml'),
    credentials: path.join(dataDir, '.credentials.yaml'),
    manifest: options.bridgeFile || path.join(control, 'bridge.json'),
    state: options.stateFile || path.join(control, 'state.json'),
  };
}
