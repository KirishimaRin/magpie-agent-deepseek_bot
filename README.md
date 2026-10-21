# Magpie → DeepSeek Bot

**第三方适配插件，由 KirishimaRin 开发，与 DS Bot 作者及 DeepSeek 官方无隶属或背书关系。**

插件卡片和 Agent 列表使用 DS Bot v0.2.0 原始应用图标，用于标识接入对象。图标版权归 **Fei2411 及 DS Bot 贡献者**所有，按 **Apache License 2.0** 使用；图标图形未作修改。来源为 [DS Bot 图标生成代码](https://github.com/Fei2411/DeepSeek-Bot/blob/v0.2.0/app/scripts/icon.mjs)。许可证全文和相关署名随包附于 `licenses/`。本插件自有代码采用 MIT，图标保留上游许可。

把 Magpie 的模型接入 **DeepSeek Bot 独立桌面版 v0.2.0**（内置 DSH 0.2.1-rc.2）。

请求路径：**DeepSeek Bot → Magpie 网关 → Magpie 已配置的模型供应商**。

插件在 Magpie 的 Agents 页增加 **DeepSeek Bot** 开关。接入后同步可见模型、上下文、输出预算、图片输入和思考档位，独立计算 Chat、Responses、Anthropic 分组。只需 Magpie 和独立 DS Bot；每个 Bot 仍在自己的设置里选择模型。

当前版本：`0.3.0-preview.2`。适配规则以 Magpie `0.1.1307` / 源码 `f5b0157420` 为基准。

## 安装

1. 先安装并打开一次 DeepSeek Bot，完成数据位置设置。
2. 在 Magpie 的插件页添加本插件文件夹，例如 `C:\Plugins\magpie-agent-deepseekbot`，并启用。Magpie 会安装 `yaml` 依赖。
3. 到 Magpie 的 Agents 页，开启 **DeepSeek Bot** 接入。
4. 等待约 3 秒，在 DeepSeek Bot 的 Bot 设置中选择 **Magpie · DS Bot** 下的模型。首次接入时如列表未刷新，退出并重开 DeepSeek Bot。

本项目也提供 `node scripts/install-local.mjs`，会安装插件、开启接入并立即同步。默认查找 Windows 桌面上的 `magpie-windows-amd64.exe`，其他位置可通过 `MAGPIE_EXE` 指定。

也可以使用 Magpie 命令行：

```powershell
magpie plugin add "C:\Plugins\magpie-agent-deepseekbot"
magpie deepseekbot provider magpie
```

已有 Bot 的模型选择保持原样，需要在 Bot 设置里选择要使用的 Magpie 模型。

## 数据位置

按以下顺序查找 DeepSeek Bot 数据：

1. 插件选项 `dataDir`。
2. `DS_BOT_HOME` 环境变量。
3. 桌面应用的 `locations.json` 中的 `dataDir`（支持首次启动时选择的自定义位置）。
4. 默认 `~/.ds-bot`。

Windows 的位置记录为 `%APPDATA%\DeepSeek Bot\locations.json`；macOS 为 `~/Library/Application Support/DeepSeek Bot/locations.json`。可用 `shellData` 选项或 `DS_BOT_SHELL_DATA` 指定自定义应用设置目录。

插件只管理这份数据的 `profiles/ds-bot/cordis.patch.yml`；家目录 `cordis.patch.yml` 已有 `llm-pi-ai.config` 覆盖时也合并同一组路由。网关凭据保存到该数据目录的 `.credentials.yaml`，引用名为 `MAGPIE_DSBOT_GATEWAY_KEY`。

普通 DSH 的 `~/.dsh`、Bot/群聊数据、会话与默认模型都保持原样。插件占用 `magpie-dsbot`、`magpie-dsbot-responses`、`magpie-dsbot-anthropic` 三个供应商 ID。首次接入发现同名配置时会报告冲突。

## 检查、同步与断开

在本插件目录运行（本地开发先执行 `npm ci`）：

```powershell
npm run check
npm run explain
npm run sync
```

正常断开：在 Magpie Agents 页关闭 **DeepSeek Bot**。同步器会清理专用供应商及其凭据。请在移除插件前先断开；若已停用同步器，可运行：

```powershell
npm run restore
```

`restore` 使用记录中的原数据路径，适用于应用刚迁移数据目录的情况。若 Agents 开关仍开启，先关闭再 restore，避免随后再次接入。

插件的桥接文件和清理记录位于 `~/.config/magpie-deepseekbot/`。清理记录保存管理路径和密钥摘要，不保存对话。

## 协议与兼容选项

Magpie 当前 Agent 插件接口未传入原生协议。插件独立构建模型到协议的映射：

1. 每分钟向接入的 Magpie 网关读取一次 `/v1/models`，使用 `native_endpoints` 获取普通模型的原生接口。请求超时 5 秒；失败退避 30 秒，保留最近成功结果最多 5 分钟。
2. 对本机回环网关，读取 Magpie 的 `providers.json`、`settings.json`、`plugin-providers.json`、模型目录缓存，以及界面的供应商状态缓存。解析用户指定协议、供应商端点、每个模型的 SDK 和路由组成员。
3. 普通模型遵循 Magpie 的 Native 选择规则；路由组全部有效成员走 Responses 时归入 Responses，其余归入 Chat。支持嵌套组、循环检测、自动组名称归并和缓存成员关系。动态匹配组缺少展开结果时，诊断显示默认回退。
4. 未取得充分协议信息的模型临时走 Chat，`npm run explain` 显示具体原因。远程网关只使用该网关返回的元数据，不套用本机供应商配置；缺少远程组成员时显示回退。

这些步骤不读取普通 DSH 的配置。旧的 `dshHome` 选项已移除。Magpie 默认配置和缓存目录分别为 `~/.config/magpie`、`~/.cache/magpie`，遵循 `XDG_CONFIG_HOME` / `XDG_CACHE_HOME`；便携版或其他目录请设置插件选项 `magpieConfigDir` 和 `magpieCacheDir`。

命令行工具会读取已安装插件的相同选项。便携版也可使用 `node cli.js status --options C:\path\options.json`；`sync`、`explain`、`restore`、`prune` 同样接受 `--options`。诊断为只读，`sync` 更新配置，`restore` 断开清理，`prune` 只清理升级兼容入口。

相应生成 **Magpie · DS Bot**（Chat）、**Magpie · DS Bot · Responses**、**Magpie · DS Bot · Anthropic**。普通模型只进入匹配的协议组；无模型且无升级兼容入口的组自动移除。

从旧版升级或模型换协议时，旧供应商下保留同 ID 的兼容入口，名称标注“旧接口，建议切换”。在 Bot 设置中切换到新组后，可运行 `npm run prune` 清除旧入口。此操作会使仍选择旧入口的 Bot 需要重新选模型；先根据 `npm run check` 列出的 `compatibilityAliases` 检查。清理后自动同步不会重新创建这些旧入口。插件不读取或改写会话日志来迁移选择。

也可以用 `modelOverrides` 显式指定协议，其优先级高于自动识别。例如：

```json
{
  "modelOverrides": {
    "my-provider/my-model": {
      "api": "openai-responses"
    },
    "anthropic/my-claude": {
      "api": "anthropic-messages",
      "compat": { "forceAdaptiveThinking": true }
    }
  }
}
```

这些选项在 Magpie 的插件选项中设置；同步器会自动使用正确的 Base URL。Bot 设置中选择对应供应商下的模型。切换协议后重新选择模型，因为 DSH 按供应商 ID 和模型 ID 共同定位模型。

输出预算默认为供应商输出上限与上下文四分之一中的较小值，给 DSH 的历史消息和压缩留出空间。模型在 Magpie 明确隐藏后会从插件同步列表移除。

## 验证

```powershell
npm test
node scripts/smoke-magpie.mjs
$env:DS_BOT_EXE = 'C:\Apps\DeepSeek Bot\DeepSeek Bot.exe'
node scripts/smoke-dsh.mjs
node scripts/smoke-dsh.mjs --responses
node scripts/smoke-dsh.mjs --anthropic
node scripts/compare-dsh.mjs
```

`smoke-magpie` 用隔离目录验证真实 Magpie 的安装、接入、同步、断开和移除，目标目录中没有 DSH 安装。`smoke-dsh` 用已安装的 DeepSeek Bot 内置适配器连接本地模拟网关，验证三种协议的模型能力、思考参数和流式响应；通过 `DS_BOT_EXE`、`DS_BOT_ADAPTER` 指定安装位置。

`compare-dsh` 仅为开发验收工具：只读本机 Magpie 已生成的 DSH 分组，与独立计算结果对照。正式插件运行不导入该脚本。

## 工作区与打包

开发需要 Node.js 22 或以上版本。克隆后执行 `npm ci` 安装锁定版本的依赖，再执行 `npm test`。

根目录存放插件入口、包清单、图标和说明；`lib/` 为运行逻辑，`scripts/` 为开发验收与本地安装工具，`test/` 为自动化测试，`licenses/` 为上游许可和署名。

`node_modules/`、`.smoke/` 和 `release/` 分别保存依赖、临时验收文件和本地构建产物，均由 Git 忽略。实际网关密钥与用户配置保存在用户数据目录，不应复制进源码仓库。

执行 `npm pack --dry-run` 检查分发文件；需要生成本地安装包时执行 `npm pack --pack-destination release`（先创建 `release/`）。当前版本为预览版，验收范围见 `VALIDATION.md`。

实现依据：

- [DeepSeek Bot v0.2.0](https://github.com/Fei2411/DeepSeek-Bot/releases/tag/v0.2.0)
- [数据位置与首次启动](https://github.com/Fei2411/DeepSeek-Bot/blob/ae63b45c0d0e75b5f59fc3042b5043761ee41391/app/src/first-run.mjs)
- [ds-bot profile](https://github.com/Fei2411/DeepSeek-Bot/blob/ae63b45c0d0e75b5f59fc3042b5043761ee41391/app/src/profile.mjs)
- [Magpie Agent 插件协议](https://github.com/yetone/magpie/blob/main/internal/agentplug/agentplug.go)

## 隐私

同步器只读取模型协议元数据、管理 DS Bot 模型配置及专用网关凭据。新增的网络请求仅为向配置的网关读取模型列表，不发送对话。它只从 Magpie 本地文件提取协议相关字段，诊断不输出供应商密钥、账号身份或请求正文。桥接文件包含网关密钥，应按凭据文件保管。移植规则的来源与许可见 `THIRD_PARTY_NOTICES.md`。
