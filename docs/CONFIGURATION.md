# 配置、诊断与恢复

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
