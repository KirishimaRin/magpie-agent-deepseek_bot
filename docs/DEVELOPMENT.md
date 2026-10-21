# 开发与验证

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

## 后台服务入口

插件通过 `magpie.agent` 声明 Agent，使用 `magpie.hooks` 启动 Bun 后台同步组件。`bridge.hooks.js` 的 `onRequest` 是空函数；后台同步由 `index.js` 负责。发现分类与已安装页的标签在目标 Magpie 版本中核验。
