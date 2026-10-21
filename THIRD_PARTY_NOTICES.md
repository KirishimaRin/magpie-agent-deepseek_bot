# Third-party notices

## DS Bot application icon

`icon.svg` and the identical embedded SVG data URIs in `package.json` and
`agent.js` use the original icon distributed with DeepSeek Bot v0.2.0.
The artwork is unmodified. Source generation code:
https://github.com/Fei2411/DeepSeek-Bot/blob/v0.2.0/app/scripts/icon.mjs

Pinned upstream revision: ae63b45c0d0e75b5f59fc3042b5043761ee41391.
The generated whale artwork is sourced by that script from
`ds-bot/src/client/characters.js`. Only Base64 encoding and display scaling
are applied; the icon artwork and original SVG bytes are preserved.

Copyright 2026 Fei2411 and the DS Bot contributors.
Licensed under Apache License, Version 2.0. The complete license is included
in `licenses/DS-Bot-Apache-2.0.txt`; relevant upstream attribution is included
in `licenses/DS-Bot-NOTICE.txt`.

This bridge is an independent third-party integration by KirishimaRin.
It is not affiliated with or endorsed by the DS Bot authors or DeepSeek.
The DS Bot name and icon identify the application this plugin connects to.
Their use follows the trademark provisions in Apache-2.0 section 6.
See `docs/ICON-ATTRIBUTION.md` for the Chinese attribution, usage locations
and redistribution guidance.

## Magpie protocol selection

Protocol selection and model-name normalization in `lib/protocol-resolver.js`
and related inventory handling adapt the behavior of Magpie:
https://github.com/yetone/magpie/tree/f5b0157420a4491f6e707b49a8af8e87ea8050a1

Original sources include internal/provider/provider.go, plugins.go, group.go,
internal/agent/route.go and internal/gateway/anthropic.go. The implementation
has been adapted to JavaScript, adds diagnostics and explicit fallback states,
and obtains metadata without reading DSH configuration files.

MIT License

Copyright (c) 2026 yetone

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

The `yaml` dependency is licensed under ISC; its own LICENSE is included in
node_modules/yaml in the offline ZIP distribution.
