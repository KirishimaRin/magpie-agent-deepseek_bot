# GitHub 发布流程

包名与仓库名均为 `magpie-agent-deepseek_bot`，GitHub 仓库为 `KirishimaRin/magpie-agent-deepseek_bot`。

## 仓库内容

提交插件入口、`lib/`、包清单与锁文件、`icon.svg`、测试、开发脚本、README、`docs/`、MIT 许可证及第三方许可文件。运行文件直接保存在仓库中，安装后无需编译。

`node_modules/`、`.smoke/`、`release/`、个人配置、凭据和桥接状态不进入 Git。

## 发布前本地核验

- 执行 `npm ci` 和 `npm test`。
- 执行 `npm pack --dry-run`，核对入口、图标、文档及第三方许可证均包含在包内。
- 执行 `npm run check:package`，自动核对包名、图标、文档链接和许可证分发内容；GitHub CI 使用 Windows 与 Node.js 22 运行测试及该项检查。
- 执行 `node scripts/smoke-magpie.mjs`，在隔离目录验证安装、接入、同步、断开和移除。
- 按开发文档运行 DeepSeek Bot 内置适配器的三种协议验收。
- 保留 `magpie.agent`、`magpie.icon`，核查后台启动方式；实际分类与图标显示在目标 Magpie 版本中验证。
- 核对图标源文件和两处内嵌数据一致，源码与安装包均保留第三方声明。
- 复核提交文件中的个人路径、密钥和临时资料。

## GitHub 推送与安装核验

1. 核对 `repository`、`homepage`、`bugs` 元信息及 README 中的安装地址与当前仓库一致。
2. 确认 GitHub CI 通过。后续发布 Release 安装包时，应附带 SHA256 校验值。
3. 推送代码；设置 GitHub Topic **`magpie-plugin`**，用于 Magpie 非官方 GitHub 插件发现。
4. 从真实 GitHub 地址在隔离目录安装，验证启用、接入、更新、断开及移除。
5. 在 Magpie 的 **插件 → 发现 → 非官方插件 · GitHub → Agent** 中确认可检索及图标显示。
6. 若本次包含 Release 发布，CI 与线上安装验证通过后，再发布预览版标签和安装包并下载校验。
