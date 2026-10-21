# DeepSeek Bot 图标使用声明

## 来源与权利人

本插件使用 **DeepSeek Bot v0.2.0** 随桌面应用分发的原始 `assets/icon.svg`，用于标识插件所接入的应用。

Copyright 2026 Fei2411 and the DS Bot contributors.

上游仓库：[Fei2411/DeepSeek-Bot](https://github.com/Fei2411/DeepSeek-Bot)。来源版本固定为提交 `ae63b45c0d0e75b5f59fc3042b5043761ee41391`：

- [应用图标生成代码](https://github.com/Fei2411/DeepSeek-Bot/blob/ae63b45c0d0e75b5f59fc3042b5043761ee41391/app/scripts/icon.mjs)
- [鲸鱼图形来源](https://github.com/Fei2411/DeepSeek-Bot/blob/ae63b45c0d0e75b5f59fc3042b5043761ee41391/ds-bot/src/client/characters.js)
- [上游 LICENSE](https://github.com/Fei2411/DeepSeek-Bot/blob/ae63b45c0d0e75b5f59fc3042b5043761ee41391/LICENSE)
- [上游 NOTICE](https://github.com/Fei2411/DeepSeek-Bot/blob/ae63b45c0d0e75b5f59fc3042b5043761ee41391/NOTICE)

## 使用位置与处理方式

| 位置 | 文件或字段 | 用途 |
| --- | --- | --- |
| 插件发现与安装卡片 | `package.json` → `magpie.icon` | 标识接入 DeepSeek Bot 的第三方插件 |
| Agent 列表 | `agent.js` → `agent.icon` | 标识 DeepSeek Bot 接入项 |
| 图标源文件 | `icon.svg` | 保存上游原始 SVG |

图标图形、颜色和文字均未修改。两个显示字段仅将同一 SVG 编码为 Base64 data URI；界面按需要缩放显示。`scripts/import-dsbot-icon.mjs` 用于从本地 DeepSeek Bot 安装中提取并同步这三处内容。

## 许可与分发

图标按 **Apache License, Version 2.0** 使用。本插件随源码和 npm 安装包保留：

- [Apache-2.0 许可证全文](../licenses/DS-Bot-Apache-2.0.txt)。
- [与图标有关的上游署名摘录](../licenses/DS-Bot-NOTICE.txt)。
- [第三方来源与许可说明](../THIRD_PARTY_NOTICES.md)。

本插件自有代码的 MIT 许可证仅覆盖本插件自有代码。再次分发图标或包含图标的安装包时，应保留相应的 Apache-2.0 许可证、版权及署名说明。

## 第三方身份与名称标识

`magpie-agent-deepseek_bot` 是 KirishimaRin 独立开发的第三方适配插件，与 DeepSeek Bot 作者及 DeepSeek 官方无隶属或背书关系。DeepSeek Bot 名称及图标仅用于说明兼容和接入对象。

名称和图标的使用遵循上游 Apache-2.0 第 6 条的商标条款；本插件依据该许可证作兼容对象的来源说明。
